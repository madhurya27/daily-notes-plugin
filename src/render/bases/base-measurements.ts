/**
 * How many Bases are remembered. Each pane width a Base is drawn at is a key
 * of its own, so the plugin's lifetime would otherwise keep them all.
 */
const MEASUREMENTS_KEPT = 500;

interface Measurement {
    /** The height it last held still at. */
    height?: number;
    /** Measured too wide for a table. */
    tooWide?: true;
}

/**
 * What the stream's Bases measured, kept on the plugin: Back rebuilds the view,
 * and a Base redrawn without the height it left at drops and grows back while
 * Bases refills it. Keys hold the note, width and source, so every view can
 * share them. The Base used longest ago is forgotten first.
 */
export class BaseMeasurements {
    private readonly byKey = new Map<string, Measurement>();

    constructor(private readonly limit = MEASUREMENTS_KEPT) {}

    heightOf(key: string): number | undefined {
        return this.use(key)?.height;
    }

    keepHeight(key: string, height: number): void {
        this.update(key, { height });
    }

    isTooWide(key: string): boolean {
        return this.use(key)?.tooWide === true;
    }

    markTooWide(key: string): void {
        this.update(key, { tooWide: true });
    }

    /** `key`'s measurement, moved to the back of the line to be forgotten. */
    private use(key: string): Measurement | undefined {
        const measurement = this.byKey.get(key);
        if (measurement) {
            this.byKey.delete(key);
            this.byKey.set(key, measurement);
        }
        return measurement;
    }

    private update(key: string, change: Measurement): void {
        this.byKey.set(key, { ...this.use(key), ...change });
        if (this.byKey.size > this.limit) this.byKey.delete(this.byKey.keys().next().value!);
    }
}
