import { test, expect } from "./phone";
import { SHORT_NOTE } from "./vault";

test("back from the Home Screen, the stream is where it was, and a flick still glides", async ({ phone }) => {
    await phone.openStream();
    await phone.placeAt(`.daily-note-block[data-source-path="${SHORT_NOTE}"] .daily-note-content > p`, -20);
    const left = await phone.place();
    await phone.followPlaces("return");

    await phone.background(3);

    const shown = await phone.places();
    expect(shown, "the stream drew no frame on return").not.toEqual([]);
    for (const { path, offset } of shown) {
        expect(path).toBe(left.path);
        // Rounded either side of a half pixel: not a jump.
        expect(Math.abs(offset - left.offset), `shown at ${offset}, left at ${left.offset}`).toBeLessThanOrEqual(1);
    }
    expect(await phone.glidesPast("up", 500)).toBe(true);
});
