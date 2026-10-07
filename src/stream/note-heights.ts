import { LayoutTable, type SavedLayoutTable } from "./layout-table";

export interface SavedNoteHeights {
    /** Heights by path, oldest layout first. */
    heights: SavedLayoutTable<number>;
    /** Each note's mtime as it was measured. */
    mtimes: [path: string, mtime: number][];
}

/**
 * Each note's last measured height, per layout: what its placeholder reserves
 * until it renders again. A note changed since it was measured is forgotten,
 * and estimated from its text again (ADR 0017).
 */
export class NoteHeights {
    private readonly table: LayoutTable<number>;
    /** Each layout's estimate, until one of its heights changes. */
    private readonly tails = new Map<string, number>();
    private changes = 0;
    private mtimes = new Map<string, number>();

    constructor(
        changed: () => void = () => {},
        /** A note's mtime now; undefined once it is gone. */
        private readonly mtimeOf: (path: string) => number | undefined = () => undefined,
        limit?: number
    ) {
        this.table = new LayoutTable(
            (value): value is number => typeof value === "number",
            (layout) => {
                this.tails.delete(layout);
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
        const mtime = this.mtimeOf(path);
        if (mtime !== undefined) this.mtimes.set(path, mtime);
        const px = Math.round(height * 64) / 64;
        if (this.heightOf(layout, path) !== px) this.table.set(layout, path, px);
    }

    /**
     * A note not measured at `layout`: the 0.9 quantile of what it measured,
     * erring tall, as a glide up past notes taller than reserved runs out of
     * scroll short of the top (D-092). Nothing where it measured nothing.
     */
    estimate(layout: string): number | undefined {
        const known = this.tails.get(layout);
        if (known !== undefined) return known;
        const sorted = this.table.values(layout).sort((a, b) => a - b);
        const tail = sorted[Math.floor(sorted.length * 0.9)];
        if (tail !== undefined) this.tails.set(layout, tail);
        return tail;
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
        const current = new Set([...paths].filter((path) => this.mtimes.get(path) === this.mtimeOf(path)));
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
        this.tails.clear();
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
