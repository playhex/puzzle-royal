"""
Generates 7x7 one-move puzzles in Hex Fall puzzle format.

Katahex plays self-play games while Mohex checks their positions, in parallel:
KATAHEX_PROCESSES threads each drive a Katahex process and queue candidate positions,
the main process submits them to a pool of MOHEX_PROCESSES Mohex workers.

Rules:
- positions from Katahex self-play games, MIN_STONES..MAX_STONES stones, game not over,
  deduped in the run (identity / 180 rotation)
- always red to play: blue-to-move positions are mirrored (transpose + swap colors)
- exactly one winning move M (every empty cell played and solved by mohex)
- M does not just fill an own bridge intruded by the opponent (bridge defense)
- not too similar to an existing puzzle (Hex Fall database, same batch): same solution cell
  and at most SIMILAR_MAX_DIFF differing stones, 180 rotation included

Usage (from anywhere):
  python3 -I generator/generate.py <count> [--out FILE] [--no-db] [--seed N]

  --out       output file, default BATCHES_DIR/batch-<n>.json (next free n)
  --no-db     do not compare against the puzzles in database (DATABASE_URL)
  --seed      self-play random seed, default random (Katahex process i uses seed + i)

Then import the written file, the command is printed at the end: pnpm puzzles:import <file>
"""
import argparse
import itertools
import json
import os
import queue
import random
import subprocess
import sys
import threading
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_env_file(path):
    """KEY=value lines into os.environ, without overriding variables already set. Empty values are ignored."""
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        k, sep, v = line.partition('=')
        k, v = k.strip(), v.strip().strip('"\'')
        if sep and v and not os.environ.get(k):
            os.environ[k] = v


def env(key):
    v = os.environ.get(key, '').strip()
    if not v:
        raise RuntimeError('%s is not set, see generator/.env.dist' % key)
    return v


