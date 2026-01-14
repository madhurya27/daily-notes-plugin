import { getAllDailyNotes, getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { TFile, moment } from "obsidian";

export class DailyNoteService {
    /**
     * Retrieves all daily notes from the vault and sorts them by date descending.
     */
    static getAllNotesSorted(): TFile[] {
        const dailyNotes = getAllDailyNotes();
        const settings = getDailyNoteSettings();
        const dateFormat = settings.format || "YYYY-MM-DD";

        // getAllDailyNotes often returns a Record<string, TFile> where the values are TFiles.
        // We extract the files regardless of the container structure.
        const files = Object.values(dailyNotes) as TFile[];

        // If the format contains slashes, it implies folders.
        // We only want to match the filename part against file.basename.
        const basenameFormat = dateFormat.split("/").pop() || "YYYY-MM-DD";

        const notesWithDates = files.map(file => {
            // Parse the date from the filename using the user's configured format
            const date = moment(file.basename, basenameFormat, true);
            return {
                file,
                date,
                isValid: date.isValid()
            };
        });

        // Filter out files that didn't match the date format
        const validNotes = notesWithDates.filter(n => n.isValid);

        // Sort descending
        validNotes.sort((a, b) => {
            return b.date.valueOf() - a.date.valueOf();
        });

        return validNotes.map(n => n.file);
    }

    /**
     * Returns a slice of the sorted daily notes for pagination.
     */
    static getBatch(offset: number, limit: number): TFile[] {
        const allNotes = this.getAllNotesSorted();
        return allNotes.slice(offset, offset + limit);
    }
}