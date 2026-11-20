# Puzzle generator

Generates 7x7 one-move puzzles for Hex Fall (red to play, only one winning cell):
Katahex plays self-play games and Mohex checks their positions, in parallel.

Standalone Python 3 script, no dependencies.

## Usage

``` bash
python3 -I generator/generate.py 100
```

`generate.py <count>` writes `generator/batches/batch-<n>.json` (next free `n`, folder `BATCHES_DIR`) in the `pnpm puzzles:import` format.
It logs its progress, ending with the file and the command to import it:

```
100 puzzles written to generator/batches/batch-1.json, import them with:

    pnpm puzzles:import generator/batches/batch-1.json
```

Options:

- `--out FILE`: output file.
- `--no-db`: do not compare against the puzzles already in the Hex Fall database.
  By default they are read with the `mysql` client, from `DATABASE_URL`;
  the script stops if the database cannot be read.
  Puzzle files are never compared against (they may never be imported):
  import a batch before generating the next one, or they may overlap.
- `--seed N`: self-play random seed, random by default (printed at start). Katahex process `i` uses `seed + i`.

Speed with 4 Mohex processes and 500 puzzles in database: ~13 positions checked per second,
1 puzzle accepted per ~100 positions, so ~7 s per puzzle. Fewer puzzles are accepted as the database grows.

## How it works

`KATAHEX_PROCESSES` threads each drive a Katahex process, play games and queue their candidate positions
(deduped across threads). The main process sends them to a pool of `MOHEX_PROCESSES` Mohex worker processes.
The queue holds a few positions per Mohex worker: Katahex plays ahead while Mohex works, and waits when it is full.

One Katahex gives ~85 positions/s, one Mohex checks ~3 positions/s: Mohex is the bottleneck,
add Mohex processes (RAM permitting, ~700 MB each) rather than Katahex ones.

Self-play: first move random, then moves sampled from the Katahex raw policy (`kata-raw-nn`),
with a temperature picked per game in `SELFPLAY_TEMPERATURES`, no swap.
Sloppy games give natural positions with mistakes, so a move to find.

## Configuration

The script reads its variables from [.env.dist](.env.dist), where each one is documented:
Mohex and Katahex paths, number of Mohex and Katahex processes, database, batches folder, self-play and puzzle rules.
Defaults fit a `~/dev/playhex/` checkout.

To override a variable, set it in `generator/.env` (gitignored) or in the environment.
Priority: environment > `generator/.env` > `generator/.env.dist` > project `.env` (for `DATABASE_URL`, empty in `.env.dist`).

Requires Mohex, Katahex, and the `mysql` client for the database similarity check.

## Rules

A position becomes a puzzle when:

- it comes from a self-play game, has 6 to 18 stones (`MIN_STONES`, `MAX_STONES`), and the game is not over;
- red is to play: blue-to-move positions are mirrored (transpose + swap colors);
- red has **exactly one** winning move M: every empty cell is played and solved;
- M is not a bridge defense (filling an own bridge intruded by blue);
- it is not too similar to a puzzle in database or in the same batch:
  same solution and at most 4 differing stones (`SIMILAR_MAX_DIFF`), 180° rotation included.

Positions are deduped within the run (identity / 180° rotation).

Checks are ordered to reject early: solve the position (~60% are losing for red),
then `dfpn-solver-find-winning` must return a single move, then bridge defense, then every other cell is solved,
stopping at the first winning one.

### Pitfall: `dfpn-solver-find-winning` misses winning moves

It only solves the moves left after inferior cell pruning: dominated cells can be winning and are not listed.
So it is only used as a fast reject (more than one move means not unique),
and uniqueness is confirmed by playing every other empty cell and solving with `dfpn-solve-state`.

## Coordinates

Same as Mohex, Katahex and PlayHex: `a1` = column a, row 1.
Red (black for Mohex) connects top and bottom, blue (white) connects left and right.
