import { ref } from 'vue';
import type { Socket } from 'socket.io-client';
import { getMedianShift, getNextMeasureDelay, MAX_MEASURES, measureShift, UNSTABLE_MEASURE_INTERVAL } from '../../shared/serverClockShift.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.js';

/**
 * Server time estimation, same approach as PlayHex serverDateStore:
 * median of last measures, measured often until stable, then every minute.
 */
export class ServerClock {
    private shifts: number[] = [];
    private medianShift = 0;
    private timeout: null | ReturnType<typeof setTimeout> = null;

    readonly ping = ref<null | number>(null);
    readonly synced = ref(false);

    constructor(private socket: Socket<ServerToClientEvents, ClientToServerEvents>) {
        socket.on('connect', () => this.measure());

        if (socket.connected) {
            this.measure();
        }
    }

    /** Estimated current server time */
    now(): number {
        return Date.now() - this.medianShift;
    }

    private schedule(delay: number): void {
        if (this.timeout !== null) clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.measure(), delay);
    }

    private measure(): void {
        // Retry later if no answer (lost on disconnection)
        this.schedule(UNSTABLE_MEASURE_INTERVAL);

        // Do not emit while disconnected: socket.io would buffer and send all on reconnection
        if (!this.socket.connected) {
            return;
        }

        const sentAt = Date.now();

        this.socket.emit('getServerTime', serverTime => {
            const receivedAt = Date.now();

            this.ping.value = receivedAt - sentAt;
            this.shifts.push(measureShift(sentAt, receivedAt, serverTime));

            while (this.shifts.length > MAX_MEASURES) {
                this.shifts.shift();
            }

            this.medianShift = getMedianShift(this.shifts);
            this.synced.value = true;
            this.schedule(getNextMeasureDelay(this.shifts));
        });
    }
}
