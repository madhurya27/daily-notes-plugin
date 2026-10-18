import { debounce, type TFile } from "obsidian";
import type { NoteFilter } from "./daily-note-service";
import type { Moment } from "./moment";
import { isTemplateOnly, templatePattern } from "./template-match";
import type { BacklinkIndex } from "./backlink-index";
import type { DailyNotesStreamSettings } from "../settings";
import type { DailyNoteSettings } from "../obsidian-internals";
import { saveLoggingOnce } from "../local-storage";

/** How much a note may outgrow its template and still be read: more is writing. */
const READ_MARGIN_BYTES = 1024;

/** The vault, as far as the index reaches into it. */
export interface NoteReader {
    read(file: TFile): Promise<string>;
    /** The file a link to `linkpath` opens, as the daily-notes template is found. */
    resolve(linkpath: string): TFile | null;
}

/** The daily-notes template as last read. */
interface Template {
    /** Its setting, the file it resolved to and that file's mtime: any change reads it again. */
    key: string;
    pattern: RegExp;
    /** The biggest note worth reading. */
    maxBytes: number;
}

interface Verdict {
    mtime: number;
    empty: boolean;
}

/** Where verdicts outlive the session: the vault's localStorage on this device. */
export interface VerdictStore {
    load(): unknown;
    save(value: unknown): void;
}

/** Vault-scoped and per device, as the layout memory is: plugin data would sync it. */
export const EMPTY_NOTES_KEY = "daily-notes-stream:empty-notes";
/** A save that no longer reads what is stored bumps this, and the old one is dropped: it is a cache. */
const VERSION = 1;
/** From the first change of a burst, as the layout memory saves. */
const SAVE_DELAY_MS = 1000;

/** The last session's verdicts, in as little as trusts them. */
interface Saved {
    /** Every verdict was reached under this template. */
    template: string;
    /** When the last check of every note began: a note unchanged since, and not saved empty, was written. */
    checkedAt: number;
    /** Each empty note's mtime: a synced edit may carry an older one than `checkedAt`. */
    empty: Map<string, number>;
}

/**
 * Which daily notes hold only their template (ADR 0011), one per plugin. A
 * verdict is kept per path for the mtime it was read at, so only a note
 * changed since is read again; a changed template drops them all. The empty
 * ones, and when every note was last checked, are saved: the next session
 * reads only what changed since (D-072).
 */
export class EmptyNotes {
    private template: Template | null = null;
    private verdicts = new Map<string, Verdict>();
    private readonly saved: Saved | null;
    /** When this session's last check of every note began; nothing is saved before one. */
    private checkedAt: number | null = null;
    private readonly saveSoon = debounce(() => this.save(), SAVE_DELAY_MS);
    private readonly saveLogged = saveLoggingOnce("which notes are empty");

    constructor(
        private readonly reader: NoteReader,
        private readonly store: VerdictStore,
        private readonly dailyNoteSettings: () => DailyNoteSettings
    ) {
        this.saved = restore(store.load());
    }

    /** The template path the daily-notes settings name. */
    templatePath(): string {
        return this.dailyNoteSettings().template?.trim() ?? "";
    }

    /** `refresh`, for every daily note: what the next session trusts dates from when it began. */
    async checkAll(files: TFile[]): Promise<void> {
        const startedAt = Date.now();
        // A note left unread would be vouched for as written.
        if (!(await this.readStale(files))) return;
        this.checkedAt = startedAt;
        this.saveSoon();
    }

    /** Reads, of `files`, the ones changed since their verdict, small enough to be empty, and not trusted from last session. */
    async refresh(files: TFile[]): Promise<void> {
        await this.readStale(files);
    }

    /**
     * `refresh`; whether it read every note. A read that fails leaves the note
     * without a verdict, so it shows and is read again next time: it may be
     * deleted mid-check, or not yet downloaded.
     */
    private async readStale(files: TFile[]): Promise<boolean> {
        const template = await this.readTemplate();
        if (!template) return false;
        // A template change mid-read replaces the map; these verdicts land in the old one.
        const verdicts = this.verdicts;
        const saved = this.saved?.template === template.key ? this.saved : null;
        const stale = files.filter((file) => verdicts.get(file.path)?.mtime !== file.stat.mtime);
        const read = await Promise.all(
            stale.map(async (file) => {
                // Stryker disable BlockStatement: an empty catch returns undefined, failing `every` as false does.
                try {
                    const empty =
                        file.stat.size <= template.maxBytes &&
                        (trusted(file, saved) ?? isTemplateOnly(await this.reader.read(file), template.pattern));
                    verdicts.set(file.path, { mtime: file.stat.mtime, empty });
                    return true;
                } catch {
                    return false;
                }
                // Stryker restore BlockStatement
            })
        );
        if (stale.length > 0 && this.checkedAt !== null) this.saveSoon();
        return read.every(Boolean);
    }

