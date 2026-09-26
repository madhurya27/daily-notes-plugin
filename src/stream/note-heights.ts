/**
 * How many layouts are remembered. Each pane width and font size is a layout
 * of its own, and every note is measured again in each.
 */
const LAYOUTS_KEPT = 4;

/** Heights by path, oldest layout first. */
export type SavedNoteHeights = [layout: string, heights: [path: string, height: number][]][];

/**
 * Each note's last measured height, per layout: what its placeholder reserves
 * until it renders again. An edited note keeps its old height as the guess —
 * nearer than any estimate — and the scroll anchor absorbs the difference.
 */
export class NoteHeights {
    /** Heights by path, per layout; the layout used longest ago comes first. */
    private layouts = new Map<string, Map<string, number>>();
    /** Each layout's median, until one of its heights changes. */
    private readonly medians = new Map<string, number>();

    constructor(
        private readonly changed: () => void = () => {},
        private readonly limit = LAYOUTS_KEPT
    ) {}

    heightOf(layout: string, path: string): number | undefined {
        return this.use(layout)?.get(path);
    }

    keep(layout: string, path: string, height: number): void {
        let heights = this.use(layout);
        if (heights?.get(path) === height) return;
        if (!heights) {
            heights = new Map();
            this.layouts.set(layout, heights);
            if (this.layouts.size > this.limit) this.layouts.delete(this.layouts.keys().next().value!);
        }
        heights.set(path, height);
        this.medians.delete(layout);
        this.changed();
    }

    /** The median of what `layout` measured: note length varies by vault. */
    estimate(layout: string): number | undefined {
        const known = this.medians.get(layout);
        if (known !== undefined) return known;
        const heights = this.layouts.get(layout);
        if (!heights?.size) return undefined;
        const sorted = [...heights.values()].sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1]!;
        this.medians.set(layout, median);
        return median;
    }

    rename(oldPath: string, newPath: string): void {
        this.edit((heights) => {
            const height = heights.get(oldPath);
            if (height === undefined) return false;
            heights.delete(oldPath);
            heights.set(newPath, height);
            return true;
        });
    }

    forget(path: string): void {
        this.edit((heights) => heights.delete(path));
    }

    /** Forgets notes deleted while the plugin was not running to hear it. */
    retainOnly(paths: ReadonlySet<string>): void {
        this.edit((heights) => {
            let removed = false;
            for (const path of heights.keys()) {
                if (!paths.has(path)) removed = heights.delete(path);
            }
            return removed;
        });
    }

    toJSON(): SavedNoteHeights {
        return [...this.layouts].map(([layout, heights]) => [layout, [...heights]]);
    }

    /** Replaces what it holds with `saved`, or with nothing when `saved` is not what `toJSON` wrote. */
    restore(saved: unknown): void {
        this.layouts = isSaved(saved)
            ? new Map(saved.map(([layout, heights]) => [layout, new Map(heights)]))
            : new Map<string, Map<string, number>>();
        this.medians.clear();
    }

    /** `layout`'s heights, moved to the back of the line to be forgotten. */
    private use(layout: string): Map<string, number> | undefined {
        const heights = this.layouts.get(layout);
        if (heights) {
            this.layouts.delete(layout);
            this.layouts.set(layout, heights);
        }
        return heights;
    }

    /** Applies `change` to every layout; true from it means that layout changed. */
    private edit(change: (heights: Map<string, number>) => boolean): void {
        let changed = false;
        for (const [layout, heights] of this.layouts) {
            if (!change(heights)) continue;
            this.medians.delete(layout);
            changed = true;
        }
        if (changed) this.changed();
    }
}

function isSaved(value: unknown): value is SavedNoteHeights {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                Array.isArray(entry) &&
                typeof entry[0] === "string" &&
                Array.isArray(entry[1]) &&
                (entry[1] as unknown[]).every(
                    (pair) => Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "number"
                )
        )
    );
}
