import { test } from "./phone";

// Every test fails on an error in Obsidian's console; these prove the check
// fails, one for each way an error reaches it.
for (const [how, cause] of [
    ["logged", () => console.error("A logged error")],
    [
        "thrown",
        () =>
            void setTimeout(() => {
                throw new Error("A thrown error");
            }),
    ],
    ["rejected", () => void Promise.reject(new Error("A rejected promise"))],
] as const)
    test(`an error ${how} on the phone fails the test`, async ({ phone }) => {
        test.fail();
        await phone.run(cause);
    });
