import { getAllDailyNotes, getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { TFile, moment } from "obsidian";

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

        const files = Object.values(dailyNotes) as TFile[];

        const notesWithDates = files.map(file => ({
            file,
            date: moment(file.basename, basenameFormat, true),
        })).filter(n => n.date.isValid());

        notesWithDates.sort((a, b) => b.date.valueOf() - a.date.valueOf());

        return notesWithDates.map(n => n.file);
    }

    private parseDate(file: TFile) {
        const settings = getDailyNoteSettings();
        const dateFormat = settings.format || "YYYY-MM-DD";
        const basenameFormat = dateFormat.split("/").pop() || "YYYY-MM-DD";
        const date = moment(file.basename, basenameFormat, true);
        return date.isValid() ? date : null;
    }

    // -------------------------------------------------------------------------
    // Legacy static API — kept for backward compatibility during transition.
    // Delegates to a temporary one-shot instance.
    // -------------------------------------------------------------------------

    /** @deprecated Use instance getBatch() instead */
    static getAllNotesSorted(): TFile[] {
        const svc = new DailyNoteService();
        svc.initialize();
        return svc._sorted;
    }

    /** @deprecated Use instance getBatch() instead */
    static getBatch(offset: number, limit: number): TFile[] {
        const svc = new DailyNoteService();
        svc.initialize();
        return svc._sorted.slice(offset, offset + limit);
    }
}
