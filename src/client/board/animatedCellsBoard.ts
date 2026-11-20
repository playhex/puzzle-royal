import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { Hex, type BoardRenderContext, type BoardRenderer, type BoardView, type GameView } from '@playhex/pixi-board';

export type CellAppearance = {
    scale: number;
    alpha: number;

    /** Offset in board local coords (unrotated) */
    offsetX: number;
    offsetY: number;
};

const identity: CellAppearance = { scale: 1, alpha: 1, offsetX: 0, offsetY: 0 };

/** Cells slightly overlap to avoid seams between them */
const CELL_RADIUS = Hex.RADIUS + 0.2;

/** One cell slot in the atlas texture: hexagon bounding box (pointy top), plus margin */
const SLOT_W = Math.ceil(CELL_RADIUS * Math.sqrt(3)) + 4;
const SLOT_H = Math.ceil(CELL_RADIUS * 2) + 4;

const hexagon = (g: Graphics, x: number, y: number): Graphics => {
    const points = [];

    for (let i = 0; i < 6; ++i) {
        const c = Hex.cornerCoords(i, CELL_RADIUS);

        points.push(x + c.x, y + c.y);
    }

    return g.poly(points).fill({ color: 0xffffff });
};

type Drawn = {
    innerView: BoardView;
    cellsLayer: Container;
    cells: Sprite[][];
    atlas: null | Texture;
    boardsize: number;
};

/**
 * Wraps any theme board renderer to make each cell animatable (scale, alpha, offset),
 * without modifying @playhex/pixi-board:
 *
 * - original board is rendered (without sides) into a texture,
 * - cut into hexagons, laid out in an atlas texture, one sprite per cell.
 *   No mask is rendered each frame, and all cells are drawn in a single batch,
 * - original board stays displayed outside cells (inverse mask), so sides and their highlight still work,
 * - shading changes are forwarded to original board, and texture is regenerated.
 */
export class AnimatedCellsBoard {
    private drawn: null | Drawn = null;
    private appearances = new Map<number, CellAppearance>();
    private regenerateScheduled = false;

    constructor(private gameView: GameView) {
        gameView.on('resized', () => this.regenerateTexture());
    }

    wrap(inner: BoardRenderer): BoardRenderer {
        const wrapped: BoardRenderer = Object.assign(
            (ctx: BoardRenderContext) => this.render(inner, ctx),
            inner.load ? { load: inner.load } : {},
        );

        return wrapped;
    }

    setCell(row: number, col: number, appearance: CellAppearance): void {
        this.appearances.set(row * 1000 + col, appearance);

        const cell = this.drawn?.cells[row]?.[col];

        if (cell) {
            this.applyAppearance(cell, row, col, appearance);
        }
    }

    resetAll(): void {
        this.appearances.clear();
        this.drawn?.cells.forEach((line, row) => line.forEach((cell, col) => this.applyAppearance(cell, row, col, identity)));
    }

    private applyAppearance(cell: Sprite, row: number, col: number, a: CellAppearance): void {
        const base = Hex.coords(row, col);

        cell.position.set(base.x + a.offsetX, base.y + a.offsetY);
        cell.scale.set(a.scale);
        cell.alpha = a.alpha;
        cell.visible = a.alpha > 0.001 && a.scale > 0.001;
    }

    private isPixiReady(): boolean {
        try {
            return !!this.gameView.getPixiApp()?.renderer;
        } catch {
            return false;
        }
    }

    private render(inner: BoardRenderer, ctx: BoardRenderContext): BoardView {
        const innerView = inner(ctx);

        // Previous container is destroyed by GameView, not its texture
        this.drawn?.atlas?.destroy(true);
        this.drawn = null;

        if (!this.isPixiReady()) {
            return innerView;
        }

        const container = new Container();
        const sidesHolder = new Container();
        const cellsMask = new Graphics();
        const cellsLayer = new Container();

        for (let row = 0; row < ctx.boardsize; ++row) {
            for (let col = 0; col < ctx.boardsize; ++col) {
                const { x, y } = Hex.coords(row, col);

                hexagon(cellsMask, x, y);
            }
        }

        sidesHolder.addChild(innerView.container);
        sidesHolder.setMask({ mask: cellsMask, inverse: true });
        container.addChild(sidesHolder, cellsMask, cellsLayer);

        const cells: Sprite[][] = [];

        for (let row = 0; row < ctx.boardsize; ++row) {
            cells[row] = [];

            for (let col = 0; col < ctx.boardsize; ++col) {
                const cell = new Sprite({ anchor: 0.5 });

                cellsLayer.addChild(cell);
                cells[row][col] = cell;
                this.applyAppearance(cell, row, col, this.appearances.get(row * 1000 + col) ?? identity);
            }
        }

        this.drawn = { innerView, cellsLayer, cells, atlas: null, boardsize: ctx.boardsize };
        this.regenerateTexture();

        return {
            container,
            sides: innerView.sides,
            setCellShading: (row, col, shading) => {
                innerView.setCellShading?.(row, col, shading);
                this.scheduleRegenerate();
            },
        };
    }

    private scheduleRegenerate(): void {
        if (this.regenerateScheduled) {
            return;
        }

        this.regenerateScheduled = true;

        requestAnimationFrame(() => {
            this.regenerateScheduled = false;
            this.regenerateTexture();
        });
    }

    /**
     * Render original board into a texture, at current display scale to stay sharp,
     * then cut it into an atlas of hexagons, one per cell.
     */
    private regenerateTexture(): void {
        const drawn = this.drawn;

        if (!drawn || !this.isPixiReady()) {
            return;
        }

        const renderer = this.gameView.getPixiApp().renderer;
        const target = drawn.innerView.container;
        const sides = drawn.innerView.sides ?? [];
        const sidesVisible = sides.map(s => s.visible);
        const wt = drawn.cellsLayer.worldTransform;
        const displayScale = Math.hypot(wt.a, wt.b) || 1;
        const resolution = Math.min(4, Math.max(1, displayScale * renderer.resolution));
        const { boardsize } = drawn;

        sides.forEach(s => s.visible = false);

        const bounds = target.getLocalBounds();
        const boardTexture = renderer.generateTexture({ target, resolution, antialias: true });

        sides.forEach((s, i) => s.visible = sidesVisible[i]);

        // Masks are rendered only here, once, not each frame
        const atlasContent = new Container();

        for (let row = 0; row < boardsize; ++row) {
            for (let col = 0; col < boardsize; ++col) {
                const { x, y } = Hex.coords(row, col);
                const slot = new Container();
                const sprite = new Sprite(boardTexture);
                const mask = hexagon(new Graphics(), 0, 0);

                slot.position.set(col * SLOT_W + SLOT_W / 2, row * SLOT_H + SLOT_H / 2);
                sprite.position.set(bounds.x - x, bounds.y - y);
                sprite.mask = mask;
                slot.addChild(sprite, mask);
                atlasContent.addChild(slot);
            }
        }

        const atlas = renderer.generateTexture({
            target: atlasContent,
            frame: new Rectangle(0, 0, boardsize * SLOT_W, boardsize * SLOT_H),
            resolution,
            antialias: true,
        });

        atlasContent.destroy({ children: true });
        boardTexture.destroy(true);

        for (let row = 0; row < boardsize; ++row) {
            for (let col = 0; col < boardsize; ++col) {
                drawn.cells[row][col].texture = new Texture({
                    source: atlas.source,
                    frame: new Rectangle(col * SLOT_W, row * SLOT_H, SLOT_W, SLOT_H),
                });
            }
        }

        drawn.atlas?.destroy(true);
        drawn.atlas = atlas;
    }
}
