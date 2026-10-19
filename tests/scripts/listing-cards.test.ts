import { describe, it, expect } from "vitest";
import { cardTextHtml } from "../../scripts/listing-cards.mjs";

describe("cardTextHtml", () => {
    it("colours the words between asterisks", () => {
        expect(cardTextHtml("Your journal, as *one long page*.")).toBe("Your journal, as <em>one long page</em>.");
    });

    it("marks a newline as a break only the narrow cards take", () => {
        expect(cardTextHtml("Your journal,\nas a page.")).toBe('Your journal,<br class="narrow"> as a page.');
    });

    it("escapes the text around them", () => {
        expect(cardTextHtml("Bases & <Dataview>")).toBe("Bases &amp; &lt;Dataview&gt;");
    });
});
