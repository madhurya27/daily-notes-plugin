import { getAllDailyNotes, getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { TFile, moment, normalizePath } from "obsidian";

export class DailyNoteService {
    private _sorted: TFile[] = [];

    /**
     * Builds and caches the sorted notes list. Call once on plugin load.
     */
    initialize(): void {
        this._sorted = this.buildSorted();
    }

    /**
     * Returns a paginated slice of the sorted daily notes (newest first).
     */
    getBatch(offset: number, limit: number): TFile[] {
        return this._sorted.slice(offset, offset + limit);
    }

    /**
     * Inserts a file into the sorted cache at the correct position (binary search).
     * Returns the insertion index, or -1 if the file was already present.
     */
    insertSorted(file: TFile): number {
        if (this._sorted.some(f => f.path === file.path)) return -1;
        const date = this.parseDate(file);
        if (!date) return -1;

        let lo = 0;
        let hi = this._sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const midDate = this.parseDate(this._sorted[mid]!);
            if (midDate && midDate.valueOf() > date.valueOf()) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        this._sorted.splice(lo, 0, file);
        return lo;
    }

    /**
     * Removes a file from the sorted cache by path.
     * Returns the removed index, or -1 if not found.
     */
    removeSorted(filePath: string): number {
        const index = this._sorted.findIndex(f => f.path === filePath);
        if (index !== -1) this._sorted.splice(index, 1);
        return index;
    }

    get length(): number {
        return this._sorted.length;
    }

    private buildSorted(): TFile[] {
        const dailyNotes = getAllDailyNotes();
        const settings = getDailyNoteSettings();
        const dateFormat = settings.format || "YYYY-MM-DD";
        const basenameFormat = dateFormat.split("/").pop() || "YYYY-MM-DD";

        const files = Object.values(dailyNotes);

        const notesWithDates = files.map(file => ({
            file,
            date: moment(file.basename, basenameFormat, true),
        })).filter(n => n.date.isValid());

        notesWithDates.sort((a, b) => b.date.valueOf() - a.date.valueOf());

        return notesWithDates.map(n => n.file);
    }

    /**
     * Parses a file's daily-note date, or null if it is not a daily note.
     *
     * Vault events fire for every file, so a basename match alone would let
     * `Attachments/2026-07-07.png` into the cache. The date is round-tripped
     * back into the path the settings imply and must match the file's.
     */
    private parseDate(file: TFile) {
        if (file.extension !== "md") return null;

        const settings = getDailyNoteSettings();
        const dateFormat = settings.format || "YYYY-MM-DD";
        const basenameFormat = dateFormat.split("/").pop() || "YYYY-MM-DD";
        const date = moment(file.basename, basenameFormat, true);
        if (!date.isValid()) return null;

        const folder = settings.folder ?? "";
        const expectedPath = normalizePath(`${folder}/${date.format(dateFormat)}.md`);
        return normalizePath(file.path) === expectedPath ? date : null;
    }
}
