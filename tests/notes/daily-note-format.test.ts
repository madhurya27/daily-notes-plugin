import { describe, it, expect } from "vitest";
import { readDateFormat } from "../../src/notes/daily-note-format";
import { __setMockSettings } from "../mocks/daily-notes-interface";

describe("readDateFormat", () => {
    it("splits a nested format into the path and the filename's part", () => {
        __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD", folder: "Notes" });

        expect(readDateFormat()).toEqual({ path: "YYYY/MM/YYYY-MM-DD", basename: "YYYY-MM-DD", folder: "Notes" });
    });

    it("falls back to YYYY-MM-DD when no format is set", () => {
        __setMockSettings({ format: "", folder: "Notes" });

        expect(readDateFormat()).toMatchObject({ path: "YYYY-MM-DD", basename: "YYYY-MM-DD" });
    });

    it("keeps a filename format when the format ends in a folder", () => {
        __setMockSettings({ format: "YYYY/MM/", folder: "Notes" });

        expect(readDateFormat().basename).toBe("YYYY-MM-DD");
    });

    // Obsidian normalizes an unset folder to "/".
    it.each([
        ["Notes/", "Notes"],
        ["/Notes", "Notes"],
        ["/", ""],
        ["", ""],
        [undefined, ""],
    ])("reads the folder %j as %j", (folder, expected) => {
        __setMockSettings({ format: "YYYY-MM-DD", folder });

        expect(readDateFormat().folder).toBe(expected);
    });
});
