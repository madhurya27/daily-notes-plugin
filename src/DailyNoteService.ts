import { getAllDailyNotes } from "obsidian-daily-notes-interface";
import { TFile } from "obsidian";

export class DailyNoteService {
    /**
     * Retrieves all daily notes from the vault and sorts them by date descending.
     */
    static getAllNotesSorted(): TFile[] {
        const dailyNotes = getAllDailyNotes();
        
        // obsidian-daily-notes-interface returns IDailyNote[] which contains { file: TFile, date: Moment }
        // Force treat as any[] or properly cast to avoid TFile cast issues if types are mixed
        const notesArray = Object.values(dailyNotes) as any[];

        notesArray.sort((a, b) => {
            return b.date.valueOf() - a.date.valueOf();
        });

        return notesArray.map(note => note.file);
    }

    /**
     * Returns a slice of the sorted daily notes for pagination.
     */
    static getBatch(offset: number, limit: number): TFile[] {
        const allNotes = this.getAllNotesSorted();
        return allNotes.slice(offset, offset + limit);
    }
}
