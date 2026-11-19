import { Graphics, type FederatedPointerEvent } from 'pixi.js';
import { coordsToMove, parseMove, type Move } from '@playhex/move-notation';
import {
    Anchor44Facade, AutoOrientationFacade, createThemeFromJson, GameView, getBuiltinTheme, Hex, LastMoveMark, resolveTheme,
    type ThemeDefinition,
} from '@playhex/pixi-board';
import { ShadingPatternFacade } from '@playhex/pixi-board/shading-patterns';
import type { BoardSettings } from '../../shared/boardSettings.js';
import { boardCenterMove, cellAt, cellDistance, UNIT, type Vec } from '../../shared/geometry.js';
import type { LiveRound } from '../../shared/protocol.js';
import { getPhaseAt } from '../../shared/simulation/GameSimulation.js';
import { isEliminatedAt, type GameDisplay } from '../game/GameDisplay.js';
import { AnimatedCellsBoard, type CellAppearance } from './animatedCellsBoard.js';
import { GraphicsEntity, PlayerDot } from './PlayerDot.js';

/** Board local pixels for one simulation cell unit */
const CELL_PX = Hex.RADIUS * Math.sqrt(3);

const GROUP_HIGHLIGHT = 'hexfall_highlight';
const GROUP_MARKS = 'hexfall_marks';
const GROUP_TARGETS = 'hexfall_targets';
const GROUP_PLAYERS = 'hexfall_players';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutBack = (p: number) => {
    const c1 = 1.4, c3 = c1 + 1;

    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

/** Stable pseudo random in [0, 1) per cell, so that cells don't all fall at once */
const cellNoise = (move: Move): number => {
    const { row, col } = parseMove(move);
    const n = Math.sin(row * 12.9898 + col * 78.233) * 43758.5453;

    return n - Math.floor(n);
};

const identity: CellAppearance = { scale: 1, alpha: 1, offsetX: 0, offsetY: 0 };

export const getThemeDefinition = (settings: BoardSettings): ThemeDefinition => {
    if (settings.boardTheme === 'custom' && settings.customBoardTheme) {
        try {
            return createThemeFromJson(JSON.parse(settings.customBoardTheme));
        } catch {
            // invalid custom theme: fallback to default theme, like PlayHex
        }
    }

    return getBuiltinTheme(settings.boardTheme ?? undefined);
};

const prefersDark = (): boolean => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;

/**
 * Hex Fall board: puzzle, cells appearing and falling, players dots, precise click.
 */
export class FallBoardView {
    readonly gameView: GameView;
    private animatedCells: AnimatedCellsBoard;
    private anchor44: Anchor44Facade;
    private shading: ShadingPatternFacade;
    private autoOrientation: AutoOrientationFacade;
    private settings: null | BoardSettings = null;
    private mounted = false;

    private shownRound: null | LiveRound = null;
    private stones: Move[] = [];
    private solutionStone: null | Move = null;
    private lastMoveMark: null | LastMoveMark = null;
    private highlight = new Graphics();
    private targetLine = new Graphics();
    private dots: PlayerDot[] = [];
    private dotsPlayersKey = '';
    private displayed: (null | Vec)[] = [];
    private lastFrameAt = 0;

    private display: null | GameDisplay = null;

    constructor(boardsize: number) {
        this.gameView = new GameView(boardsize, { displayCoords: false });
        this.animatedCells = new AnimatedCellsBoard(this.gameView);
        this.anchor44 = new Anchor44Facade(this.gameView, false);
        this.shading = new ShadingPatternFacade(this.gameView);
        this.autoOrientation = new AutoOrientationFacade(this.gameView);

        this.gameView.setGroupZIndex(GROUP_HIGHLIGHT, -5);
        this.gameView.setGroupZIndex(GROUP_MARKS, -4);
        this.gameView.setGroupZIndex(GROUP_TARGETS, 5);
        this.gameView.setGroupZIndex(GROUP_PLAYERS, 10);
        this.gameView.addEntity(new GraphicsEntity(this.highlight), GROUP_HIGHLIGHT);
        this.gameView.addEntity(new GraphicsEntity(this.targetLine), GROUP_TARGETS);
        this.gameView.highlightSides(true, true);
    }

    async mount(element: HTMLElement): Promise<void> {
        await this.gameView.mount(element);
        this.mounted = true;

        const app = this.gameView.getPixiApp();

        app.canvas.style.touchAction = 'none';
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('pointerdown', (e: FederatedPointerEvent) => this.onPointerDown(e));
        app.ticker.add(() => this.renderFrame());

        // Redraw board now that the renderer exists, so cells can be animated
        if (this.settings) {
            this.applySettings(this.settings);
        }
    }

    setDisplay(display: null | GameDisplay): void {
        this.display = display;
        this.shownRound = null;
        this.displayed = [];
        this.dotsPlayersKey = '';
    }

    applySettings(settings: BoardSettings): void {
        this.settings = settings;

        const theme = resolveTheme(getThemeDefinition(settings), prefersDark() ? 'dark' : 'light');

        void this.gameView.setTheme({ ...theme, board: this.animatedCells.wrap(theme.board) });
        this.gameView.setDisplayCoords(settings.showCoords);
        this.anchor44.show44Anchors(settings.show44dots);
        this.shading.setShadingPattern(
            settings.boardShadingPattern as Parameters<ShadingPatternFacade['setShadingPattern']>[0],
            settings.boardShadingPatternIntensity,
            settings.boardShadingPatternOption,
        );
        this.autoOrientation.setPreferredOrientations({
            landscape: settings.orientationLandscape,
            portrait: settings.orientationPortrait,
        });
    }

    destroy(): void {
        this.autoOrientation.destroy();
        this.gameView.destroy();
    }

    /** Pointer position to simulation fixed point coords, whatever board orientation */
    private onPointerDown(e: FederatedPointerEvent): void {
        const display = this.display;

        if (!display?.click) {
            return;
        }

        const local = this.gameView.getGroup(GROUP_PLAYERS).toLocal(e.global);

        display.click({
            x: Math.round(local.x / CELL_PX * UNIT),
            y: Math.round(local.y / CELL_PX * UNIT),
        });
    }

    private toLocal(pos: Vec): { x: number; y: number } {
        return { x: pos.x / UNIT * CELL_PX, y: pos.y / UNIT * CELL_PX };
    }

    /** Screen "down" in unrotated board coords */
    private screenDown(): { x: number; y: number } {
        const rotation = this.gameView.getOrientation() * Math.PI / 6;

        return { x: Math.sin(rotation), y: Math.cos(rotation) };
    }

    private showRound(round: LiveRound): void {
        for (const move of this.stones) {
            this.gameView.setStone(move, null);
        }

        if (this.solutionStone) {
            this.gameView.setStone(this.solutionStone, null);
            this.solutionStone = null;
        }

        this.stones = [...round.puzzle.redStones, ...round.puzzle.blueStones];
        round.puzzle.redStones.forEach(m => this.gameView.setStone(m, 0));
        round.puzzle.blueStones.forEach(m => this.gameView.setStone(m, 1));

        if (this.lastMoveMark) {
            this.gameView.removeEntity(this.lastMoveMark);
            this.lastMoveMark = null;
        }

        if (round.puzzle.lastMove) {
            this.lastMoveMark = new LastMoveMark();
            this.gameView.addEntity(this.lastMoveMark, GROUP_MARKS);
            this.lastMoveMark.setCoords(round.puzzle.lastMove);
        }

        this.highlight.clear();
        this.shownRound = round;
    }

    private ensureDots(display: GameDisplay): void {
        const key = `${display.players.length}:${display.myIdx}:${display.isMe}`;

        if (key === this.dotsPlayersKey) {
            return;
        }

        this.dots.forEach(d => this.gameView.removeEntity(d));
        this.dots = display.players.map((p, idx) => {
            const me = idx === display.myIdx;
            const dot = new PlayerDot(p.color, me, me ? (display.isMe ? 'you' : p.profile.pseudo) : null);

            this.gameView.addEntity(dot, GROUP_PLAYERS);

            return dot;
        });

        // Own dot on top
        if (display.myIdx !== null) {
            this.dots[display.myIdx].zIndex = 1;
            this.gameView.getGroup(GROUP_PLAYERS).sortableChildren = true;
        }

        this.dotsPlayersKey = key;
    }

    /**
     * Appearance of a cell at time t of a round.
     */
    private cellAppearance(move: Move, round: LiveRound, t: number): CellAppearance {
        const { appearAt, playAt, dropAt } = round.times;
        const appearMs = playAt - appearAt;
        const origin = round.origin ?? boardCenterMove(this.gameView.getBoardsize());

        if (t < playAt) {
            if (move === origin && round.origin !== null) {
                return identity;
            }

            const delay = cellDistance(origin, move) / 12 * appearMs * 0.6;
            const p = clamp01((t - appearAt - delay) / (appearMs * 0.4));

            return { scale: easeOutBack(p), alpha: clamp01(p * 1.5), offsetX: 0, offsetY: 0 };
        }

        if (t < dropAt || !round.solution || move === round.solution) {
            return identity;
        }

        return this.fallAppearance(t - dropAt - cellNoise(move) * 250);
    }

    private fallAppearance(elapsed: number): CellAppearance {
        const p = clamp01(elapsed / 900);
        const down = this.screenDown();
        const distance = p * p * Hex.RADIUS * 4;

        return {
            scale: 1 - 0.45 * p,
            alpha: 1 - p * p,
            offsetX: down.x * distance,
            offsetY: down.y * distance,
        };
    }

    private applyToEntity(entity: { position: { set: (x: number, y: number) => void }; scale: { set: (s: number) => void }; alpha: number; visible: boolean }, move: Move, a: CellAppearance): void {
        const base = Hex.coords(parseMove(move).row, parseMove(move).col);

        entity.position.set(base.x + a.offsetX, base.y + a.offsetY);
        entity.scale.set(a.scale);
        entity.alpha = a.alpha;
        entity.visible = a.alpha > 0.001 && a.scale > 0.001;
    }

    private renderFrame(): void {
        const display = this.display;

        if (!display || !this.mounted) {
            return;
        }

        display.tick?.();

        const now = performance.now();
        const dt = Math.min(100, now - this.lastFrameAt);

        this.lastFrameAt = now;

        const t = display.time();
        const phase = getPhaseAt(display.config, Math.max(0, t));
        let round = phase ? display.getRound(phase.roundIndex) : undefined;
        let roundT = Math.max(0, t);

        // Next round not received yet (latency): keep previous round, fully dropped
        if (!round && phase && phase.roundIndex > 0) {
            round = display.getRound(phase.roundIndex - 1);
            roundT = round ? round.times.endAt : roundT;
        }

        this.ensureDots(display);

        if (!round) {
            this.renderPreStart(display);
            return;
        }

        if (this.shownRound?.roundIndex !== round.roundIndex) {
            this.showRound(round);
        }

        this.shownRound = round;

        const boardsize = this.gameView.getBoardsize();
        const appearances = new Map<Move, CellAppearance>();

        for (let row = 0; row < boardsize; ++row) {
            for (let col = 0; col < boardsize; ++col) {
                const move = coordsToMove({ row, col });
                const a = this.cellAppearance(move, round, roundT);

                appearances.set(move, a);
                this.animatedCells.setCell(row, col, a);
            }
        }

        for (const move of this.stones) {
            const stone = this.gameView.getStone(move);

            if (stone) this.applyToEntity(stone, move, appearances.get(move)!);
        }

        if (this.lastMoveMark && round.puzzle.lastMove) {
            this.applyToEntity(this.lastMoveMark, round.puzzle.lastMove, appearances.get(round.puzzle.lastMove)!);
        }

        this.renderSolution(round, roundT);
        this.renderDots(display, round, roundT, t, appearances, dt);
    }

    private renderPreStart(display: GameDisplay): void {
        const boardsize = this.gameView.getBoardsize();

        for (let row = 0; row < boardsize; ++row) {
            for (let col = 0; col < boardsize; ++col) {
                this.animatedCells.setCell(row, col, { scale: 1, alpha: 0.25, offsetX: 0, offsetY: 0 });
            }
        }

        display.players.forEach((_, idx) => {
            const p = this.toLocal(display.simulation.startPositions[idx]);

            this.dots[idx].position.set(p.x, p.y);
            this.dots[idx].visible = true;
        });

        this.targetLine.clear();
    }

    private renderSolution(round: LiveRound, t: number): void {
        this.highlight.clear();

        if (!round.solution || t < round.times.dropAt) {
            return;
        }

        if (this.solutionStone !== round.solution) {
            this.solutionStone = round.solution;
            this.gameView.setStone(round.solution, 0);
        }

        const { row, col } = parseMove(round.solution);
        const c = Hex.coords(row, col);
        const pulse = 0.6 + 0.4 * Math.sin((t - round.times.dropAt) / 120);
        const points: number[] = [];

        for (let i = 0; i < 6; ++i) {
            const corner = Hex.cornerCoords(i, Hex.RADIUS * 0.98);

            points.push(c.x + corner.x, c.y + corner.y);
        }

        this.highlight.poly(points).stroke({ color: 0xffd43b, width: 3.5, alpha: pulse });
    }

    private renderDots(display: GameDisplay, round: LiveRound, roundT: number, t: number, appearances: Map<Move, CellAppearance>, dt: number): void {
        const sim = display.simulation;
        const boardsize = this.gameView.getBoardsize();
        // Smooths other dots corrections (resyncs), short to stay responsive.
        // Own dot is not smoothed: already continuous (see LiveGameModel.ownPosition).
        const smoothing = 1 - Math.exp(-dt / 25);

        this.targetLine.clear();

        display.players.forEach((_, idx) => {
            const dot = this.dots[idx];
            const eliminatedRound = sim.eliminatedRound[idx];

            // Eliminated in a previous round: not displayed anymore
            if (eliminatedRound !== null && eliminatedRound < round.roundIndex) {
                dot.visible = false;
                this.displayed[idx] = null;
                return;
            }

            const own = idx === display.myIdx ? display.ownPosition?.(round.times.dropAt) ?? null : null;
            const target = this.toLocal(own ?? sim.positionAt(idx, Math.min(t, round.times.dropAt)));
            const k = own ? 1 : smoothing;
            const prev = this.displayed[idx];
            const pos = !prev || Math.hypot(prev.x - target.x, prev.y - target.y) > CELL_PX * 1.5
                ? target
                : { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };

            this.displayed[idx] = pos;

            // Falling with its cell
            let fall: CellAppearance = identity;

            if (eliminatedRound === round.roundIndex && isEliminatedAt(display, idx, roundT)) {
                const cell = cellAt({ x: pos.x / CELL_PX * UNIT, y: pos.y / CELL_PX * UNIT }, boardsize);

                fall = cell ? appearances.get(cell) ?? identity : this.fallAppearance(roundT - round.times.dropAt);
            }

            dot.position.set(pos.x + fall.offsetX, pos.y + fall.offsetY);
            dot.scale.set(fall.scale);
            dot.visible = fall.alpha > 0.01;
            dot.alpha = fall.alpha;

            if (idx === display.myIdx && fall === identity && roundT < round.times.dropAt) {
                const pending = display.isMe ? display.pendingTarget?.() : null;
                const to = this.toLocal(pending ?? sim.getTarget(idx));

                this.drawDashedLine(pos, to, display.players[idx].color);
            }
        });
    }

    private drawDashedLine(from: { x: number; y: number }, to: { x: number; y: number }, color: number): void {
        const length = Math.hypot(to.x - from.x, to.y - from.y);

        if (length < 2) {
            return;
        }

        const dash = 4, gap = 4;
        const ux = (to.x - from.x) / length, uy = (to.y - from.y) / length;

        for (let d = 0; d < length; d += dash + gap) {
            const end = Math.min(length, d + dash);

            this.targetLine.moveTo(from.x + ux * d, from.y + uy * d).lineTo(from.x + ux * end, from.y + uy * end);
        }

        this.targetLine.stroke({ color, width: 1.5, alpha: 0.9 });
        this.targetLine.circle(to.x, to.y, 3).stroke({ color, width: 1.5, alpha: 0.9 });
    }
}

