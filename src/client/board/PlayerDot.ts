import { Container, Graphics, Text } from 'pixi.js';
import { BoardEntity, Hex } from '@playhex/pixi-board';

/**
 * A player on the board: own dot is bigger, opaque, with "you" above.
 */
export class PlayerDot extends BoardEntity {
    constructor(
        private color: number,
        private me: boolean,
        private labelText: null | string,
    ) {
        super();
        this.alwaysTop = true;
    }

    protected override draw(): Container {
        const c = new Container();
        const radius = Hex.RADIUS * (this.me ? 0.36 : 0.22);
        const dot = new Graphics().circle(0, 0, radius).fill({ color: this.color });

        if (this.me) {
            dot.stroke({ color: 0xffffff, width: 2.5 });
            dot.circle(0, 0, radius + 2.5).stroke({ color: 0x000000, width: 1, alpha: 0.5 });
        }

        c.addChild(dot);

        if (this.labelText) {
            const text = new Text({
                text: this.labelText,
                anchor: { x: 0.5, y: 1 },
                style: {
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: Hex.RADIUS * 0.6,
                    fontWeight: 'bold',
                    fill: 0xffffff,
                    stroke: { color: 0x000000, width: 3 },
                },
            });

            text.resolution = 3;
            text.position.set(0, -radius - 3);
            c.addChild(text);
        }

        c.alpha = this.me ? 1 : 0.6;

        return c;
    }
}

/**
 * Wraps a Graphics redrawn by Hex Fall (target line, solution highlight) as a board entity.
 */
export class GraphicsEntity extends BoardEntity {
    constructor(readonly graphics: Graphics) {
        super();
    }

    protected override draw(): Container {
        return this.graphics;
    }
}