def env_path(key):
    """Path, ~ expanded, relative to the project root."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(root, os.path.expanduser(env(key)))


def env_int(key):
    return int(env(key))


# Configuration: environment > generator/.env (gitignored) > generator/.env.dist (defaults)
# > project .env (DATABASE_URL, empty in .env.dist)
load_env_file(os.path.join(HERE, '.env'))
load_env_file(os.path.join(HERE, '.env.dist'))
load_env_file(os.path.join(ROOT, '.env'))

MOHEX = env_path('MOHEX')
MOHEX_TIMELIMIT = env_int('MOHEX_TIMELIMIT')
MOHEX_PROCESSES = env_int('MOHEX_PROCESSES')
MAX_MOHEX = env_int('MAX_MOHEX')
MIN_STONES = env_int('MIN_STONES')
MAX_STONES = env_int('MAX_STONES')
SIMILAR_MAX_DIFF = env_int('SIMILAR_MAX_DIFF')
BATCHES_DIR = env_path('BATCHES_DIR')
KATAHEX = [env_path('KATAHEX'), 'gtp', '-config', env_path('KATAHEX_CONFIG'), '-model', env_path('KATAHEX_MODEL')]
KATAHEX_PROCESSES = env_int('KATAHEX_PROCESSES')
TEMPERATURES = [float(x) for x in env('SELFPLAY_TEMPERATURES').split(',')]

N = 7
CELLS = [(c, r) for r in range(N) for c in range(N)]
ADJ = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)]


# Board geometry. Cell = (col, row), 0-based. Red connects rows (top/bottom), blue connects columns.

def name(c):
    return chr(97 + c[0]) + str(c[1] + 1)


def cell(n):
    return (ord(n[0]) - 97, int(n[1:]) - 1)


def transpose(c):
    return (c[1], c[0])


def rot(c):
    return (N - 1 - c[0], N - 1 - c[1])


def nbrs(c):
    return {(c[0] + dx, c[1] + dy) for dx, dy in ADJ if 0 <= c[0] + dx < N and 0 <= c[1] + dy < N}


def red_connected(stones):
    """Red stones connect top and bottom rows."""
    todo = [s for s in stones if s[1] == 0]
    seen = set(todo)
    while todo:
        s = todo.pop()
        if s[1] == N - 1:
            return True
        for t in nbrs(s):
            if t in stones and t not in seen:
                seen.add(t)
                todo.append(t)
    return False


class Mohex:
    """Mohex GTP process. Reuse one per worker: each takes ~700 MB (dfpn TT)."""

    def __init__(self):
        self.p = subprocess.Popen([MOHEX], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.cmd('param_game allow_swap 0')
        self.cmd('param_dfpn timelimit %d' % MOHEX_TIMELIMIT)

    def cmd(self, c):
        self.p.stdin.write(c + '\n')
        self.p.stdin.flush()
        lines = []
        while True:
            line = self.p.stdout.readline()
            if line == '':
                raise RuntimeError('mohex died')
            if line.strip() == '':
                if lines:
                    break
                continue
            lines.append(line.strip())
        txt = ' '.join(lines)
        if txt.startswith('?'):
            raise RuntimeError(c + ' -> ' + txt)
        return txt[1:].strip()

    def setup(self, red, blue):
        self.cmd('boardsize %d' % N)
        self.cmd('dfpn-clear-tt')
        for s in red:
            self.cmd('play black ' + name(s))
        for s in blue:
            self.cmd('play white ' + name(s))


class Katahex:
    """Katahex GTP process, only its raw policy is used."""

    def __init__(self):
        self.p = subprocess.Popen(KATAHEX, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.cmd('boardsize %d' % N)

    def cmd(self, c):
        self.p.stdin.write(c + '\n')
        self.p.stdin.flush()
        lines = []
        while True:
            line = self.p.stdout.readline()
            if line == '':
                raise RuntimeError('katahex died')
            if line.strip() == '':
                if lines:
                    break
                continue
            lines.append(line.rstrip('\n'))
        if lines[0].startswith('?'):
            raise RuntimeError(c + ' -> ' + ' '.join(lines))
        return lines

    def policy(self):
        """Raw policy: 7 rows of 7 values after the "policy" line, NAN on occupied cells."""
        lines = self.cmd('kata-raw-nn 0')
        i = next(k for k, line in enumerate(lines) if line.strip() == 'policy')
        rows = [line.split() for line in lines[i + 1:i + 1 + N]]
        return {(c, r): (0.0 if v == 'NAN' else float(v)) for r, row in enumerate(rows) for c, v in enumerate(row)}


# Candidates

def selfplay_game(katahex, rnd):
    """
    One self-play game, list of moves. First move random, then moves sampled from the raw policy
    with a temperature per game (some games cleaner, some sloppier), no swap.
    """
    katahex.cmd('clear_board')
    red, blue, moves = set(), set(), []
    temp = rnd.choice(TEMPERATURES)
    while not red_connected(red) and not red_connected({transpose(x) for x in blue}):
        color = 'black' if len(moves) % 2 == 0 else 'white'
        if not moves:
            c = (rnd.randrange(N), rnd.randrange(N))
        else:
            pol = katahex.policy()
            cells = [c for c in pol if c not in red and c not in blue and pol[c] > 0]
            c = rnd.choices(cells, [pol[c] ** (1 / temp) for c in cells])[0]
        katahex.cmd('play %s %s' % (color, name(c)))
        (red if color == 'black' else blue).add(c)
        moves.append(c)
    return moves


def positions(moves):
    """Yields (red, blue, to_move 'red'|'blue', last move) after each move."""
    red, blue = set(), set()
    for i, c in enumerate(moves):
        (red if i % 2 == 0 else blue).add(c)
        yield set(red), set(blue), 'blue' if i % 2 == 0 else 'red', c


def red_to_move(red, blue, to_move, last):
    if to_move == 'red':
        return red, blue, last
    return {transpose(x) for x in blue}, {transpose(x) for x in red}, transpose(last)


def game_candidates(moves):
    """Candidate positions of a game, red to move, with a dedupe key."""
    for red, blue, to_move, last in positions(moves):
        if not MIN_STONES <= len(red) + len(blue) <= MAX_STONES:
            continue
        r, b, last = red_to_move(red, blue, to_move, last)
        if red_connected(r) or red_connected({transpose(x) for x in b}):
            continue
        key = min((tuple(sorted(map(f, r))), tuple(sorted(map(f, b)))) for f in (lambda x: x, rot))
        yield key, {'red': sorted(r), 'blue': sorted(b), 'last': last}


class Candidates:
    """
    Endless candidate positions from self-play: one thread per Katahex process, positions deduped across
    threads and put in a bounded queue. Threads wait when the queue is full (Mohex is slower than Katahex).
    """

    def __init__(self, processes, seed, maxsize):
        self.queue = queue.Queue(maxsize)
        self.stop = threading.Event()
        self.seen = set()
        self.lock = threading.Lock()
        self.games = itertools.count(1)
        self.threads = [threading.Thread(target=self.run, args=(random.Random(seed + i),), daemon=True)
                        for i in range(processes)]
        for t in self.threads:
            t.start()

    def run(self, rnd):
        katahex = None
        try:
            katahex = Katahex()
            while not self.stop.is_set():
                moves = selfplay_game(katahex, rnd)
                game = next(self.games)
                for key, c in game_candidates(moves):
                    with self.lock:
                        if key in self.seen:
                            continue
                        self.seen.add(key)
                    self.put(dict(c, game=game))
        except Exception as e:
            self.put(e)
        finally:
            if katahex:
                katahex.p.kill()

    def put(self, item):
        while not self.stop.is_set():
            try:
                self.queue.put(item, timeout=0.2)
                return
            except queue.Full:
                pass

    def get(self):
        item = self.queue.get()
        if isinstance(item, Exception):
            raise item
        return item

    def close(self):
        self.stop.set()
        for t in self.threads:
            t.join()


# Checks

def defends_bridge(m, red, blue):
    """M is a carrier cell of a red bridge whose other carrier cell is blue."""
    own = [x for x in nbrs(m) if x in red]
    for i, p in enumerate(own):
        for q in own[i + 1:]:
            if q in nbrs(p):
                continue
            common = nbrs(p) & nbrs(q)
            if len(common) == 2 and any(x in blue for x in common - {m}):
                return True
    return False


mohex = None


def check(c):
    """
    Red has exactly one winning move M, not a bridge defense. Returns c with m, or None.
    Each step rejects early: losing position (~60%), several winning moves, bridge defense.
    """
    global mohex
    if mohex is None:
        mohex = Mohex()
    red, blue = c['red'], c['blue']
    mohex.setup(red, blue)
    if mohex.cmd('dfpn-solve-state black') != 'black':
        return None
    # Proven winning moves, but dominated cells are skipped: only a subset of the winning moves,
    # so more than one means not unique, and every other cell is solved below.
    fast = mohex.cmd('dfpn-solver-find-winning black').split()
    if len(fast) != 1:
        return None
    m = cell(fast[0])
    if defends_bridge(m, set(red), set(blue)):
        return None
    occupied = set(red) | set(blue) | {m}
    for x in CELLS:
        if x in occupied:
            continue
        mohex.cmd('play black ' + name(x))
        w = mohex.cmd('dfpn-solve-state white')
        mohex.cmd('undo')
        if w != 'white':
            return None
    return dict(c, m=m)


# Similarity

def stones_key(red, blue, f=lambda x: x):
    return {('r', f(x)) for x in red} | {('b', f(x)) for x in blue}


def too_similar(p, others):
    for f in (lambda x: x, rot):
        k = stones_key(p['red'], p['blue'], f)
        m = f(p['m'])
        for o in others:
            if o['m'] == m and len(k ^ o['key']) <= SIMILAR_MAX_DIFF:
                return True
    return False


def similarity_entry(red_stones, blue_stones, solution):
    red = [cell(x) for x in red_stones.split()]
    blue = [cell(x) for x in blue_stones.split()]
    return {'key': stones_key(red, blue), 'm': cell(solution)}


def database_url():
    if os.environ.get('DATABASE_URL'):
        return os.environ['DATABASE_URL']
    raise RuntimeError('DATABASE_URL not set (env, generator/.env or .env), use --no-db to skip the database')


def load_db_puzzles():
    """Puzzles of the Hex Fall database, with the mysql client (no python dependency)."""
    url = urlparse(database_url())
    cmd = ['mysql', '-h', url.hostname or '127.0.0.1', '-P', str(url.port or 3306),
           '-u', unquote(url.username or 'root'), unquote(url.path.lstrip('/')), '-N', '-B',
           '-e', 'select red_stones, blue_stones, solution from puzzle']
    env = dict(os.environ, MYSQL_PWD=unquote(url.password or ''))
    out = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if out.returncode != 0:
        raise RuntimeError('cannot read puzzles from database (use --no-db to skip): ' + out.stderr.strip())
    return [similarity_entry(*line.split('\t')) for line in out.stdout.splitlines()]


# Output

def next_batch_file():
    n = 1
    while os.path.exists(os.path.join(BATCHES_DIR, 'batch-%d.json' % n)):
        n += 1
    return os.path.join(BATCHES_DIR, 'batch-%d.json' % n)


def running_mohex():
    out = subprocess.run("ps -eo args | grep -c '[m]ohex/mohex'", shell=True, capture_output=True, text=True)
    return int(out.stdout or 0)


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def generate(count, out, use_db, seed):
    existing = []
    if use_db:
        existing = load_db_puzzles()
        log('existing puzzles in database', len(existing))

    running = running_mohex()
    workers = min(MOHEX_PROCESSES, MAX_MOHEX - running)
    if workers < 1:
        raise RuntimeError('no mohex worker available (%d already running, MAX_MOHEX %d)' % (running, MAX_MOHEX))
    if workers < MOHEX_PROCESSES:
        log('starting %d mohex instead of MOHEX_PROCESSES %d: MAX_MOHEX %d, %d already running'
            % (workers, MOHEX_PROCESSES, MAX_MOHEX, running))
    log('mohex processes', workers, 'katahex processes', KATAHEX_PROCESSES, 'seed', seed)

    # A few positions queued per worker: Katahex plays ahead while Mohex works, without running away
    max_pending = workers * 4
    cands = Candidates(KATAHEX_PROCESSES, seed, max_pending)
    accepted = []
    checked = 0
    pending = set()
    executor = ProcessPoolExecutor(workers)
    try:
        while len(accepted) < count:
            while len(pending) < max_pending:
                pending.add(executor.submit(check, cands.get()))
            done, pending = wait(pending, return_when=FIRST_COMPLETED)
            for f in done:
                r = f.result()
                checked += 1
                if checked % 200 == 0:
                    log('checked', checked, 'accepted', len(accepted))
                if r is None or too_similar(r, existing) or len(accepted) >= count:
                    continue
                accepted.append(r)
                existing.append({'key': stones_key(r['red'], r['blue']), 'm': r['m']})
                log('accepted', len(accepted), '/', count)
    finally:
        cands.close()
        executor.shutdown(cancel_futures=True)
    log('checked', checked, 'accepted', len(accepted))

    puzzles = [{
        'redStones': ' '.join(name(x) for x in p['red']),
        'blueStones': ' '.join(name(x) for x in p['blue']),
        'lastMove': name(p['last']),
        'solution': name(p['m']),
    } for p in accepted]
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w') as f:
        f.write('[\n' + ',\n'.join('    ' + json.dumps(p, separators=(',', ':')) for p in puzzles) + '\n]\n')

    # Relative to the project root, where pnpm runs, when inside it
    path = os.path.abspath(out)
    if path.startswith(ROOT + os.sep):
        path = os.path.relpath(path, ROOT)
    log('\n%d puzzles written to %s, import them with:\n\n    pnpm puzzles:import %s\n' % (len(puzzles), path, path))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('count', type=int)
    parser.add_argument('--out')
    parser.add_argument('--no-db', action='store_true')
    parser.add_argument('--seed', type=int)
    args = parser.parse_args()

    out = args.out or next_batch_file()
    seed = args.seed if args.seed is not None else random.randrange(1 << 31)
    generate(args.count, out, not args.no_db, seed)


if __name__ == '__main__':
    main()
