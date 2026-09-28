import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TFile, moment } from "../mocks/obsidian";
import { __setMockSettings } from "../mocks/daily-notes-interface";
import { EmptyNotes, hideEmptyNotes } from "../../src/notes/empty-notes";
import { BacklinkIndex } from "../../src/notes/backlink-index";

const TEMPLATE = "## Log\n- \n";

/** A vault of `texts` by path, each file's size its text's length. */
function vaultOf(texts: Record<string, string>) {
    const files = new Map<string, TFile>();
    const fileAt = (path: string) => {
        let file = files.get(path);
        if (!file) {
            file = new TFile(path);
            files.set(path, file);
        }
        file.stat = { ...file.stat, size: texts[path]?.length ?? 0 };
        return file;
    };
    const read = vi.fn((file: TFile) => Promise.resolve(texts[file.path] ?? ""));
    const resolve = vi.fn((linkpath: string) => (`${linkpath}.md` in texts ? fileAt(`${linkpath}.md`) : null));
    return { texts, fileAt, read, resolve, notes: new EmptyNotes({ read, resolve }) };
}

/** Rewrites `path`, as a save does: new text, new mtime. */
function write(vault: ReturnType<typeof vaultOf>, path: string, text: string): TFile {
    vault.texts[path] = text;
    const file = vault.fileAt(path);
    file.stat = { ...file.stat, mtime: file.stat.mtime + 1 };
    return file;
}

describe("EmptyNotes", () => {
    beforeEach(() => __setMockSettings({ format: "YYYY-MM-DD", folder: "", template: "Templates/Daily" }));

    it("finds a note holding only its template empty, and a written one not", async () => {
        const vault = vaultOf({ "Templates/Daily.md": TEMPLATE, "a.md": "## Log\n- \n", "b.md": "## Log\n- ran\n" });
        const [a, b] = [vault.fileAt("a.md"), vault.fileAt("b.md")];

        await vault.notes.refresh([a, b]);

        expect(vault.notes.isEmpty(a)).toBe(true);
        expect(vault.notes.isEmpty(b)).toBe(false);
        expect(vault.resolve).toHaveBeenCalledWith("Templates/Daily");
    });

    it("finds nothing empty before it has read the note", () => {
        const vault = vaultOf({ "a.md": "" });

        expect(vault.notes.isEmpty(vault.fileAt("a.md"))).toBe(false);
    });

    it("reads no note bigger than the template by more than a kilobyte", async () => {
        const big = `## Log\n- ${"x".repeat(2048)}`;
        const vault = vaultOf({ "Templates/Daily.md": TEMPLATE, "big.md": big });
        const file = vault.fileAt("big.md");

        await vault.notes.refresh([file]);

        expect(vault.notes.isEmpty(file)).toBe(false);
        expect(vault.read).not.toHaveBeenCalledWith(file);
    });

    it("reads a note again only once it has changed", async () => {
        const vault = vaultOf({ "Templates/Daily.md": TEMPLATE, "a.md": TEMPLATE });
        const a = vault.fileAt("a.md");
        await vault.notes.refresh([a]);
        await vault.notes.refresh([a]);
        expect(vault.read.mock.calls.filter(([file]) => file === a)).toHaveLength(1);

        write(vault, "a.md", "## Log\n- ran\n");
        expect(vault.notes.isEmpty(a)).toBe(false);
        await vault.notes.refresh([a]);

        expect(vault.read.mock.calls.filter(([file]) => file === a)).toHaveLength(2);
        expect(vault.notes.isEmpty(a)).toBe(false);
    });

    it("reads the template once, until it changes, and then every note again", async () => {
        const vault = vaultOf({ "Templates/Daily.md": TEMPLATE, "a.md": TEMPLATE });
        const a = vault.fileAt("a.md");
        await vault.notes.refresh([a]);
        await vault.notes.refresh([a]);
        expect(vault.read).toHaveBeenCalledTimes(2);

        write(vault, "Templates/Daily.md", "## Journal\n");
        await vault.notes.refresh([a]);

        expect(vault.read).toHaveBeenCalledTimes(4);
        expect(vault.notes.isEmpty(a)).toBe(false);
    });

    it("reads every note again under a new template path", async () => {
        const vault = vaultOf({
            "Templates/Daily.md": TEMPLATE,
            "Templates/Journal.md": "## Journal\n",
            "a.md": TEMPLATE,
        });
        const a = vault.fileAt("a.md");
        await vault.notes.refresh([a]);

        __setMockSettings({ format: "YYYY-MM-DD", folder: "", template: "Templates/Journal" });
        await vault.notes.refresh([a]);

        expect(vault.notes.isEmpty(a)).toBe(false);
        expect(vault.notes.templatePath()).toBe("Templates/Journal");
    });

    it.each([
        ["no template set", ""],
        ["no template setting", undefined],
        ["a template that is missing", "Templates/Gone"],
    ])("with %s, finds only blank notes empty", async (_, template) => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "", template });
        const vault = vaultOf({ "a.md": " \n", "b.md": TEMPLATE });
        const [a, b] = [vault.fileAt("a.md"), vault.fileAt("b.md")];

        await vault.notes.refresh([a, b]);

        expect(vault.notes.isEmpty(a)).toBe(true);
        expect(vault.notes.isEmpty(b)).toBe(false);
    });

    it("carries a verdict across a rename, and drops it with a delete", async () => {
        const vault = vaultOf({ "Templates/Daily.md": TEMPLATE, "a.md": TEMPLATE });
        await vault.notes.refresh([vault.fileAt("a.md")]);

        vault.notes.rename("a.md", "b.md");
        const renamed = vault.fileAt("a.md");
        renamed.path = "b.md";
        expect(vault.notes.isEmpty(renamed)).toBe(true);

        vault.notes.forget("b.md");
        expect(vault.notes.isEmpty(renamed)).toBe(false);
    });

    it("ignores a rename of a note it never read", () => {
        const vault = vaultOf({});

        vault.notes.rename("a.md", "b.md");

        expect(vault.notes.isEmpty(new TFile("b.md"))).toBe(false);
    });
});

