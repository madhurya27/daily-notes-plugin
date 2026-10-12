import { TFile, moment, normalizePath } from "obsidian";
import { ParsedDates } from "./parsed-dates";
import { readDateFormat, type DateFormat } from "./daily-note-format";
import type { DailyNoteSettings } from "../obsidian-internals";

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

/** Where `insertSorted` put a note: its index, and whether the stream took it in. */
export interface Insertion {
    index: number;
    inStream: boolean;
}

/** A daily note and the date its name was parsed to, once. */
interface DatedNote {
    file: TFile;
    date: Moment;
}

export class DailyNoteService {
    private sorted: DatedNote[] = [];
    /** How many of the notes, newest first, the stream has loaded. */
    private _streamLength = 0;
    /** The daily-notes config the cache was built from; null before the first build. */
    private builtFrom: string | null = null;
    /** The date format the list was built with; null before the first build. */
    private builtWith: DateFormat | null = null;
    /** The day the filter's "today" was last read on, by the list or by `catchUpDay`. */
    private seenDay: Moment = moment();

    /**
     * `markdownFiles`: the vault's, daily notes among them. `parsedDates`: shared
     * across views, so a later open parses only what is new. `filter`: the
     * notes left out.
     */
    constructor(
        private readonly markdownFiles: () => TFile[],
        private readonly dailyNoteSettings: () => DailyNoteSettings,
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
            this.rebuilt(await this.buildSorted(format), format);
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
        this.rebuilt(await this.buildSorted(format), format);
        return true;
    }

    /**
     * The notes the day's turn may hide or show, once per turn: the last day's,
     * no longer today's, and one made ahead for the new day. Nothing runs at
     * midnight; the next change asks (ADR 0011).
     */
    catchUpDay(): TFile[] {
        const today = moment();
        if (today.isSame(this.seenDay, "day")) return [];
        const seen = this.seenDay;
        this.seenDay = today;
        return this.datedNotes(this.format())
            .filter((note) => note.date.isSame(seen, "day") || note.date.isSame(today, "day"))
            .map((note) => note.file);
    }

    /** A new list starts a new stream. */
    private rebuilt(sorted: DatedNote[], format: DateFormat): void {
        this.sorted = sorted;
        this._streamLength = 0;
        this.builtFrom = this.signature(format);
        this.builtWith = format;
    }

    /** Newest first. */
    getBatch(offset: number, limit: number): TFile[] {
        return this.sorted.slice(offset, offset + limit).map((note) => note.file);
    }

    /** How many of the notes, newest first, the stream has loaded. */
    get streamLength(): number {
        return this._streamLength;
    }

    /** The notes the stream has loaded, newest first. */
    streamedNotes(): TFile[] {
        return this.getBatch(0, this._streamLength);
    }

    /** Loads the next `limit` notes into the stream; returns them, none past the last note. */
    extendStream(limit: number): TFile[] {
        const notes = this.getBatch(this._streamLength, limit);
        this._streamLength += notes.length;
        return notes;
    }

    /** Null when not a daily note, hidden, or already present. Inside the stream, the stream takes the note in. */
    insertSorted(file: TFile): Insertion | null {
        const date = this.parseDate(file, this.format());
        if (!date || this.filter.isHidden(file, date)) return null;

        const index = this.firstIndexOnOrBefore(date.valueOf());
        // A date maps to exactly one path, so the search lands on the duplicate.
        if (this.sorted[index]?.file.path === file.path) return null;

        this.sorted.splice(index, 0, { file, date });
        const inStream = index < this._streamLength;
        if (inStream) this._streamLength++;
        return { index, inStream };
    }

    /** Whether `file` belongs in the list: a daily note the filter, prepared for it afresh, keeps. */
    async belongs(file: TFile): Promise<boolean> {
        const date = this.parseDate(file, this.format());
        if (!date) return false;
        await this.filter.recheck(file);
        return !this.filter.isHidden(file, date);
    }

    /** Whether the filter leaves out any daily note. Walks the vault: for an empty stream only. */
    hidesAny(): boolean {
        return this.datedNotes(this.format()).some((note) => this.filter.isHidden(note.file, note.date));
    }

    /** Returns the removed index, or -1 when absent. Inside the stream, the stream drops it. */
    removeSorted(filePath: string): number {
        const index = this.indexOf(filePath);
        if (index === -1) return index;
        this.sorted.splice(index, 1);
        if (index < this._streamLength) this._streamLength--;
        return index;
    }

    /**
     * Index of the newest note dated on or before `target`, at day
     * granularity; -1 when every note is newer, or the stream is empty.
     */
    indexForDate(target: Moment): number {
        const index = this.firstIndexOnOrBefore(target.clone().startOf("day").valueOf());
        return index < this.sorted.length ? index : -1;
    }

    /** The index of the note at `path`; -1 when absent. */
    indexOf(path: string): number {
        return this.sorted.findIndex((note) => note.file.path === path);
    }

    get length(): number {
        return this.sorted.length;
    }

    /** Every note's date, newest first — the set a jump can land on. Not to be mutated. */
    dates(): Moment[] {
        return this.sorted.map((note) => note.date);
    }

    /** `date` as this vault's filenames spell it, nested formats included. */
    formatDate(date: Moment): string {
        return date.format(this.format().basename);
    }

    /** `text` read as one of this vault's filenames, or null when it is not. */
    parseNoteDate(text: string): Moment | null {
        const date = moment(text, this.format().basename, true);
        return date.isValid() ? date : null;
    }

    /**
     * Binary search of the newest-first cache: the first index whose date is
     * at or before `time`, or `length` when none is.
     */
    private firstIndexOnOrBefore(time: number): number {
        let lo = 0;
        let hi = this.sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.sorted[mid]!.date.valueOf() > time) {
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
        this.seenDay = moment();
        await this.filter.prepare(notes.map((note) => note.file));
        return notes
            .filter((note) => !this.filter.isHidden(note.file, note.date))
            .sort((a, b) => b.date.valueOf() - a.date.valueOf());
    }

    /** Every daily note in the vault, in no order. */
    private datedNotes(format: DateFormat): DatedNote[] {
        // parseDate, as a live create (D-026).
        const files = this.markdownFiles();
        const dates = this.parsedDates.datesOf(files, this.dateSignature(format), (file) =>
            this.parseDate(file, format)
        );
        return files
            .map((file, i) => ({ file, date: dates[i] ?? null }))
            .filter((note): note is DatedNote => note.date !== null);
    }

    /**
     * The list's own: a config write refreshes the service, which rebuilds the
     * list when the format changed. The settings' before the first build.
     */
    private format(): DateFormat {
        return this.builtWith ?? this.readFormat();
    }

    private readFormat(): DateFormat {
        return readDateFormat(this.dailyNoteSettings());
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
        if (format.folder && !normalizePath(file.path).startsWith(`${format.folder}/`)) return null;

        const date = this.parseBasename(file, format);
        if (!date) return null;

        const expectedPath = normalizePath(`${format.folder}/${date.format(format.path)}.md`);
        return normalizePath(file.path) === expectedPath ? date : null;
    }
}
