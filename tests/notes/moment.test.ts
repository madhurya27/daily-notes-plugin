import { describe, it, expect, expectTypeOf } from "vitest";
import { moment as obsidianMoment } from "obsidian";
import realMoment from "moment";
import { moment, type Moment, type MomentFactory } from "../../src/notes/moment";

describe("moment", () => {
    it("is Obsidian's own", () => {
        expect(moment).toBe(obsidianMoment);
    });

    it("is typed as a subset of the real moment, so the local type cannot drift", () => {
        expectTypeOf(realMoment).toExtend<MomentFactory>();
        expectTypeOf(realMoment()).toExtend<Moment>();
    });
});
