// @ts-check
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
    testRunner: "vitest",
    // Named: under pnpm, Stryker does not find it on its own.
    plugins: ["@stryker-mutator/vitest-runner"],
    mutate: ["src/**/*.ts"],
    coverageAnalysis: "perTest",
    // With bail, vitest 4 sometimes reports no test run for a mutant that fails
    // one at once, and Stryker counts it as survived: ~3 of 133 in a file.
    disableBail: true,
    reporters: ["clear-text", "html", "progress"],
    // The table only: every survivor, each run, buries it. The HTML report has them.
    clearTextReporter: { reportMutants: false, reportTests: false },
    htmlReporter: { fileName: "reports/mutation/report.html" },
    tempDirName: ".dev/stryker-tmp",
    // A worker takes more than a core: 30% of them leaves about half the machine free.
    concurrency: "30%",
    // Reruns only the mutants whose code changed since the last run.
    incremental: true,
    // A static mutant reruns every test; they are few and slow.
    ignoreStatic: true,
    // Only what the unit tests import: the vaults in .dev/ are thousands of files.
    ignorePatterns: ["/.dev", "/docs/plans", "/e2e", "/coverage", "/test-results"],
};
