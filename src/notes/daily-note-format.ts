import { getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { normalizePath } from "obsidian";

/** The daily-note naming rules, as Obsidian's daily-notes settings give them. */
export interface DateFormat {
    /** Full format, possibly with folder segments (e.g. `YYYY/MM/YYYY-MM-DD`). */
    path: string;
    /** Last segment only — what the file's basename must match. */
    basename: string;
    /** The daily-notes folder, without leading or trailing slashes; "" when unset. */
    folder: string;
}

export function readDateFormat(): DateFormat {
    const settings = getDailyNoteSettings();
    const path = settings.format || "YYYY-MM-DD";
    return {
        path,
        basename: path.split("/").pop() || "YYYY-MM-DD",
        // Obsidian normalizes an unset folder to "/", hence the trim.
        folder: normalizePath(settings.folder ?? "").replace(/^\/+|\/+$/g, ""),
    };
}
