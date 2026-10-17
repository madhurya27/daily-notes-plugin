import { LayoutTable, type SavedLayoutTable } from "./layout-table";

export interface SavedNoteHeights {
    /** Heights by path, oldest layout first. */
    heights: SavedLayoutTable<number>;
    /** Each note's mtime as it was measured. */
    mtimes: [path: string, mtime: number][];
}

/** What a note's estimate reads of its file. */
export interface NoteStat {
    mtime: number;
    size: number;
}

/** A layout's estimates, as learned from the heights measured there (D-135). */
interface Learned {
    /** The 0.9 quantile, below the tallest. */
    tail: number;
    /** The most pixels per byte any note measured; none where no note had bytes. */
    densest: number | undefined;
}

/**
 * Each note's last measured height, per layout: what its placeholder reserves
 * until it renders again. A note changed since it was measured is forgotten,
 * and estimated from its text again (ADR 0017).
 */
export class NoteHeights {
    private readonly table: LayoutTable<number>;
    /** What each layout's estimates are learned from, until one of its heights changes. */
    private readonly learned = new Map<string, Learned>();
    private changes = 0;
    private mtimes = new Map<string, number>();

    constructor(
        changed: () => void = () => {},
        /** A note's file as it is now; undefined once it is gone. */
        private readonly statOf: (path: string) => NoteStat | undefined = () => undefined,
        limit?: number
    ) {
        this.table = new LayoutTable(
            (value): value is number => typeof value === "number",
            (layout) => {
                this.learned.delete(layout);
                this.changes++;
                changed();
            },
            limit
        );
    }

    heightOf(layout: string, path: string): number | undefined {
        return this.table.get(layout, path);
    }

    /** `path`'s height in each layout that measured it; reading is no use of a layout. */
    heightsOf(path: string): [layout: string, height: number][] {
        return this.table.valuesOf(path);
    }

    /** Every layout, the one used longest ago first. */
    layouts(): string[] {
        return this.table.layoutNames();
    }

    /** Heights by path at `layout`; reading is no use of it. */
    entries(layout: string): [path: string, height: number][] {
        return this.table.entries(layout);
    }

    /** Changes so far: what was learned from the heights holds while it stays the same. */
    get revision(): number {
        return this.changes;
    }

    /** To the 1/64 pixel the browser lays out in: rounded further, a placeholder is off what renders (D-105). */
    keep(layout: string, path: string, height: number): void {
        const mtime = this.statOf(path)?.mtime;
        if (mtime !== undefined) this.mtimes.set(path, mtime);
        const px = Math.round(height * 64) / 64;
        if (this.heightOf(layout, path) !== px) this.table.set(layout, path, px);
    }

    /**
     * `path`, not measured at `layout`: the 0.9 quantile of what it measured,
     * erring tall, as a glide up past notes taller than reserved runs out of
     * scroll short of the top (D-092), but never the tallest alone. Capped at
     * its size at the densest rate measured, so no long note sets every
     * placeholder, but never below `floor`: a title and frame are no bytes
     * (D-135). Nothing where it measured nothing.
     */
    estimate(layout: string, path: string, floor = 0): number | undefined {
        const learned = this.learn(layout);
        const size = this.statOf(path)?.size;
        if (learned?.densest === undefined || size === undefined) return learned?.tail;
        return Math.min(learned.tail, Math.max(size * learned.densest, floor));
    }

    private learn(layout: string): Learned | undefined {
        const known = this.learned.get(layout);
        if (known !== undefined) return known;
        const entries = this.table.entries(layout);
        const sorted = entries.map(([, height]) => height).sort((a, b) => a - b);
        const belowTallest = Math.min(Math.floor(sorted.length * 0.9), sorted.length - 2);
        const tail = sorted[Math.max(belowTallest, 0)];
        // Stryker disable next-line ConditionalExpression: with no heights there are no rates, and the estimate is undefined either way.
        if (tail === undefined) return undefined;
        const rates = entries.map(([path, height]) => height / (this.statOf(path)?.size ?? 0)).filter(Number.isFinite);
        const learned = { tail, densest: rates.length > 0 ? Math.max(...rates) : undefined };
        this.learned.set(layout, learned);
        return learned;
    }

    rename(oldPath: string, newPath: string): void {
        this.table.rename(oldPath, newPath);
        const mtime = this.mtimes.get(oldPath);
        this.mtimes.delete(oldPath);
        if (mtime !== undefined) this.mtimes.set(newPath, mtime);
    }

    forget(path: string): void {
        this.table.forget(path);
        this.mtimes.delete(path);
    }

    /** Forgets every note not in `paths`, or changed since it was measured. */
    retainOnly(paths: ReadonlySet<string>): void {
        const current = new Set([...paths].filter((path) => this.mtimes.get(path) === this.statOf(path)?.mtime));
        this.table.retainOnly(current);
        for (const path of this.mtimes.keys()) if (!current.has(path)) this.mtimes.delete(path);
    }

    toJSON(): SavedNoteHeights {
        return { heights: this.table.toJSON(), mtimes: [...this.mtimes] };
    }

    /** Replaces what it holds with `saved`, or with nothing when `saved` is not what `toJSON` wrote. */
    restore(saved: unknown): void {
        const valid = isSaved(saved);
        this.table.restore(valid ? saved.heights : undefined);
        this.mtimes = new Map(valid ? saved.mtimes : []);
        this.learned.clear();
        this.changes++;
    }
}

function isSaved(saved: unknown): saved is SavedNoteHeights {
    const { mtimes } = (saved ?? {}) as { mtimes?: unknown };
    return (
        Array.isArray(mtimes) &&
        mtimes.every((entry) => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number")
    );
}
