import type { CachedMetadata, TFile } from "obsidian";
import type { NoteHeights } from "./note-heights";
import { baseEmbeds, embedCount, wrappedLines } from "./note-lines";
import { probeBeside } from "./column-probe";

/** The note text's font, at one text size. */
export interface TextMetrics {
    /** An average character's width, px. */
    charWidth: number;
    lineHeight: number;
}

/** What an estimate reads besides the stored heights. */
export interface EstimateSources {
    cacheOf(path: string): CachedMetadata | null;
    /** The daily-notes template, if one is set and found. */
    template(): TFile | null;
    /** The note text's metrics as the column now lays it out; null before it does. */
    text(): TextMetrics | null;
    /** What an embed reserves until one is measured at the layout. */
    paneHeight(): number;
}

/** What the stored heights teach, at one text size. */
interface Learned {
    /** Pixels per wrapped line past the template, from text-only notes. */
    perLine: number | undefined;
    /** Pixels per embed, per layout, from notes with embeds measured there. */
    perEmbed: Map<string, number>;
}

/**
 * A placeholder's height for a note with none stored at the layout, from its
 * metadata cache: its height at another width, its text re-wrapped, or the
 * template's height here plus what the note adds to it (D-079). Undefined
 * when neither is known: the caller falls back to the layout's median.
 */
export class HeightEstimates {
    private readonly texts = new Map<string, TextMetrics>();
    private learned: { key: string; value: Learned } | null = null;
    private baseChanges: { key: string; value: Map<string, number> } | null = null;

    constructor(
        private readonly heights: NoteHeights,
        private readonly templates: NoteHeights,
        private readonly sources: EstimateSources
    ) {}

    estimate(layout: string, path: string): number | undefined {
        const here = parse(layout);
        const cache = this.sources.cacheOf(path);
        const text = this.textAt(here.size);
        if (!cache || !text) return undefined;
        return this.rewrapped(layout, path, cache, text) ?? this.fromTemplate(layout, cache, here, text);
    }

    /**
     * Measured at the nearest width of the same text size: that height, plus the
     * lines its text gains here, plus what each Base it embeds changed between
     * the two widths in other notes. Turned wider with a Base whose change is
     * not learned, the template's estimate instead, once measured here (D-081):
     * cards there may be a table here, by far shorter.
     */
    private rewrapped(layout: string, path: string, cache: CachedMetadata, text: TextMetrics): number | undefined {
        const here = parse(layout);
        const [nearest] = this.heights
            .heightsOf(path)
            .map(([layout, height]) => ({ layout, ...parse(layout), height }))
            .filter(({ size }) => size === here.size)
            .sort((a, b) => Math.abs(a.width - here.width) - Math.abs(b.width - here.width));
        if (!nearest) return undefined;
        const changes = this.baseChangesBetween(nearest.layout, layout, text);
        const bases = baseEmbeds(cache);
        const mayShrink = nearest.width < here.width && bases.some((base) => !changes.has(base));
        return (
            (mayShrink ? this.fromTemplate(layout, cache, here, text) : undefined) ??
            nearest.height +
                rewrap(cache, nearest.width, here.width, text) +
                bases.reduce((sum, base) => sum + (changes.get(base) ?? 0), 0)
        );
    }

    /** Per Base, the median change per embed, beyond its text, of notes measured at both layouts. */
    private baseChangesBetween(from: string, to: string, text: TextMetrics): Map<string, number> {
        const key = `${this.heights.revision}\n${from}\n${to}`;
        if (this.baseChanges?.key !== key) this.baseChanges = { key, value: this.learnBaseChanges(from, to, text) };
        return this.baseChanges.value;
    }

    private learnBaseChanges(from: string, to: string, text: TextMetrics): Map<string, number> {
        const [was, is] = [parse(from).width, parse(to).width];
        const changes = new Map<string, number[]>();
        for (const [path, height] of this.heights.entries(to)) {
            const before = this.heights.heightOf(from, path);
            const cache = this.sources.cacheOf(path);
            const bases = cache ? baseEmbeds(cache) : [];
            if (before === undefined || !cache || bases.length === 0) continue;
            const change = (height - before - rewrap(cache, was, is, text)) / bases.length;
            for (const base of bases) changes.set(base, [...(changes.get(base) ?? []), change]);
        }
        return new Map([...changes].map(([base, values]) => [base, median(values)!]));
    }

