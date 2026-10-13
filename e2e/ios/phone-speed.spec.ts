import { test, expect } from "./phone";
import { TARGET_PHONE_WORKLOAD_MS, WORKLOAD_NOTE, timeWorkload } from "../phone-speed";

// Measured on an iPhone 16 Pro, about 1.55 times an A15's single-core speed:
// the time the specs slow a laptop to stays that, and a quarter, slower.
test("the phone the specs time against is an A15 iPhone, and a quarter slower", async ({ phone }) => {
    await phone.openStream();
    const ms = await phone.runAsync(timeWorkload, WORKLOAD_NOTE);
    // eslint-disable-next-line no-console -- the number TARGET_PHONE_WORKLOAD_MS is set from
    console.log(`workload on this phone: ${ms.toFixed(2)} ms`);
    expect(TARGET_PHONE_WORKLOAD_MS / ms).toBeGreaterThan(1.55 * 1.25 * 0.85);
    expect(TARGET_PHONE_WORKLOAD_MS / ms).toBeLessThan(1.55 * 1.25 * 1.15);
});
