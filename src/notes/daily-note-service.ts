import { getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { TFile, moment, normalizePath } from "obsidian";
import { ParsedDates } from "./parsed-dates";

/** The daily-note naming rules, read once per public operation. */
interface DateFormat {
    /** Full format, possibly with folder segments (e.g. `YYYY/MM/YYYY-MM-DD`). */
    path: string;
    /** Last segment only — what the file's basename must match. */
    basename: string;
    /** Configured daily-notes folder ("" when unset). */
    folder: string;
}

/** `obsidian` exports moment as a value, so the type comes from its return. */
export type Moment = ReturnType<typeof moment>;

/** Which daily notes the stream leaves out. */
export interface NoteFilter {
    /** Makes `isHidden` current for every daily note in `files`: the list is being built. */
    prepare(files: TFile[]): Promise<void>;
    /** Makes `isHidden` current for `file` alone: it, or a link to it, changed. */
    recheck(file: TFile): Promise<void>;
    isHidden(file: TFile, date: Moment): boolean;
    /** Changes when what is hidden may have changed wholesale, so the notes are listed again. */
    signature(): string;
}

/** Hides nothing. */
const SHOW_ALL: NoteFilter = {
    prepare: () => Promise.resolve(),
    recheck: () => Promise.resolve(),
    isHidden: () => false,
    signature: () => "",
};

/** A daily note and the date its name was parsed to, once. */
interface DatedNote {
    file: TFile;
    date: Moment;
}

export class DailyNoteService {
    private _sorted: DatedNote[] = [];
    /** The daily-notes config the cache was built from; null before the first build. */
    private builtFrom: string | null = null;

    /**
     * `markdownFiles`: the vault's, daily notes among them. `parsedDates`: shared
     * across views, so a later open parses only what is new. `filter`: the
     * notes left out.
     */
    constructor(
        private readonly markdownFiles: () => TFile[],
        private readonly parsedDates = new ParsedDates(),
        private readonly filter = SHOW_ALL
    ) {}

    /**
     * Call once per view, on open. A failure lists nothing, rather than leave
     * the view blank, and the next refresh lists again.
     */
    async initialize(): Promise<void> {
        const format = this.readFormat();
        try {
            this._sorted = await this.buildSorted(format);
            this.builtFrom = this.signature(format);
        } catch (error) {
            console.error("DailyNotesStream: Failed to list the daily notes", error);
        }
    }

    /**
     * Rebuilds the cache when Obsidian's daily-notes format or folder changed,
     * which redefines what counts as a daily note, or the filter's signature
     * did. Returns whether it rebuilt.
     */
    async refreshIfSettingsChanged(): Promise<boolean> {
        const format = this.readFormat();
        if (this.signature(format) === this.builtFrom) return false;
        this._sorted = await this.buildSorted(format);
        this.builtFrom = this.signature(format);
        return true;
    }

    /** Newest first. */
    getBatch(offset: number, limit: number): TFile[] {
        return this._sorted.slice(offset, offset + limit).map((note) => note.file);
    }

    /** Returns the insertion index, or -1 when not a daily note, hidden, or already present. */
    insertSorted(file: TFile): number {
        const format = this.readFormat();
        const date = this.parseDate(file, format);
        if (!date || this.filter.isHidden(file, date)) return -1;

        const lo = this.firstIndexOnOrBefore(date.valueOf());
        // A date maps to exactly one path, so the search lands on the duplicate.
        if (this._sorted[lo]?.file.path === file.path) return -1;

        this._sorted.splice(lo, 0, { file, date });
        return lo;
    }

    /** Whether `file` belongs in the list: a daily note the filter, prepared for it afresh, keeps. */
    async belongs(file: TFile): Promise<boolean> {
        const date = this.parseDate(file, this.readFormat());
        if (!date) return false;
        await this.filter.recheck(file);
        return !this.filter.isHidden(file, date);
    }

    /** Whether the filter leaves out any daily note. Walks the vault: for an empty stream only. */
    hidesAny(): boolean {
        return this.datedNotes(this.readFormat()).some((note) => this.filter.isHidden(note.file, note.date));
    }

    /** Returns the removed index, or -1 when absent. */
    removeSorted(filePath: string): number {
        const index = this.indexOf(filePath);
        if (index !== -1) this._sorted.splice(index, 1);
        return index;
    }

    /**
     * Index of the newest note dated on or before `target`, at day
     * granularity; -1 when every note is newer, or the stream is empty.
     */
    indexForDate(target: Moment): number {
        const index = this.firstIndexOnOrBefore(target.clone().startOf("day").valueOf());
        return index < this._sorted.length ? index : -1;
    }

    /** The index of the note at `path`; -1 when absent. */
    indexOf(path: string): number {
        return this._sorted.findIndex((note) => note.file.path === path);
    }

    get length(): number {
        return this._sorted.length;
    }

    /** Every note's date, newest first — the set a jump can land on. Not to be mutated. */
    dates(): Moment[] {
        return this._sorted.map((note) => note.date);
    }

    /** `date` as this vault's filenames spell it, nested formats included. */
    formatDate(date: Moment): string {
        return date.format(this.readFormat().basename);
    }

    /** `text` read as one of this vault's filenames, or null when it is not. */
    parseNoteDate(text: string): Moment | null {
        const date = moment(text, this.readFormat().basename, true);
        return date.isValid() ? date : null;
    }

    /**
     * Binary search of the newest-first cache: the first index whose date is
     * at or before `time`, or `length` when none is.
     */
    private firstIndexOnOrBefore(time: number): number {
        let lo = 0;
        let hi = this._sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this._sorted[mid]!.date.valueOf() > time) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    /** What the list was built from: the date format, and what the filter hides. */
    private signature(format: DateFormat): string {
        return `${this.dateSignature(format)}\u0000${this.filter.signature()}`;
    }

    /** What decides which files are daily notes, and their dates. */
    private dateSignature(format: DateFormat): string {
        return `${format.folder}\u0000${format.path}`;
    }

    private async buildSorted(format: DateFormat): Promise<DatedNote[]> {
        const notes = this.datedNotes(format);
        await this.filter.prepare(notes.map((note) => note.file));
        return notes
            .filter((note) => !this.filter.isHidden(note.file, note.date))
            .sort((a, b) => b.date.valueOf() - a.date.valueOf());
    }

    /** Every daily note in the vault, in no order. */
    private datedNotes(format: DateFormat): DatedNote[] {
        // parseDate, as a live create (docs/DECISIONS.md, D-026).
        const files = this.markdownFiles();
        const dates = this.parsedDates.datesOf(files, this.dateSignature(format), (file) =>
            this.parseDate(file, format)
        );
        return files
            .map((file, i) => ({ file, date: dates[i] ?? null }))
            .filter((note): note is DatedNote => note.date !== null);
    }

    private readFormat(): DateFormat {
        const settings = getDailyNoteSettings();
        const path = settings.format || "YYYY-MM-DD";
        return {
            path,
            basename: path.split("/").pop() || "YYYY-MM-DD",
            folder: settings.folder ?? "",
        };
    }

    /** Parses a markdown file's basename against the date format. */
    private parseBasename(file: TFile, format: DateFormat) {
        if (file.extension !== "md") return null;
        const date = moment(file.basename, format.basename, true);
        return date.isValid() ? date : null;
    }

    /**
     * Vault events fire for every file, so a basename match alone would admit
     * `Attachments/2026-07-07.png`: the date must round-trip back to this path.
     */
    private parseDate(file: TFile, format: DateFormat) {
        // Cheaper than the strict parse below, and most vault files fail it.
        // Obsidian normalizes an unset folder to "/", hence the trim.
        const folder = normalizePath(format.folder).replace(/^\/+|\/+$/g, "");
        if (folder && !normalizePath(file.path).startsWith(`${folder}/`)) return null;

        const date = this.parseBasename(file, format);
        if (!date) return null;

        const expectedPath = normalizePath(`${format.folder}/${date.format(format.path)}.md`);
        return normalizePath(file.path) === expectedPath ? date : null;
    }
}
