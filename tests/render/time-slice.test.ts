import { describe, it, expect, vi, afterEach } from "vitest";
import { TimeSlice, yieldToMain } from "../../src/render/time-slice";

describe("TimeSlice", () => {
    it("gives the thread back only once its budget is spent", async () => {
        let now = 0;
        const yielded = vi.fn(() => Promise.resolve());
        const slice = new TimeSlice(25, () => now, yielded);

        now = 24;
        await slice.yieldIfSpent();
        expect(yielded).not.toHaveBeenCalled();

        now = 25;
        await slice.yieldIfSpent();
        expect(yielded).toHaveBeenCalledOnce();
    });

    it("starts a new budget once the thread comes back", async () => {
        let now = 0;
        const yielded = vi.fn(() => {
            now += 100;
            return Promise.resolve();
        });
        const slice = new TimeSlice(25, () => now, yielded);

        now = 30;
        await slice.yieldIfSpent();
        now += 24;
        await slice.yieldIfSpent();
        expect(yielded).toHaveBeenCalledOnce();
    });

    it("tells whether it gave the thread back", async () => {
        let now = 0;
        const slice = new TimeSlice(
            25,
            () => now,
            () => Promise.resolve()
        );
        expect(await slice.yieldIfSpent()).toBe(false);
        now = 25;
        expect(await slice.yieldIfSpent()).toBe(true);
    });
});

describe("yieldToMain", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("lets every task already waiting run first, timers included", async () => {
        vi.useFakeTimers();
        const order: string[] = [];
        setTimeout(() => order.push("timer"), 0);
        const yielded = yieldToMain().then(() => order.push("render"));
        await vi.runAllTimersAsync();
        await yielded;
        expect(order).toEqual(["timer", "render"]);
    });

    it("never takes the scheduler's turn ahead of them, where the platform has one", async () => {
        vi.useFakeTimers();
        const prioritized = vi.fn(() => Promise.resolve());
        vi.stubGlobal("scheduler", { yield: prioritized });
        const yielded = yieldToMain();
        await vi.runAllTimersAsync();
        await yielded;
        expect(prioritized).not.toHaveBeenCalled();
    });
});
