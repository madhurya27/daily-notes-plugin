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

/** Measurements by key, the Base used longest ago first. */
export type SavedMeasurements = [key: string, measurement: Measurement][];

/**
 * What the stream's Bases measured, kept across sessions with the notes'
 * heights (ADR 0010): a Base redrawn without the height it left at drops and
 * grows back while Bases refills it. Keys hold the note, width and source, so
 * every view can share them. The Base used longest ago is forgotten first.
 */
export class BaseMeasurements {
    private byKey = new Map<string, Measurement>();

    constructor(
        private readonly changed: () => void = () => {},
        private readonly limit = MEASUREMENTS_KEPT
    ) {}

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

    toJSON(): SavedMeasurements {
        return [...this.byKey];
    }

    /** Replaces what it holds with `saved`, or with nothing when `saved` is not what `toJSON` wrote. */
    restore(saved: unknown): void {
        this.byKey = new Map(isSaved(saved) ? saved : []);
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
        const measurement = this.use(key);
        if (
            measurement &&
            Object.entries(change).every(([field, value]) => measurement[field as keyof Measurement] === value)
        )
            return;
        this.byKey.set(key, { ...measurement, ...change });
        if (this.byKey.size > this.limit) this.byKey.delete(this.byKey.keys().next().value!);
        this.changed();
    }
}

function isSaved(value: unknown): value is SavedMeasurements {
    return (
        Array.isArray(value) &&
        value.every((entry) => Array.isArray(entry) && typeof entry[0] === "string" && isMeasurement(entry[1]))
    );
}

function isMeasurement(value: unknown): value is Measurement {
    if (typeof value !== "object" || value === null) return false;
    const { height, tooWide } = value as Record<string, unknown>;
    return (height === undefined || typeof height === "number") && (tooWide === undefined || tooWide === true);
}