describe("hideEmptyNotes", () => {
    let settings: { hideEmptyNotes: boolean; showLinkedMentions: boolean };
    let links: Record<string, Record<string, number>>;
    const today = moment("2026-09-28", "YYYY-MM-DD");

    beforeEach(() => {
        settings = { hideEmptyNotes: true, showLinkedMentions: true };
        links = {};
        vi.useFakeTimers({ now: new Date(2026, 8, 28, 12) });
        __setMockSettings({ format: "YYYY-MM-DD", folder: "", template: "Templates/Daily" });
    });

    afterEach(() => vi.useRealTimers());

    /** A filter over a vault holding an empty note of yesterday's and today's. */
    async function filterOver() {
        const vault = vaultOf({ "Templates/Daily.md": TEMPLATE, "2026-09-27.md": "", "2026-09-28.md": "" });
        const filter = hideEmptyNotes(vault.notes, new BacklinkIndex(() => links), () => settings);
        const files = [vault.fileAt("2026-09-27.md"), vault.fileAt("2026-09-28.md")] as const;
        await filter.prepare([...files]);
        return { vault, filter, files };
    }

    it("hides an empty note, but never today's", async () => {
        const { filter, files } = await filterOver();

        expect(filter.isHidden(files[0], today.clone().subtract(1, "day"))).toBe(true);
        expect(filter.isHidden(files[1], today)).toBe(false);
    });

    it("hides nothing, and reads nothing, when turned off", async () => {
        settings.hideEmptyNotes = false;
        const { vault, filter, files } = await filterOver();

        expect(filter.isHidden(files[0], today.clone().subtract(1, "day"))).toBe(false);
        expect(vault.read).not.toHaveBeenCalled();
    });

    // Its linked mentions are content the stream would show under it.
    it("shows an empty note another note links to", async () => {
        links = { "Meeting.md": { "2026-09-27.md": 1 } };
        const { filter, files } = await filterOver();

        expect(filter.isHidden(files[0], today.clone().subtract(1, "day"))).toBe(false);
    });

    it("hides an empty note linked to when linked mentions are off, as nothing would show under it", async () => {
        links = { "Meeting.md": { "2026-09-27.md": 1 } };
        settings.showLinkedMentions = false;
        const { filter, files } = await filterOver();

        expect(filter.isHidden(files[0], today.clone().subtract(1, "day"))).toBe(true);
    });

    it("signs the settings and the template path, which change what is hidden wholesale", async () => {
        const { filter } = await filterOver();
        const signatures = [filter.signature()];

        settings.showLinkedMentions = false;
        signatures.push(filter.signature());
        settings.hideEmptyNotes = false;
        signatures.push(filter.signature());
        __setMockSettings({ format: "YYYY-MM-DD", folder: "", template: "Templates/Journal" });
        signatures.push(filter.signature());

        expect(new Set(signatures).size).toBe(4);
    });
});
