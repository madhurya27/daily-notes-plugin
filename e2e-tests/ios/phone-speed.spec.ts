import { test, expect } from "./phone";
import { TARGET_PHONE_WORKLOAD_MS, WORKLOAD_NOTE, timeWorkload } from "../phone-speed";

// Measured on an iPhone 16 Pro, twice an iPhone 11's single-core speed: the
// time the specs slow a laptop to stays a little slower than an iPhone 11.
test("the phone the specs time against is about 2.3 times slower than this one", async ({ phone }) => {
    await phone.openStream();
    const ms = await phone.runAsync(timeWorkload, WORKLOAD_NOTE);
    // eslint-disable-next-line no-console -- the number TARGET_PHONE_WORKLOAD_MS is set from
    console.log(`workload on this phone: ${ms.toFixed(2)} ms`);
    expect(TARGET_PHONE_WORKLOAD_MS / ms).toBeGreaterThan(2);
    expect(TARGET_PHONE_WORKLOAD_MS / ms).toBeLessThan(2.7);
});
