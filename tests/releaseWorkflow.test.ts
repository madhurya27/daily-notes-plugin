import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";

const repoRoot = resolve(__dirname, "..");
const workflowPath = resolve(repoRoot, ".github/workflows/release.yml");

interface Step {
    uses?: string;
    run?: string;
    with?: Record<string, unknown>;
}
interface Workflow {
    on: { push?: { tags?: string[] } };
    jobs: Record<string, { steps: Step[] }>;
}

const workflow = existsSync(workflowPath) ? (parse(readFileSync(workflowPath, "utf8")) as Workflow) : null;
const steps = () => Object.values(workflow!.jobs).flatMap((job) => job.steps);
const script = () =>
    steps()
        .map((step) => step.run ?? "")
        .join("\n");

/** The three files Obsidian's reviewers download from a release. */
const RELEASE_ASSETS = ["main.js", "manifest.json", "styles.css"];

describe("release workflow", () => {
    it("exists", () => {
        expect(workflow).not.toBeNull();
    });

    it("runs on a pushed tag", () => {
        expect(workflow!.on.push?.tags).toBeTruthy();
    });

    it("installs from the lockfile so a release matches the pinned dependencies", () => {
        expect(script()).toContain("pnpm install --frozen-lockfile");
    });

    it("builds the plugin rather than releasing whatever is committed", () => {
        expect(script()).toContain("pnpm run build");
    });

    it("attaches each release asset individually", () => {
        for (const asset of RELEASE_ASSETS) expect(script()).toContain(asset);
    });

    it("refuses a tag that does not match the manifest version", () => {
        // A mismatched tag is the failure Obsidian's review bot catches for us
        // only after submission; the release itself should catch it first.
        expect(script()).toMatch(/manifest\.json/);
        expect(script()).toMatch(/exit 1/);
    });

    it("pins every action to a full commit SHA", () => {
        const used = steps()
            .map((step) => step.uses)
            .filter((uses): uses is string => Boolean(uses));
        expect(used.length).toBeGreaterThan(0);
        for (const uses of used) expect(uses).toMatch(/@[0-9a-f]{40}$/);
    });
});
