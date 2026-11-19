import { coordsToMove, parseMove, type Coords, type Move } from '@playhex/move-notation';

/**
 * Board positions are in a cartesian space where the distance between two neighbour cell centers is 1,
 * same orientation as pixi-board unrotated board (Hex.coords): x = col + row / 2, y = row * sqrt(3) / 2.
 *
 * Simulation positions are integers in 1/UNIT of a cell, so that they are exactly the same
 * on server, browsers and replays.
 */
export const UNIT = 10_000;

export const SQRT3_2 = Math.sqrt(3) / 2;

export type Vec = { x: number; y: number };

export const toFixed = (v: number): number => Math.round(v * UNIT);

/** Fixed point center of a cell. */
export const cellCenter = (coords: Coords): Vec => ({
    x: toFixed(coords.col + coords.row / 2),
    y: toFixed(coords.row * SQRT3_2),
});

export const moveCenter = (move: Move): Vec => cellCenter(parseMove(move));

/**
 * Fractional (row, col) from a fixed point position.
 */
export const fractionalCoords = (pos: Vec): { row: number; col: number } => {
    const row = pos.y / UNIT / SQRT3_2;

    return { row, col: pos.x / UNIT - row / 2 };
};

/**
 * Cell containing this position (cube rounding), even outside the board.
 */
export const roundCoords = (pos: Vec): Coords => {
    const { row, col } = fractionalCoords(pos);
    const q = col, r = row, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);

    if (dq > dr && dq > ds) {
        rq = -rr - rs;
    } else if (dr > ds) {
        rr = -rq - rs;
    }

    return { row: rr + 0, col: rq + 0 };
};

export const isOnBoard = (coords: Coords, boardsize: number): boolean =>
    coords.row >= 0 && coords.col >= 0 && coords.row < boardsize && coords.col < boardsize;

/**
 * Cell under this position, or null when outside the board.
 */
export const cellAt = (pos: Vec, boardsize: number): null | Move => {
    const coords = roundCoords(pos);

    return isOnBoard(coords, boardsize) ? coordsToMove(coords) : null;
};

export const distance = (a: Vec, b: Vec): number => {
    const dx = b.x - a.x, dy = b.y - a.y;

    return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Bounding box of allowed targets: board cells centers plus a margin.
 */
export const targetBounds = (boardsize: number, margin: number) => {
    const max = boardsize - 1;

    return {
        minX: toFixed(-margin),
        maxX: toFixed(max + max / 2 + margin),
        minY: toFixed(-margin),
        maxY: toFixed(max * SQRT3_2 + margin),
    };
};

export const clampTarget = (target: Vec, boardsize: number, margin: number): Vec => {
    const b = targetBounds(boardsize, margin);

    return {
        x: Math.min(b.maxX, Math.max(b.minX, Math.round(target.x))),
        y: Math.min(b.maxY, Math.max(b.minY, Math.round(target.y))),
    };
};

/** All neighbour cells on the board. */
export const neighbours = (move: Move, boardsize: number): Move[] => {
    const { row, col } = parseMove(move);

    return [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]]
        .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
        .filter(c => isOnBoard(c, boardsize))
        .map(coordsToMove);
};

export const allMoves = (boardsize: number): Move[] => {
    const moves: Move[] = [];

    for (let row = 0; row < boardsize; ++row) {
        for (let col = 0; col < boardsize; ++col) {
            moves.push(coordsToMove({ row, col }));
        }
    }

    return moves;
};

/** Distance between two cells, in cells (hex distance). */
export const cellDistance = (a: Move, b: Move): number => {
    const ca = parseMove(a), cb = parseMove(b);
    const dq = ca.col - cb.col, dr = ca.row - cb.row;

    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

export const boardCenterMove = (boardsize: number): Move => {
    const c = Math.floor(boardsize / 2);

    return coordsToMove({ row: c, col: c });
};
