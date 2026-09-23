import { getAllDailyNotes, getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { TFile, moment, normalizePath } from "obsidian";

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

export class DailyNoteService {
    private _sorted: TFile[] = [];
    /** The daily-notes config the cache was built from; null before the first build. */
    private builtFrom: string | null = null;

    /** Call once on plugin load. */
    initialize(): void {
        const format = this.readFormat();
        this._sorted = this.buildSorted(format);
        this.builtFrom = this.signature(format);
    }

    /**
     * Rebuilds the cache when Obsidian's daily-notes format or folder changed,
     * which redefines what counts as a daily note. Returns whether it rebuilt.
     */
    refreshIfSettingsChanged(): boolean {
        const format = this.readFormat();
        if (this.signature(format) === this.builtFrom) return false;
        this._sorted = this.buildSorted(format);
        this.builtFrom = this.signature(format);
        return true;
    }

    /** Newest first. */
    getBatch(offset: number, limit: number): TFile[] {
        return this._sorted.slice(offset, offset + limit);
    }

    /** Returns the insertion index, or -1 when not a daily note or already present. */
    insertSorted(file: TFile): number {
        const format = this.readFormat();
        const date = this.parseDate(file, format);
        if (!date) return -1;

        const lo = this.firstIndexOnOrBefore(date.valueOf(), format);
        // A date maps to exactly one path, so the search lands on the duplicate.
        if (this._sorted[lo]?.path === file.path) return -1;

        this._sorted.splice(lo, 0, file);
        return lo;
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
        const index = this.firstIndexOnOrBefore(target.clone().startOf("day").valueOf(), this.readFormat());
        return index < this._sorted.length ? index : -1;
    }

    /** The index of the note at `path`; -1 when absent. */
    indexOf(path: string): number {
        return this._sorted.findIndex((f) => f.path === path);
    }

    get length(): number {
        return this._sorted.length;
    }

    /** Every note's date, newest first — the set a jump can land on. */
    dates(): Moment[] {
        const format = this.readFormat();
        return this._sorted.flatMap((file) => this.parseBasename(file, format) ?? []);
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
     * at or before `time`, or `length` when none is. Unparseable entries sort
     * as oldest, which cannot happen — buildSorted drops them.
     */
    private firstIndexOnOrBefore(time: number, format: DateFormat): number {
        let lo = 0;
        let hi = this._sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const midDate = this.parseBasename(this._sorted[mid]!, format);
            if (midDate && midDate.valueOf() > time) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    private signature(format: DateFormat): string {
        return `${format.folder}\u0000${format.path}`;
    }

    private buildSorted(format: DateFormat): TFile[] {
        // getAllDailyNotes() is already folder-scoped: no path round-trip needed.
        const notesWithDates = Object.values(getAllDailyNotes())
            .map((file) => ({ file, date: this.parseBasename(file, format) }))
            .filter((n): n is { file: TFile; date: NonNullable<typeof n.date> } => n.date !== null);

        notesWithDates.sort((a, b) => b.date.valueOf() - a.date.valueOf());

        return notesWithDates.map((n) => n.file);
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
        const date = this.parseBasename(file, format);
        if (!date) return null;

        const expectedPath = normalizePath(`${format.folder}/${date.format(format.path)}.md`);
        return normalizePath(file.path) === expectedPath ? date : null;
    }
}
