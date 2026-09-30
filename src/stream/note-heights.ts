import { LayoutTable, type SavedLayoutTable } from "./layout-table";

/** Heights by path, oldest layout first. */
export type SavedNoteHeights = SavedLayoutTable<number>;

/**
 * Each note's last measured height, per layout: what its placeholder reserves
 * until it renders again. An edited note keeps its old height as the guess —
 * nearer than any estimate — and the scroll anchor absorbs the difference.
 */
export class NoteHeights {
    private readonly table: LayoutTable<number>;
    /** Each layout's median, until one of its heights changes. */
    private readonly medians = new Map<string, number>();
    private changes = 0;

    constructor(changed: () => void = () => {}, limit?: number) {
        this.table = new LayoutTable(
            (value): value is number => typeof value === "number",
            (layout) => {
                this.medians.delete(layout);
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

    /** In whole pixels: sub-pixel digits cost a third of what is stored. */
    keep(layout: string, path: string, height: number): void {
        const px = Math.round(height);
        if (this.heightOf(layout, path) !== px) this.table.set(layout, path, px);
    }

    /** The median of what `layout` measured: note length varies by vault. */
    estimate(layout: string): number | undefined {
        const known = this.medians.get(layout);
        if (known !== undefined) return known;
        const sorted = this.table.values(layout).sort((a, b) => a - b);
        if (sorted.length === 0) return undefined;
        const median = sorted[sorted.length >> 1]!;
        this.medians.set(layout, median);
        return median;
    }

    rename(oldPath: string, newPath: string): void {
        this.table.rename(oldPath, newPath);
    }

    forget(path: string): void {
        this.table.forget(path);
    }

    retainOnly(paths: ReadonlySet<string>): void {
        this.table.retainOnly(paths);
    }

    toJSON(): SavedNoteHeights {
        return this.table.toJSON();
    }

    restore(saved: unknown): void {
        this.table.restore(saved);
        this.medians.clear();
        this.changes++;
    }
}
