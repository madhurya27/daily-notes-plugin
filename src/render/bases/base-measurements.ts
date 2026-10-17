import { LayoutTable, type SavedLayoutTable } from "../../stream/layout-table";

interface Measurement {
    /** Measured too wide for a table. */
    tooWide: true;
}

/** A Base in a note, at a layout: its width checked against and text size. */
export interface BaseKey {
    layout: string;
    path: string;
    /** `baseDigest` of what it is drawn from. */
    base: string;
}

/** Measurements by note path and digest, per layout. */
export type SavedMeasurements = SavedLayoutTable<Measurement>;

/**
 * Which Bases were too wide for a table, kept with the notes' heights (ADR 0010),
 * so a Base comes back straight as cards. Its height is its note's to hold.
 */
export class BaseMeasurements {
    private readonly table: LayoutTable<Measurement>;

    constructor(changed: () => void = () => {}, limit?: number) {
        this.table = new LayoutTable(isMeasurement, changed, limit);
    }

    isTooWide(key: BaseKey): boolean {
        return this.get(key)?.tooWide === true;
    }

    markTooWide(key: BaseKey): void {
        if (!this.isTooWide(key)) this.table.set(key.layout, `${key.path}\n${key.base}`, { tooWide: true });
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

    toJSON(): SavedMeasurements {
        return this.table.toJSON();
    }

    restore(saved: unknown): void {
        this.table.restore(saved);
    }

    private get({ layout, path, base }: BaseKey): Measurement | undefined {
        return this.table.get(layout, `${path}\n${base}`);
    }
}

function isMeasurement(value: unknown): value is Measurement {
    // Stryker disable next-line ConditionalExpression: a primitive's tooWide is undefined either way.
    return typeof value === "object" && value !== null && (value as Record<string, unknown>).tooWide === true;
}

/**
 * A few characters standing for the Base a note embeds: its markdown and
 * definition, which can run to kilobytes. cyrb53, 53 bits: a note holds a
 * handful of Bases, so a collision is out of reach.
 */
export function baseDigest(markdown: string, definition: string | null): string {
    // Stryker disable next-line StringLiteral: what stands for no definition need only stay the same.
    const text = `${markdown}\n${definition ?? ""}`;
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    // Stryker disable next-line EqualityOperator: any fixed mix of the text is a digest of it.
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    // Stryker disable next-line ArithmeticOperator: any fixed mix of the text is a digest of it.
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
