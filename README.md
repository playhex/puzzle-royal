# Hex Fall

Online survival game on Hex puzzles, with [PlayHex](https://github.com/playhex/playhex) accounts.

- Each round shows a 7x7 puzzle: red to play, only one winning cell.
- Every player is a dot on the board: stand on the winning cell before time is up (8 seconds), or fall.
- Last survivor wins. Players falling together share the worst place of their group:
  if the last players all fall at the same time, there is no winner.

Node 22, Express, socket.io, Vue 3, MySQL (Drizzle).

## Install

Requires a MySQL database (`CREATE DATABASE hexfall`) and a running PlayHex instance for login.

``` bash
pnpm install
cp .env.dist .env       # variables are documented in .env.dist
pnpm db:migrate
pnpm puzzles:import
```

Create the PlayHex OAuth client (see below), then:

``` bash
pnpm dev
```

and open http://localhost:5173

## PlayHex OAuth client

In the PlayHex repository, create a confidential client, then put `client_id` and `client_secret` in `.env`:

``` bash
pnpm hex oauth:create-client \
    --name "Hex Fall" \
    --author "PlayHex" \
    --logo https://playhex.org/images/logo.png \
    --website http://localhost:5173 \
    --redirect-uri http://localhost:5173/callback \
    --scope "openid read offline_access"
```

Redirect URI must be `APP_URL/callback`.

## Puzzles

``` bash
pnpm puzzles:import [file]
```

Imports a json file containing a list of puzzles, defaults to `fixtures/puzzles.json` (50 example puzzles).
Only new positions are added: running it again never duplicates puzzles nor resets their stats.

7x7 puzzles, red to play and win in one move:

``` json
[
    {
        "redStones": "a7 b3 c3 c5 d5 e3 e4",
        "blueStones": "b6 c6 d2 d3 d4 d6 e5 f6",
        "lastMove": "b6",
        "solution": "a6"
    }
]
```

- `redStones`, `blueStones`: space separated cells.
- `lastMove`: last blue move, highlighted on the board, or `null`.
- `solution`: the only winning move.

## Puzzle stats

``` bash
pnpm puzzles:stats [limit]
```

or `/admin/puzzles` (players listed in `ADMIN_PUBLIC_IDS`).

## Production

``` bash
pnpm build
pnpm start
```

`pnpm start` serves the built client and the API on `PORT`.

## Tests

``` bash
pnpm test
pnpm typecheck
```

## License

[AGPL-3.0](LICENSE)
