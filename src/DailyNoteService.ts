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

export class DailyNoteService {
    private _sorted: TFile[] = [];

    /** Call once on plugin load. */
    initialize(): void {
        this._sorted = this.buildSorted();
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

        let lo = 0;
        let hi = this._sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const midDate = this.parseBasename(this._sorted[mid]!, format);
            if (midDate && midDate.valueOf() > date.valueOf()) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        // A date maps to exactly one path, so the search lands on the duplicate.
        if (this._sorted[lo]?.path === file.path) return -1;

        this._sorted.splice(lo, 0, file);
        return lo;
    }

    /** Returns the removed index, or -1 when absent. */
    removeSorted(filePath: string): number {
        const index = this._sorted.findIndex((f) => f.path === filePath);
        if (index !== -1) this._sorted.splice(index, 1);
        return index;
    }

    get length(): number {
        return this._sorted.length;
    }

    private buildSorted(): TFile[] {
        const format = this.readFormat();

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
