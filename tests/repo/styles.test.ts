import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

/** Each rule's declaration block, keyed by its selector. */
const rules = [...styles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selector, body]) => ({ selector: selector!.trim(), body: body! })
);

describe("styles.css", () => {
    it("holds rules", () => {
        expect(rules.length).toBeGreaterThan(0);
    });

    // WebKit reads only the prefixed property, so on iOS Obsidian's
    // `-webkit-user-select: none` won: no selecting, and no search highlights,
    // which WebKit does not paint on unselectable text.
    it("spells every user-select for WebKit too", () => {
        for (const { selector, body } of rules) {
            const value = /(?<![-\w])user-select:\s*([^;]+);/.exec(body)?.[1];
            if (value) expect(body, selector).toContain(`-webkit-user-select: ${value}`);
        }
    });
});