    /** The template's height here, plus a learned height for each line and embed the note adds to it. */
    private fromTemplate(layout: string, cache: CachedMetadata, here: Layout, text: TextMetrics): number | undefined {
        const template = this.templateAt(layout, here, text);
        if (!template) return undefined;
        const { perLine, perEmbed } = this.learn(here.size, text, template.path);
        const extraLines = wrappedLines(cache, here.width, text.charWidth) - template.lines;
        return (
            template.height +
            extraLines * (perLine ?? text.lineHeight) +
            embedCount(cache) * (perEmbed.get(layout) ?? this.sources.paneHeight())
        );
    }

    /** The template's measured height at `layout`, and the lines it wraps to there. */
    private templateAt(layout: string, at: Layout, text: TextMetrics) {
        const file = this.sources.template();
        if (!file) return null;
        const height = this.templates.heightOf(layout, file.path);
        const cache = this.sources.cacheOf(file.path);
        if (height === undefined || !cache) return null;
        return { path: file.path, height, lines: wrappedLines(cache, at.width, text.charWidth) };
    }

    /** Read from every height at `size` once per change to the heights. */
    private learn(size: string, text: TextMetrics, templatePath: string): Learned {
        const key = `${this.heights.revision}\n${this.templates.revision}\n${size}\n${templatePath}`;
        if (this.learned?.key !== key) this.learned = { key, value: this.learnFrom(size, text, templatePath) };
        return this.learned.value;
    }

    private learnFrom(size: string, text: TextMetrics, templatePath: string): Learned {
        const templateHeights = new Map(this.templates.heightsOf(templatePath));
        const templateCache = this.sources.cacheOf(templatePath)!;
        const measured = this.heights.layouts().flatMap((layout) => {
            const at = parse(layout);
            const template = templateHeights.get(layout);
            if (at.size !== size || template === undefined) return [];
            const templateLines = wrappedLines(templateCache, at.width, text.charWidth);
            return this.heights.entries(layout).flatMap(([path, height]) => {
                const cache = this.sources.cacheOf(path);
                if (!cache) return [];
                const extraLines = wrappedLines(cache, at.width, text.charWidth) - templateLines;
                return [{ layout, added: height - template, extraLines, embeds: embedCount(cache) }];
            });
        });
        const perLine = median(
            measured.filter((m) => m.embeds === 0 && m.extraLines > 0).map((m) => m.added / m.extraLines)
        );
        const perEmbed = new Map<string, number[]>();
        for (const m of measured.filter(({ embeds }) => embeds > 0)) {
            const residual = (m.added - m.extraLines * (perLine ?? text.lineHeight)) / m.embeds;
            perEmbed.set(m.layout, [...(perEmbed.get(m.layout) ?? []), residual]);
        }
        return {
            perLine,
            perEmbed: new Map([...perEmbed].map(([layout, residuals]) => [layout, median(residuals)!])),
        };
    }

    /** Measured once per text size: the column lays text out the same at every width. */
    private textAt(size: string): TextMetrics | null {
        const known = this.texts.get(size);
        if (known) return known;
        const text = this.sources.text();
        if (text) this.texts.set(size, text);
        return text;
    }
}

/** Everyday prose: its average character is a note's. */
const SAMPLE = "Walked to the bakery for sourdough; the owner remembered my order, which made my week.";

/**
 * The note text's metrics, read from a paragraph laid out beside `column` as
 * in a note. Null where nothing lays out, or no canvas measures.
 */
export function measureText(column: HTMLElement): TextMetrics | null {
    const probe = probeBeside(column);
    if (!probe) return null;
    const content = probe
        .createDiv({ cls: "daily-note-block" })
        .createDiv({ cls: "daily-note-content markdown-rendered" });
    const style = getComputedStyle(content.createEl("p", { text: SAMPLE }));
    const { font } = style;
    const lineHeight = parseFloat(style.lineHeight);
    probe.remove();
    const context = document.createElement("canvas").getContext("2d");
    if (!font || !(lineHeight > 0) || !context) return null;
    context.font = font;
    return { charWidth: context.measureText(SAMPLE).width / SAMPLE.length, lineHeight };
}

/** What a note's text adds, in px, going from width `was` to width `is`. */
function rewrap(cache: CachedMetadata, was: number, is: number, text: TextMetrics): number {
    const lines = (width: number) => wrappedLines(cache, width, text.charWidth);
    return (lines(is) - lines(was)) * text.lineHeight;
}

interface Layout {
    width: number;
    size: string;
}

/** A `layoutOf` key back into its width and text size. */
function parse(layout: string): Layout {
    const colon = layout.indexOf(":");
    return { width: Number(layout.slice(0, colon)), size: layout.slice(colon + 1) };
}

function median(values: number[]): number | undefined {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
}
