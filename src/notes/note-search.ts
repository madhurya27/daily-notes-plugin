import type { TFile } from "obsidian";

/** The query as typed, case-insensitive; null when blank, which matches nothing. */
export function searchPattern(query: string): RegExp | null {
    if (query.trim() === "") return null;
    return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
}

/**
 * The notes whose title or source hold `query`, in the order given. Source,
 * not rendered text: an unloaded note has none (ADR 0006).
 */
export async function findNotes(
    notes: readonly TFile[],
    read: (file: TFile) => Promise<string>,
    query: string
): Promise<TFile[]> {
    const pattern = searchPattern(query);
    if (!pattern) return [];
    const holds = (text: string) => {
        pattern.lastIndex = 0;
        return pattern.test(text);
    };
    const found = await Promise.all(notes.map(async (file) => holds(file.basename) || holds(await read(file))));
    return notes.filter((_, i) => found[i]);
}
