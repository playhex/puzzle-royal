import { Container, Graphics, Matrix, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js';
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

const hexagonPoints = (x: number, y: number): number[] => {
    const points = [];

    for (let i = 0; i < 6; ++i) {
        const c = Hex.cornerCoords(i, CELL_RADIUS);

        points.push(x + c.x, y + c.y);
    }

    return points;
};

const hexagon = (g: Graphics, x: number, y: number): Graphics => g.poly(hexagonPoints(x, y)).fill({ color: 0xffffff });

type Drawn = {
    innerView: BoardView;
    cellsLayer: Container;
    cells: Sprite[][];
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
 *
 * Render textures are created once and resized/redrawn in place, never destroyed while displayed:
 * destroying a texture still referenced by a cached GPU bind group can display garbage on some GPUs.
 */
export class AnimatedCellsBoard {
    private drawn: null | Drawn = null;
    private appearances = new Map<number, CellAppearance>();
    private regenerateScheduled = false;
    private boardTexture: null | RenderTexture = null;
    private atlasTexture: null | RenderTexture = null;

    constructor(private gameView: GameView) {
        gameView.on('resized', () => this.regenerateTexture());
        gameView.on('destroyBefore', () => {
            this.drawn = null;
            this.boardTexture?.destroy(true);
            this.atlasTexture?.destroy(true);
            this.boardTexture = this.atlasTexture = null;
        });
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

        // Previous container is destroyed by GameView, render textures are reused
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

        this.drawn = { innerView, cellsLayer, cells, boardsize: ctx.boardsize };
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
        // worldTransform is only updated on render, may be stale right after a resize
        const wt = drawn.cellsLayer.getGlobalTransform(new Matrix(), false);
        const displayScale = Math.hypot(wt.a, wt.b) || 1;
        const resolution = Math.min(4, Math.max(1, displayScale * renderer.resolution));
        const { boardsize } = drawn;

        sides.forEach(s => s.visible = false);

        const bounds = target.getLocalBounds();
        const boardTexture = this.boardTexture = this.renderInto(this.boardTexture, bounds.width, bounds.height, resolution, {
            container: target,
            transform: new Matrix().translate(-bounds.x, -bounds.y),
        });

        sides.forEach((s, i) => s.visible = sidesVisible[i]);

        // Each slot is a hexagon filled with the board texture, no mask/stencil needed
        const atlasContent = new Graphics();

        for (let row = 0; row < boardsize; ++row) {
            for (let col = 0; col < boardsize; ++col) {
                const { x, y } = Hex.coords(row, col);
                const slotX = col * SLOT_W + SLOT_W / 2;
                const slotY = row * SLOT_H + SLOT_H / 2;

                atlasContent.poly(hexagonPoints(slotX, slotY)).fill({
                    texture: boardTexture,
                    textureSpace: 'global',
                    matrix: new Matrix().translate(slotX + bounds.x - x, slotY + bounds.y - y),
                });
            }
        }

        const atlas = this.atlasTexture = this.renderInto(this.atlasTexture, boardsize * SLOT_W, boardsize * SLOT_H, resolution, {
            container: atlasContent,
            transform: new Matrix(),
        });

        atlasContent.destroy();

        for (let row = 0; row < boardsize; ++row) {
            for (let col = 0; col < boardsize; ++col) {
                const cell = drawn.cells[row][col];
                const previous = cell.texture;

                cell.texture = new Texture({
                    source: atlas.source,
                    frame: new Rectangle(col * SLOT_W, row * SLOT_H, SLOT_W, SLOT_H),
                });

                if (previous !== Texture.EMPTY) {
                    previous.destroy(false);
                }
            }
        }
    }

    /**
     * Render a container into a reused render texture, resized if needed.
     */
    private renderInto(
        texture: null | RenderTexture,
        width: number,
        height: number,
        resolution: number,
        options: { container: Container, transform: Matrix },
    ): RenderTexture {
        width = Math.max(1, Math.ceil(width));
        height = Math.max(1, Math.ceil(height));

        if (texture === null) {
            texture = RenderTexture.create({ width, height, resolution, antialias: true });
        } else if (texture.source.width !== width || texture.source.height !== height || texture.source.resolution !== resolution) {
            texture.source.resize(width, height, resolution);
        }

        this.gameView.getPixiApp().renderer.render({ ...options, target: texture, clearColor: [0, 0, 0, 0] });

        return texture;
    }
}
