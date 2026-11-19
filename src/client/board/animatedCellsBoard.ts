import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { Hex, type BoardRenderContext, type BoardRenderer, type BoardView, type GameView } from '@playhex/pixi-board';

export type CellAppearance = {
    scale: number;
    alpha: number;

    /** Offset in board local coords (unrotated) */
    offsetX: number;
    offsetY: number;
};

const identity: CellAppearance = { scale: 1, alpha: 1, offsetX: 0, offsetY: 0 };

const hexagon = (g: Graphics, x: number, y: number): Graphics => {
    const points = [];

    for (let i = 0; i < 6; ++i) {
        const c = Hex.cornerCoords(i, Hex.RADIUS + 0.2);

        points.push(x + c.x, y + c.y);
    }

    return g.poly(points).fill({ color: 0xffffff });
};

type Drawn = {
    innerView: BoardView;
    cellsLayer: Container;
    cells: Container[][];
    sprites: Sprite[];
    texture: null | Texture;
    boardsize: number;
};

/**
 * Wraps any theme board renderer to make each cell animatable (scale, alpha, offset),
 * without modifying @playhex/pixi-board:
 *
 * - original board is rendered (without sides) into a texture,
 * - cut into one hexagon sprite per cell,
 * - original board stays displayed outside cells (inverse mask), so sides and their highlight still work,
 * - shading changes are forwarded to original board, and texture is regenerated.
 */
export class AnimatedCellsBoard {
    private drawn: null | Drawn = null;
    private appearances = new Map<string, CellAppearance>();
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
        this.appearances.set(`${row},${col}`, appearance);

        const cell = this.drawn?.cells[row]?.[col];

        if (cell) {
            this.applyAppearance(cell, row, col, appearance);
        }
    }

    resetAll(): void {
        this.appearances.clear();
        this.drawn?.cells.forEach((line, row) => line.forEach((cell, col) => this.applyAppearance(cell, row, col, identity)));
    }

    private applyAppearance(cell: Container, row: number, col: number, a: CellAppearance): void {
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
        this.drawn?.texture?.destroy(true);
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

        const cells: Container[][] = [];
        const sprites: Sprite[] = [];

        for (let row = 0; row < ctx.boardsize; ++row) {
            cells[row] = [];

            for (let col = 0; col < ctx.boardsize; ++col) {
                const cell = new Container();
                const sprite = new Sprite();
                const mask = hexagon(new Graphics(), 0, 0);

                cell.addChild(sprite, mask);
                sprite.mask = mask;
                cellsLayer.addChild(cell);
                cells[row][col] = cell;
                sprites.push(sprite);
                this.applyAppearance(cell, row, col, this.appearances.get(`${row},${col}`) ?? identity);
            }
        }

        this.drawn = { innerView, cellsLayer, cells, sprites, texture: null, boardsize: ctx.boardsize };
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
     * Render original board into a texture, at current display scale to stay sharp.
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
        const resolution = Math.min(4, Math.max(1, displayScale * (window.devicePixelRatio || 1)));

        sides.forEach(s => s.visible = false);

        const bounds = target.getLocalBounds();
        const texture = renderer.generateTexture({ target, resolution, antialias: true });

        sides.forEach((s, i) => s.visible = sidesVisible[i]);

        let i = 0;

        for (let row = 0; row < drawn.boardsize; ++row) {
            for (let col = 0; col < drawn.boardsize; ++col) {
                const sprite = drawn.sprites[i++];
                const { x, y } = Hex.coords(row, col);

                sprite.texture = texture;
                sprite.position.set(bounds.x - x, bounds.y - y);
            }
        }

        drawn.texture?.destroy(true);
        drawn.texture = texture;
    }
}
