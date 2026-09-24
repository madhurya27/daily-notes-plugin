import { describe, it, expect, vi } from "vitest";
import { parseYaml } from "obsidian";
import { asCards, rewriteBasesAsCards } from "../src/render/bases-as-cards";

const lines = (...l: string[]) => l.join("\n");

const TABLE = lines("views:", "  - type: table", "    name: Files", "    order:", "      - file.name");

interface View {
    type: string;
    name: string;
}

const views = (definition: string | null): View[] => (parseYaml(definition!) as { views: View[] }).views;

describe("asCards", () => {
    it("draws a table view as cards, keeping the rest of it", () => {
        const [view] = views(asCards(TABLE));

        expect(view).toEqual({ type: "cards", name: "Files", order: ["file.name"] });
    });

    it("keeps what the definition holds besides views", () => {
        const definition = lines("filters: file.hasTag('daily')", TABLE);

        expect(parseYaml(asCards(definition)!)).toMatchObject({ filters: "file.hasTag('daily')" });
    });

    it("leaves a view that is not a table", () => {
        const definition = lines(TABLE, "  - type: map", "    name: Places");

        expect(views(asCards(definition)).map((v) => v.type)).toEqual(["cards", "map"]);
    });

    // An embed names its view; a Base shows its first.
    it("moves the named view first", () => {
        const definition = lines(TABLE, "  - type: table", "    name: Second");

        expect(views(asCards(definition, "Second")).map((v) => v.name)).toEqual(["Second", "Files"]);
    });

    it("keeps the order when the named view is missing", () => {
        const definition = lines(TABLE, "  - type: table", "    name: Second");

        expect(views(asCards(definition, "Gone")).map((v) => v.name)).toEqual(["Files", "Second"]);
    });

    it.each([
        ["no table view", lines("views:", "  - type: cards", "    name: C")],
        ["no views", "filters: file.hasTag('daily')"],
        ["views that are not a list", "views: nope"],
        ["a view that is not a map", lines("views:", "  - table")],
        ["invalid YAML", "views: [unclosed"],
        ["nothing", ""],
    ])("leaves a definition with %s alone", (_case, definition) => {
        expect(asCards(definition)).toBeNull();
    });
});

describe("rewriteBasesAsCards", () => {
    const noBase = () => Promise.resolve(null);

    it("draws a base block as cards", async () => {
        const markdown = lines("Before", "```base", TABLE, "```", "After");

        const rewritten = await rewriteBasesAsCards(markdown, noBase);

        const [before, open, ...rest] = rewritten.split("\n");
        expect([before, open, rest.at(-2), rest.at(-1)]).toEqual(["Before", "```base", "```", "After"]);
        expect(views(rest.slice(0, -2).join("\n"))[0]!.type).toBe("cards");
    });

    it("keeps a block's fence and indent", async () => {
        const indented = TABLE.split("\n").map((l) => `  ${l}`);
        const markdown = lines("  ~~~~ base", ...indented, "  ~~~~");

        const rewritten = (await rewriteBasesAsCards(markdown, noBase)).split("\n");

        expect([rewritten[0], rewritten.at(-1)]).toEqual(["  ~~~~ base", "  ~~~~"]);
        expect(rewritten.slice(1, -1).every((l) => l.startsWith("  "))).toBe(true);
        expect(views(rewritten.slice(1, -1).join("\n"))[0]!.type).toBe("cards");
    });

    // CommonMark strips up to the fence's indent; a line may have less.
    it("reads a line indented less than its fence", async () => {
        const markdown = lines("  ```base", TABLE, "  ```");

        const rewritten = (await rewriteBasesAsCards(markdown, noBase)).split("\n");

        expect(views(rewritten.slice(1, -1).join("\n"))[0]!.type).toBe("cards");
    });

    it("leaves a block it cannot convert as written", async () => {
        const markdown = lines("```base", "views: [unclosed", "```");

        expect(await rewriteBasesAsCards(markdown, noBase)).toBe(markdown);
    });

    it("leaves a base block quoted inside another fence", async () => {
        const markdown = lines("````md", "```base", TABLE, "```", "````");

        expect(await rewriteBasesAsCards(markdown, noBase)).toBe(markdown);
    });

    it("leaves a block that never closes", async () => {
        const markdown = lines("```base", TABLE);

        expect(await rewriteBasesAsCards(markdown, noBase)).toBe(markdown);
    });

    // A shorter or other-character fence is content, not the close.
    it("closes a block only on a matching fence", async () => {
        const markdown = lines("````base", TABLE, "```", "~~~~", "````");

        const rewritten = await rewriteBasesAsCards(markdown, noBase);

        expect(rewritten).toBe(markdown);
    });

    it("draws an embedded Base as a cards block, its named view first", async () => {
        const readBase = vi.fn().mockResolvedValue(lines(TABLE, "  - type: table", "    name: Second"));

        const rewritten = (await rewriteBasesAsCards(lines("Hi", "![[Views.base#Second|300]]"), readBase)).split("\n");

        expect(readBase).toHaveBeenCalledWith("Views.base");
        expect([rewritten[0], rewritten[1], rewritten.at(-1)]).toEqual(["Hi", "```base", "```"]);
        expect(views(rewritten.slice(2, -1).join("\n")).map((v) => [v.name, v.type])).toEqual([
            ["Second", "cards"],
            ["Files", "cards"],
        ]);
    });

    it.each([
        ["not a Base", null],
        ["a Base it cannot convert", lines("views:", "  - type: cards", "    name: C")],
    ])("leaves an embed of %s", async (_case, definition) => {
        const markdown = "![[Views.base]]";

        expect(await rewriteBasesAsCards(markdown, () => Promise.resolve(definition))).toBe(markdown);
    });

    // A fenced block cannot sit inside a paragraph or a list item.
    it.each(["See ![[Views.base]]", "- ![[Views.base]]", "    ![[Views.base]]"])(
        "leaves an embed that is not alone on its line: %s",
        async (markdown) => {
            const readBase = vi.fn().mockResolvedValue(TABLE);

            expect(await rewriteBasesAsCards(markdown, readBase)).toBe(markdown);
            expect(readBase).not.toHaveBeenCalled();
        }
    );

    it("leaves an embed quoted inside a fence", async () => {
        const readBase = vi.fn().mockResolvedValue(TABLE);
        const markdown = lines("```", "![[Views.base]]", "```");

        expect(await rewriteBasesAsCards(markdown, readBase)).toBe(markdown);
    });
});
