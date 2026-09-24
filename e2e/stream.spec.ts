import type { Locator } from "@playwright/test";
import { test, expect, openStream, closeSearchPanes, SEEDED_DAYS } from "./obsidian";

test.describe("daily notes stream in real Obsidian", () => {
    test("renders daily notes as real rendered markdown", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await expect(container.locator(".daily-note-block").first()).toBeVisible();
        // Newest first: 2026-03-14 is the most recent seeded note.
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");

        // Obsidian's MarkdownRenderer produced real elements, not raw text.
        const firstNote = container.locator(".daily-note-block").first();
        await expect(firstNote.locator(".daily-note-content h2").first()).toHaveText(/Morning/);
        await expect(firstNote.locator(".daily-note-content ul li").first()).toBeVisible();
        // Frontmatter must not leak into the body.
        await expect(firstNote.locator(".daily-note-content")).not.toContainText("mood:");
    });

    // An icon name Obsidian's Lucide set lacks renders a blank button, silently.
    test("draws an icon on every header action", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const actions = page.locator(".workspace-leaf.mod-active .view-action");
        await expect(actions).not.toHaveCount(0);
        for (const action of await actions.all()) await expect(action.locator("svg")).toHaveCount(1);
    });

    test("collapses a heading in the real rendered DOM", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const heading = firstNote.locator(".daily-note-content h2").first();
        const body = firstNote.locator(".daily-note-content p").first();

        await expect(body).toBeVisible();
        await heading.locator(".collapse-indicator").click();

        await expect(heading).toHaveClass(/is-collapsed/);
        await expect(body).toBeHidden();

        await heading.locator(".collapse-indicator").click();
        await expect(body).toBeVisible();
    });

    test("hides headings nested under a collapsed one, not just its text", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const heading = firstNote.locator(".daily-note-content h2").first();
        const nested = firstNote.locator(".daily-note-content h3").first();

        await expect(nested).toBeVisible();
        await heading.locator(".collapse-indicator").click();

        // Hiding is a class the stylesheet has to honour: a heading carries the
        // collapsible rule's own display, which a bare .is-hidden cannot outrank.
        await expect(nested).toHaveClass(/is-hidden/);
        await expect(nested).toBeHidden();

        await heading.locator(".collapse-indicator").click();
        await expect(nested).toBeVisible();
    });

    test("hides a table and a code block under a collapsed heading", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const note = container.locator(".daily-note-block").first();
        const heading = note.locator(".daily-note-content h2", { hasText: "Wide content" });
        const table = note.locator(".daily-note-content table").first();
        const code = note.locator(".daily-note-content pre").first();

        await expect(table).toBeVisible();
        await heading.locator(".collapse-indicator").click();

        // A stacked table carries its own display rule; hidden has to outrank it
        // or a collapsed section keeps showing.
        await expect(table).toBeHidden();
        await expect(code).toBeHidden();

        await heading.locator(".collapse-indicator").click();
        await expect(table).toBeVisible();
    });

    test("keeps the list chevron clear of a task's checkbox", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const parentTask = container
            .locator(".daily-note-content li.task-list-item", { hasText: "Parent task" })
            .first();
        const chevron = parentTask.locator("> .collapse-indicator");
        const checkbox = parentTask.locator("> input").first();

        await expect(chevron).toBeVisible();
        const [chevronBox, checkboxBox] = await Promise.all([chevron.boundingBox(), checkbox.boundingBox()]);

        // The chevron sits outside the list content; a task item puts its
        // checkbox there too, so the two collide unless the chevron moves.
        expect(chevronBox!.x + chevronBox!.width).toBeLessThanOrEqual(checkboxBox!.x);
    });

    test("centres a list chevron on its label", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        // Both shapes the vault seeds: a plain bullet with children, and a task.
        for (const label of ["Groceries", "Parent task"]) {
            const item = container.locator(".daily-note-content li.is-collapsible", { hasText: label }).first();
            await expect(item).toBeVisible();

            const offset = await item.evaluate((li) => {
                const chevron = li.querySelector(":scope > .collapse-indicator")!;
                const text = Array.from(li.childNodes).find((n) => n.nodeType === 3 && n.textContent!.trim())!;
                const range = document.createRange();
                range.selectNodeContents(text);
                const words = range.getBoundingClientRect();
                const box = chevron.getBoundingClientRect();
                return box.top + box.height / 2 - (words.top + words.height / 2);
            });

            expect(Math.abs(offset), label).toBeLessThan(1);
        }
    });

    test("centres a task's checkbox on its label", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const task = container.locator(".daily-note-content li.task-list-item", { hasText: "Parent task" }).first();
        await expect(task).toBeVisible();

        // Obsidian nudges the checkbox down from `.markdown-preview-view`, a
        // class the stream does not carry: without a rule of our own the box
        // rides visibly above the words beside it.
        const offset = await task.evaluate((li) => {
            const box = li.querySelector(":scope > input.task-list-item-checkbox")!;
            const label = Array.from(li.childNodes).find((n) => n.nodeType === 3 && n.textContent!.trim())!;
            const range = document.createRange();
            range.selectNodeContents(label);
            const text = range.getBoundingClientRect();
            const check = box.getBoundingClientRect();
            return check.top + check.height / 2 - (text.top + text.height / 2);
        });

        expect(Math.abs(offset)).toBeLessThan(1);
    });

    test("ignores a click on a task checkbox", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const checkbox = container
            .locator(".daily-note-content li.task-list-item", { hasText: "Parent task" })
            .first()
            .locator("> input.task-list-item-checkbox");

        await expect(checkbox).not.toBeChecked();
        // force: the checkbox is inert, so Playwright's actionability check
        // would otherwise wait for pointer events it will never receive.
        await checkbox.click({ force: true });

        // The stream is read-only and the renderer never writes back, so a
        // toggle here would be a lie the next re-render silently undoes.
        await expect(checkbox).not.toBeChecked();
    });

    test("indents nested lists the way Obsidian's reading view does", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const list = container.locator(".daily-note-content ul", { hasText: "Groceries" }).first();
        await expect(list).toBeVisible();

        // Obsidian indents rendered lists through the list item's margin and
        // zeroes the list's own padding; a plain <ul> instead falls back to the
        // browser's 40px per level, which on a phone eats a tenth of the width
        // for every nesting level.
        const step = await list.evaluate((ul) => {
            const li = (el: Element) => el.querySelector(":scope > li")!;
            const outer = li(ul).getBoundingClientRect().left;
            const inner = li(ul.querySelector("ul")!).getBoundingClientRect().left;
            return { padding: getComputedStyle(ul).paddingInlineStart, nested: inner - outer };
        });

        expect(step.padding).toBe("0px");
        // --list-indent: 0.5625em * 4 = 2.25em, 36px at the default 16px root.
        expect(step.nested).toBeCloseTo(36, 0);
    });

    test("toggles a heading from the keyboard", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const heading = firstNote.locator(".daily-note-content h2").first();
        const chevron = heading.locator(".collapse-indicator");

        await chevron.focus();
        await expect(chevron).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Enter");

        await expect(chevron).toHaveAttribute("aria-expanded", "false");
        await expect(heading).toHaveClass(/is-collapsed/);
        await page.keyboard.press("Enter");
        await expect(chevron).toHaveAttribute("aria-expanded", "true");
    });

    test("loads a second batch on scroll", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const blocks = container.locator(".daily-note-block");

        await expect(blocks).toHaveCount(10); // BATCH_SIZE

        await container.locator(".daily-note-block").last().scrollIntoViewIfNeeded();
        await expect(blocks).toHaveCount(SEEDED_DAYS);
    });

    // jsdom loads no stylesheet and lays nothing out, so unloading can only be
    // proven here: a block far above the viewport keeps its height and loses
    // its content (ADR 0006).
    test.describe("off-screen notes", () => {
        /** Three notes tall enough that the top one can be pushed past the unload margin. */
        const TALL_NOTES = ["2026-03-20.md", "2026-03-19.md", "2026-03-18.md"];

        test.beforeEach(async ({ obsidian }) => {
            await obsidian.page.evaluate(async (names: string[]) => {
                const body = (name: string) =>
                    `# ${name}\n\n` + Array.from({ length: 300 }, (_, i) => `Line ${i} of ${name}.`).join("\n\n");
                for (const name of names) {
                    await window.app.vault.create(`Notes/${name}`, body(name));
                }
            }, TALL_NOTES);
        });

        test.afterEach(async ({ obsidian }) => {
            await obsidian.page.evaluate(async (names: string[]) => {
                for (const name of names) {
                    const file = window.app.vault.getAbstractFileByPath(`Notes/${name}`);
                    if (file) await window.app.vault.delete(file);
                }
            }, TALL_NOTES);
        });

        test("drops the content of a note scrolled far above, keeping its height", async ({ obsidian }) => {
            const { page } = obsidian;
            const container = await openStream(page);
            const top = container.locator(".daily-note-block").first();

            await expect(top.locator(".daily-note-content")).toBeVisible();
            const renderedHeight = (await top.boundingBox())!.height;

            await container.locator(".daily-note-block").nth(3).scrollIntoViewIfNeeded();

            await expect(top).toHaveClass(/is-unloaded/);
            await expect(top.locator(".daily-note-content")).toHaveCount(0);
            // The placeholder holds the space the note had, so nothing below moves.
            expect((await top.boundingBox())!.height).toBeCloseTo(renderedHeight, -1);
        });

        // On iOS an unload mid-glide ends the glide, so none happens until the
        // scroll stops (docs/decisions.md, 2026-09-23).
        test("keeps a note scrolled far above rendered until the scroll stops", async ({ obsidian }) => {
            const { page } = obsidian;
            const container = await openStream(page);
            const top = container.locator(".daily-note-block").first();
            await expect(top.locator(".daily-note-content")).toBeVisible();

            await container.locator(".daily-note-block").nth(3).scrollIntoViewIfNeeded();
            // A glide: a small scroll every frame-ish, for well past the idle wait.
            const scroller = container.locator("xpath=..");
            const stillRendered = await scroller.evaluate(async (el) => {
                const block = el.querySelector(".daily-note-block")!;
                for (let i = 0; i < 40; i++) {
                    el.scrollBy(0, i % 2 ? 1 : -1);
                    await new Promise((resolve) => setTimeout(resolve, 25));
                    if (block.classList.contains("is-unloaded")) return false;
                }
                return true;
            });
            expect(stillRendered).toBe(true);

            await expect(top).toHaveClass(/is-unloaded/);
        });

        test("leaves the scroll position where it was when a note unloads", async ({ obsidian }) => {
            const { page } = obsidian;
            const container = await openStream(page);
            const top = container.locator(".daily-note-block").first();

            await container.locator(".daily-note-block").nth(3).scrollIntoViewIfNeeded();
            await expect(top).toHaveClass(/is-unloaded/);

            const scroller = container.locator("xpath=..");
            const before = await scroller.evaluate((el) => el.scrollTop);
            await page.waitForTimeout(500);

            expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
        });

        test("renders the note again when it comes back into view", async ({ obsidian }) => {
            const { page } = obsidian;
            const container = await openStream(page);
            const top = container.locator(".daily-note-block").first();

            await container.locator(".daily-note-block").nth(3).scrollIntoViewIfNeeded();
            await expect(top).toHaveClass(/is-unloaded/);

            await top.scrollIntoViewIfNeeded();

            await expect(top).not.toHaveClass(/is-unloaded/);
            await expect(top.locator(".daily-note-content h1")).toHaveText("2026-03-20.md");
        });
    });

    test("shows a note created while the view is open", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        // Return nothing: the created TFile is not serialisable back to Node.
        await page.evaluate(async () => {
            await window.app.vault.create("Notes/2026-03-20.md", "## Later\n\nA newer day.\n");
        });

        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-20");
        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-20.md");
            await window.app.vault.delete(file);
        });
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");
    });

    test("ignores dated files that are not daily notes", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await page.evaluate(async () => {
            await window.app.vault.createFolder("Attachments").catch(() => {});
            // Right date shape, wrong folder — and right folder, wrong extension.
            await window.app.vault.create("Attachments/2026-03-25.md", "not a daily note");
            await window.app.vault.create("Notes/2026-03-26.png", "not markdown either");
        });

        // Give the vault events time to be wrong, if they are going to be.
        await page.waitForTimeout(1000);
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");
        await expect(container.locator(".daily-note-block")).toHaveCount(10);

        await page.evaluate(async () => {
            for (const path of ["Attachments/2026-03-25.md", "Notes/2026-03-26.png"]) {
                const file = window.app.vault.getAbstractFileByPath(path);
                if (file) await window.app.vault.delete(file);
            }
        });
    });

    test("keeps wide content inside the stream instead of scrolling the page", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        await expect(container.locator("table").first()).toBeVisible();
        await expect(container.locator("p > a.external-link").first()).toBeVisible();

        // The mobile project is where this bites: a phone has no room for a wide
        // table, code line or URL, so it pushes the page sideways instead.
        const overflow = await container.evaluate((el) => {
            const scroller = el.parentElement!;
            // Both are viewport coordinates: the scroller need not start at 0.
            const limit = scroller.getBoundingClientRect().right;
            return {
                pageOverflow: scroller.scrollWidth - scroller.clientWidth,
                widest: Math.max(
                    ...Array.from(el.querySelectorAll("table, pre, p > a.external-link")).map((child) =>
                        Math.round(child.getBoundingClientRect().right - limit)
                    )
                ),
            };
        });

        expect(overflow.pageOverflow).toBeLessThanOrEqual(0);
        expect(overflow.widest).toBeLessThanOrEqual(0);
    });

    test("keeps the copy button off the code it sits over", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const pre = container.locator("pre").first();
        await expect(pre).toBeVisible();
        // The button only fades in on hover, but it holds its place either way.
        await pre.hover();

        // Obsidian wraps rendered code and pins its copy button to the top-right
        // corner, so a long first line runs underneath the icon.
        const overlap = await pre.evaluate((el) => {
            const button = el.querySelector(".copy-code-button");
            const code = el.querySelector("code");
            if (!button || !code) throw new Error("no copy button on the rendered code block");
            const icon = button.getBoundingClientRect();
            const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
            const range = document.createRange();
            let widest = 0;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                range.selectNodeContents(node);
                for (const line of Array.from(range.getClientRects())) {
                    const across = Math.min(line.right, icon.right) - Math.max(line.left, icon.left);
                    const down = Math.min(line.bottom, icon.bottom) - Math.max(line.top, icon.top);
                    if (across > 0 && down > 0) widest = Math.max(widest, across);
                }
            }
            return Math.round(widest);
        });

        expect(overlap).toBe(0);
    });

    test("keeps the properties panel collapsed across a re-render", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const panel = firstNote.locator(".metadata-container");

        await expect(panel).toBeVisible();
        await expect(panel).not.toHaveClass(/is-collapsed/);
        await firstNote.locator(".metadata-properties-heading").click();
        await expect(panel).toHaveClass(/is-collapsed/);

        // Editing the note re-renders it; the panel must not spring back open.
        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-14.md");
            await window.app.vault.append(file, "\nEdited.\n");
        });

        await expect(firstNote.locator(".daily-note-content")).toContainText("Edited.");
        await expect(container.locator(".daily-note-block").first().locator(".metadata-container")).toHaveClass(
            /is-collapsed/
        );
    });

    test("lines the properties header up with the properties, not inside them", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const block = container.locator(".daily-note-block").first();
        const panel = block.locator(".metadata-container");
        // Collapse state persists per note, and an earlier test may have left
        // this panel closed; its keys are then not there to measure.
        if (await panel.evaluate((el) => el.classList.contains("is-collapsed"))) {
            await panel.locator(".metadata-properties-heading").click();
        }
        const heading = block.locator(".metadata-properties-heading");
        const rows = block.locator(".metadata-properties");
        await expect(heading).toBeVisible();
        await expect(rows).toBeVisible();
        // Obsidian puts the heading above the box, not in it.
        await expect(block.locator(".metadata-content > .metadata-properties-heading")).toHaveCount(0);

        // Obsidian hangs the chevron outside the panel and starts the heading's
        // word on the panel's own left edge; in flow the chevron took the icon
        // column and the heading read as one more property row.
        const [titleBox, rowsBox] = await Promise.all([
            block.locator(".metadata-properties-title").boundingBox(),
            rows.boundingBox(),
        ]);
        expect(Math.abs(titleBox!.x - rowsBox!.x)).toBeLessThan(1);
    });

    test("keeps the properties box centred on the note", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const block = container.locator(".daily-note-block").first();
        const box = block.locator(".metadata-content").first();
        await expect(box).toBeVisible();

        // Obsidian bleeds this box evenly past its container on both sides; a
        // gutter taken out of the container shifts it instead of narrowing it.
        const [blockBox, boxBox] = await Promise.all([block.boundingBox(), box.boundingBox()]);
        const leftBleed = blockBox!.x - boxBox!.x;
        const rightBleed = boxBox!.x + boxBox!.width - (blockBox!.x + blockBox!.width);
        expect(Math.abs(leftBleed - rightBleed)).toBeLessThan(1);
    });

    test("reveals the properties chevron on hover, as Obsidian does", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const heading = container.locator(".metadata-properties-heading").first();
        const chevron = heading.locator("> .collapse-indicator");
        await expect(chevron).toBeVisible();
        await page.mouse.move(0, 0);

        // Obsidian keeps this indicator hidden until the row is hovered, and
        // the row itself is the control — a phone taps that instead.
        await expect(chevron).toHaveCSS("opacity", "0");
        await heading.hover();
        await expect(chevron).toHaveCSS("opacity", "1");
    });

    test("keeps the properties chevron inside the note", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const block = container.locator(".daily-note-block").first();
        const chevron = block.locator(".metadata-properties-heading > .collapse-indicator");
        await expect(chevron).toBeVisible();

        // Obsidian hangs this indicator in a left margin its own properties
        // panel keeps clear. Here it hangs exactly where a content heading's
        // does — in the stream's padding, and never off the pane, which on a
        // phone has less of that padding to give.
        const [paneBox, chevronBox, headingChevronBox] = await Promise.all([
            page.locator(".workspace-leaf-content[data-type='daily-notes-stream-view'] .view-content").boundingBox(),
            chevron.boundingBox(),
            block.locator(".daily-note-content h2.is-collapsible > .collapse-indicator").first().boundingBox(),
        ]);
        expect(chevronBox!.x).toBeCloseTo(headingChevronBox!.x, 0);
        expect(chevronBox!.x).toBeGreaterThanOrEqual(paneBox!.x);
    });

    test("sets the properties heading on the same line as the note's own headings", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const block = container.locator(".daily-note-block").first();
        await expect(block.locator(".metadata-properties-title")).toBeVisible();

        // "Properties" is a heading of the note like any other: its word starts
        // where "Morning" does, and its chevron sits the same step to the left.
        const geometry = await block.evaluate((el) => {
            const box = (node: Element) => node.getBoundingClientRect();
            const heading = el.querySelector(".daily-note-content h2.is-collapsible")!;
            const title = el.querySelector(".metadata-properties-title")!;
            return {
                headingText: box(heading).left + parseFloat(getComputedStyle(heading).paddingLeft),
                headingChevron: box(heading.querySelector(":scope > .collapse-indicator")!).right,
                titleText: box(title).left,
                titleChevron: box(el.querySelector(".metadata-properties-heading > .collapse-indicator")!).right,
            };
        });

        expect(Math.abs(geometry.titleText - geometry.headingText)).toBeLessThan(1);
        const headingGap = geometry.headingText - geometry.headingChevron;
        expect(Math.abs(geometry.titleText - geometry.titleChevron - headingGap)).toBeLessThan(1);
    });

    test("renders the properties panel at the size Obsidian's own does", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });

        // The panel Obsidian draws for the same note, to measure the stream's
        // against: every rule for these classes is already in its stylesheet,
        // and anything the stream restates is a chance to drift from it.
        const measure = (root: Element) => {
            const size = (sel: string) => {
                const el = root.querySelector(sel)!;
                return {
                    height: Math.round(el.getBoundingClientRect().height),
                    fontSize: getComputedStyle(el).fontSize,
                };
            };
            return {
                title: size(".metadata-properties-title"),
                row: size(".metadata-property"),
                key: size(".metadata-property-key"),
                keyText: size(".metadata-property-key-input"),
                value: size(".metadata-property-value"),
                icon: Math.round(root.querySelector(".metadata-property-icon svg")!.getBoundingClientRect().width),
            };
        };

        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-14.md");
            await window.app.workspace.getLeaf(false).openFile(file!);
        });
        const note = page.locator(".workspace-leaf.mod-active .view-content").first();
        await expect(note.locator(".metadata-property").first()).toBeVisible();
        const native = await note.evaluate(measure);

        const container = await openStream(page);
        await expect(container.locator(".metadata-property").first()).toBeVisible();
        const stream = await container.evaluate(measure);

        expect(stream.icon).toBe(native.icon);
        for (const part of ["title", "row", "key", "keyText", "value"] as const) {
            expect(stream[part].fontSize, part).toBe(native[part].fontSize);
            // Obsidian fills a row with inputs and the stream with text, so a
            // box can round a pixel apart; anything more is a rule it is
            // missing.
            expect(Math.abs(stream[part].height - native[part].height), part).toBeLessThanOrEqual(1);
        }
    });

    test("shows the icon Obsidian's own properties panel shows for each key", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });

        // setIcon names the svg after the icon it drew. The two panels label a
        // row differently: Obsidian with an attribute, the stream with the key
        // it printed.
        const iconsByKey = (root: Locator, keyFrom: "attribute" | "text") =>
            root.evaluate(
                (el, mode) =>
                    Object.fromEntries(
                        Array.from(el.querySelectorAll(".metadata-property")).map((row) => [
                            mode === "attribute"
                                ? row.getAttribute("data-property-key")
                                : row.querySelector(".metadata-property-key-input")!.textContent!.toLowerCase(),
                            Array.from(row.querySelector(".metadata-property-icon svg")!.classList)
                                .filter((name) => name !== "svg-icon")
                                .join(" "),
                        ])
                    ),
                keyFrom
            );

        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-14.md");
            await window.app.workspace.getLeaf(false).openFile(file!);
        });
        const note = page.locator(".workspace-leaf.mod-active .view-content").first();
        await expect(note.locator(".metadata-property").first()).toBeVisible();
        const native = await iconsByKey(note, "attribute");

        const container = await openStream(page);
        const block = container.locator(`.daily-note-block[data-source-path="Notes/2026-03-14.md"]`);
        await expect(block.locator(".metadata-property").first()).toBeVisible();
        const stream = await iconsByKey(block, "text");

        expect(stream).toEqual(native);
        // A guard on the comparison itself: identical icons everywhere would
        // satisfy it while proving nothing about the types.
        expect(new Set(Object.values(stream).map(String)).size).toBeGreaterThan(1);
    });

    test("opens the search pane on an inline tag, as Obsidian does everywhere else", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await closeSearchPanes(page);

        await container.locator(".daily-note-content a.tag").first().click();

        const search = page.locator(".workspace-leaf-content[data-type='search']");
        await expect(search).toBeVisible();
        await expect(search.locator('input[type="search"]')).toHaveValue("tag:#running");
    });

    test("opens the search in a new tab when the tag is mod-clicked", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await closeSearchPanes(page);

        await container
            .locator(".daily-note-content a.tag")
            .first()
            .click({ modifiers: ["ControlOrMeta"] });

        // A tab of the main area, not the sidebar pane a plain click opens.
        const search = page.locator(".workspace-split.mod-root .workspace-leaf-content[data-type='search']");
        await expect(search).toBeVisible();
        await expect(search.locator('input[type="search"]')).toHaveValue("tag:#running");
    });

    test("opens the search pane on a tag pill in the properties panel", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });
        const container = await openStream(page);

        await closeSearchPanes(page);

        await container.locator(".multi-select-pill").first().click();

        const search = page.locator(".workspace-leaf-content[data-type='search']");
        await expect(search).toBeVisible();
        await expect(search.locator('input[type="search"]')).toHaveValue("tag:#daily");
    });

    test("draws a tag property as the pill Obsidian's own panel draws", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });

        // Only what the tag styling decides. A pill's own box is not
        // comparable: its width follows its word, and Obsidian's editable one
        // is padded out by a remove button the read-only stream never draws.
        const measure = (root: Element) => {
            const pill = root.querySelector('.metadata-property-value[data-property-type="tags"] .multi-select-pill')!;
            const content = pill.querySelector(".multi-select-pill-content")!;
            const style = getComputedStyle(pill);
            return {
                text: content.textContent,
                contentHeight: Math.round(content.getBoundingClientRect().height),
                radius: style.borderTopLeftRadius,
                background: style.backgroundColor,
                color: style.color,
                fontSize: style.fontSize,
                padding: style.padding,
                marginInlineStart: getComputedStyle(content).marginInlineStart,
            };
        };

        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-14.md");
            await window.app.workspace.getLeaf(false).openFile(file!);
        });
        const note = page.locator(".workspace-leaf.mod-active .view-content").first();
        await expect(note.locator(".multi-select-pill").first()).toBeVisible();
        const native = await note.evaluate(measure);

        const container = await openStream(page);
        await expect(container.locator(".multi-select-pill").first()).toBeVisible();
        const stream = await container.evaluate(measure);

        expect(stream).toEqual(native);
        // A pill, not a rectangle: the radius rounds its ends fully, and the
        // word sits evenly inside it. Obsidian's trailing space is the remove
        // button's margin, so a read-only pill has to supply its own.
        const pill = await container
            .locator(".multi-select-pill")
            .first()
            .evaluate((el) => {
                const box = el.getBoundingClientRect();
                const word = el.querySelector(".multi-select-pill-content")!.getBoundingClientRect();
                return { height: box.height, before: word.left - box.left, after: box.right - word.right };
            });
        expect(parseFloat(stream.radius)).toBeGreaterThanOrEqual(pill.height / 2);
        expect(pill.after).toBeCloseTo(pill.before, 0);
    });

    test("marks the tag pills invalid that Obsidian's own panel marks", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
            const tags = [
                "work",
                "#work",
                "a b",
                "a,b",
                "123",
                "1a",
                "a/b",
                "-a_b",
                "é日本",
                "💡",
                "a.b",
                "a!",
                "a，b",
                "a…",
                "a—b",
                "a«b»",
                "a⸗b",
            ];
            const list = tags.map((tag) => `  - "${tag}"`).join("\n");
            await window.app.vault.create("Notes/2026-03-20.md", `---\ntags:\n${list}\n---\n\nA day.\n`);
        });

        const pills = (root: Element) =>
            Array.from(
                root.querySelectorAll(".multi-select-pill"),
                (pill) => `${pill.textContent} ${pill.classList.contains("is-invalid") ? "invalid" : "valid"}`
            );

        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-20.md");
            await window.app.workspace.getLeaf(false).openFile(file!);
        });
        const note = page.locator(".workspace-leaf.mod-active .view-content").first();
        await expect(note.locator(".multi-select-pill")).toHaveCount(17);
        const native = await note.evaluate(pills);

        const container = await openStream(page);
        const block = container.locator('.daily-note-block[data-source-path="Notes/2026-03-20.md"]');
        await expect(block.locator(".multi-select-pill")).toHaveCount(17);
        expect(await block.evaluate(pills)).toEqual(native);
        await expect(block.locator(".multi-select-pill.is-invalid").first()).toHaveCSS(
            "text-decoration-line",
            "line-through"
        );
        // It names no tag, so it offers no search.
        await expect(block.locator(".multi-select-pill.is-invalid").first()).toHaveCSS("cursor", "default");

        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-20.md");
            await window.app.vault.delete(file);
        });
    });

    test("types a scalar tags value and a legacy tag key as Obsidian's own panel does", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
            await window.app.vault.create("Notes/2026-03-20.md", "---\ntags: work\ntag: solo\n---\n\nA day.\n");
        });

        const rows = (root: Element) =>
            Array.from(root.querySelectorAll(".metadata-property-value"), (value) => ({
                type: (value as HTMLElement).dataset.propertyType === "tags" ? "tags" : "not tags",
                pills: Array.from(value.querySelectorAll(".multi-select-pill"), (pill) => pill.textContent),
            }));

        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-20.md");
            await window.app.workspace.getLeaf(false).openFile(file!);
        });
        const note = page.locator(".workspace-leaf.mod-active .view-content").first();
        await expect(note.locator(".metadata-property")).toHaveCount(2);
        const native = await note.evaluate(rows);

        const container = await openStream(page);
        const block = container.locator('.daily-note-block[data-source-path="Notes/2026-03-20.md"]');
        await expect(block.locator(".metadata-property")).toHaveCount(2);
        expect(await block.evaluate(rows)).toEqual(native);

        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-20.md");
            await window.app.vault.delete(file);
        });
    });

    test("centres a property's icon on the words in its row", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const panel = container.locator(".metadata-container").first();
        if (await panel.evaluate((el) => el.classList.contains("is-collapsed"))) {
            await panel.locator(".metadata-properties-heading").click();
        }
        await expect(panel.locator(".metadata-property").first()).toBeVisible();

        // Where the glyphs land, not where their boxes do: the key fills the
        // row's height, so its box was centred while the word inside it sat
        // against the top — a phone's taller row especially.
        const centres = await panel
            .locator(".metadata-property")
            .first()
            .evaluate((el) => {
                const middle = (sel: string) => {
                    const range = document.createRange();
                    range.selectNodeContents(el.querySelector(sel)!);
                    const text = range.getBoundingClientRect();
                    const r = text.height > 0 ? text : el.querySelector(sel)!.getBoundingClientRect();
                    return r.top + r.height / 2;
                };
                return {
                    icon: middle(".metadata-property-icon svg"),
                    key: middle(".metadata-property-key-input"),
                    value: middle(".metadata-property-value-text"),
                };
            });

        expect(Math.abs(centres.icon - centres.key)).toBeLessThanOrEqual(1);
        expect(Math.abs(centres.icon - centres.value)).toBeLessThanOrEqual(1);
    });

    test("collapses the properties box away entirely", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const block = container.locator(".daily-note-block").first();
        const panel = block.locator(".metadata-container");
        const heading = panel.locator(".metadata-properties-heading");
        if (await panel.evaluate((el) => el.classList.contains("is-collapsed"))) await heading.click();

        const expandedTop = (await heading.boundingBox())!.y;
        await heading.click();
        await expect(panel).toHaveClass(/is-collapsed/);

        // Hiding the rows alone left the box that holds them — padded and, on
        // mobile, filled — standing under the heading.
        await expect(block.locator(".metadata-content")).toBeHidden();
        const [panelBox, headingBox] = await Promise.all([panel.boundingBox(), heading.boundingBox()]);
        expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(headingBox!.y + headingBox!.height + 1);

        // Only what is under the heading goes: the heading itself must not
        // jump, or collapsing twice reads as the panel twitching.
        expect(Math.abs(headingBox!.y - expandedTop)).toBeLessThanOrEqual(1);
    });

    test("draws no focus ring when the properties heading is clicked", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const heading = container.locator(".metadata-properties-heading").first();
        await heading.click();

        // Obsidian rings this heading on :focus; the stream is read-only, so a
        // click on it must collapse the panel and leave nothing behind.
        await expect(heading).not.toBeFocused();
        expect(await heading.evaluate((el) => getComputedStyle(el, "::before").boxShadow)).toBe("none");
    });

    test("does not offer a pointer on property icons nothing can click", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const panel = container.locator(".metadata-container").first();
        // Collapse state persists per note, and an earlier test may have left
        // this panel closed; its icons are then not there to measure.
        if (await panel.evaluate((el) => el.classList.contains("is-collapsed"))) {
            await panel.locator(".metadata-properties-heading").click();
        }
        const icon = panel.locator(".metadata-property-icon").first();
        await expect(icon).toBeVisible();

        // Obsidian's mobile stylesheet styles this icon as a button: in its own
        // properties editor it opens a menu. The stream is read-only, so the
        // cursor must not promise an interaction that cannot happen.
        await expect(icon).toHaveCSS("cursor", "default");
    });
});