    /** Whether `file` held only its template when last read; false when unread or changed since. */
    isEmpty(file: TFile): boolean {
        const verdict = this.verdicts.get(file.path);
        return verdict?.mtime === file.stat.mtime && verdict.empty;
    }

    rename(oldPath: string, newPath: string): void {
        moveKey(this.verdicts, oldPath, newPath);
        if (this.saved) moveKey(this.saved.empty, oldPath, newPath);
    }

    forget(path: string): void {
        this.verdicts.delete(path);
    }

    /** Saves a pending change now: the plugin is unloading. */
    flush(): void {
        this.saveSoon.run();
    }

    private save(): void {
        const empty = [...this.verdicts].filter(([, verdict]) => verdict.empty).map(([path, v]) => [path, v.mtime]);
        this.saveLogged(() =>
            this.store.save({ version: VERSION, template: this.template?.key, checkedAt: this.checkedAt, empty })
        );
    }

    /**
     * Resolved as Obsidian resolves a link to it; read again only
     * once changed. Null when it cannot be read: nothing is empty until it is.
     */
    private async readTemplate(): Promise<Template | null> {
        const path = this.templatePath();
        const file = path ? this.reader.resolve(path) : null;
        const key = `${path}\u0000${file?.path}\u0000${file?.stat.mtime}`;
        if (this.template?.key === key) return this.template;

        this.template = null;
        this.verdicts = new Map();
        let text: string | null = null;
        try {
            text = file ? await this.reader.read(file) : null;
        } catch (error) {
            console.error("DailyNotesStream: Failed to read the daily-notes template; hiding no notes", error);
            return null;
        }
        this.template = {
            key,
            pattern: templatePattern(text),
            maxBytes: (file?.stat.size ?? 0) + READ_MARGIN_BYTES,
        };
        return this.template;
    }
}

/** `file`'s verdict as last session left it; undefined when that cannot be trusted, and it must be read. */
function trusted(file: TFile, saved: Saved | null): boolean | undefined {
    if (!saved) return undefined;
    const emptyAt = saved.empty.get(file.path);
    if (emptyAt !== undefined) return emptyAt === file.stat.mtime ? true : undefined;
    return file.stat.mtime <= saved.checkedAt ? false : undefined;
}

function moveKey<V>(map: Map<string, V>, from: string, to: string): void {
    const value = map.get(from);
    if (value === undefined) return;
    map.delete(from);
    map.set(to, value);
}

/** What `save` wrote, or null for anything else. */
function restore(value: unknown): Saved | null {
    // Stryker disable next-line ConditionalExpression: a primitive has no version, and is refused below.
    if (typeof value !== "object" || value === null) return null;
    const { version, template, checkedAt, empty } = value as Record<string, unknown>;
    // Stryker disable next-line ConditionalExpression: a template not a string never matches the current one's key.
    if (version !== VERSION || typeof template !== "string" || typeof checkedAt !== "number") return null;
    if (!Array.isArray(empty)) return null;
    return { template, checkedAt, empty: new Map(empty as [string, number][]) };
}

/**
 * The stream's filter: an empty note is hidden while the setting is on, except
 * today's, which is about to be written in, and one with linked mentions to show.
 */
export function hideEmptyNotes(
    notes: EmptyNotes,
    backlinks: BacklinkIndex,
    settings: () => Pick<DailyNotesStreamSettings, "hideEmptyNotes" | "showLinkedMentions">
): NoteFilter {
    const hasMentions = (file: TFile) => settings().showLinkedMentions && backlinks.sourcesOf(file.path).length > 0;
    return {
        prepare: (files) => (settings().hideEmptyNotes ? notes.checkAll(files) : Promise.resolve()),
        recheck: (file) => (settings().hideEmptyNotes ? notes.refresh([file]) : Promise.resolve()),
        isHidden: (file: TFile, date: Moment) =>
            settings().hideEmptyNotes && notes.isEmpty(file) && !date.isSame(Date.now(), "day") && !hasMentions(file),
        signature: () => {
            const { hideEmptyNotes, showLinkedMentions } = settings();
            return `${hideEmptyNotes}\u0000${showLinkedMentions}\u0000${notes.templatePath()}`;
        },
    };
}
