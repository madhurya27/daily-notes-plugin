/**
 * Which notes link to each path: the metadata cache's `resolvedLinks`, turned
 * around. One per plugin, shared by every view. It inverts on first use and
 * again only after `invalidate()`, so a footer looks its note up without
 * scanning every source.
 */
export class BacklinkIndex {
    private bySource: Map<string, string[]> | null = null;

    constructor(private readonly resolvedLinks: () => Record<string, Record<string, number>>) {}

    /** The paths of the notes linking to `path`, sorted; a note's links to itself left out. */
    sourcesOf(path: string): readonly string[] {
        this.bySource ??= this.invert();
        return this.bySource.get(path) ?? [];
    }

    /** The cache resolved again: the next lookup inverts afresh. */
    invalidate(): void {
        this.bySource = null;
    }

    private invert(): Map<string, string[]> {
        const byTarget = new Map<string, string[]>();
        for (const [source, targets] of Object.entries(this.resolvedLinks())) {
            for (const target of Object.keys(targets)) {
                if (target === source) continue;
                const sources = byTarget.get(target);
                if (sources) sources.push(source);
                else byTarget.set(target, [source]);
            }
        }
        for (const sources of byTarget.values()) sources.sort();
        return byTarget;
    }
}
