import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

/** Where the README recording's frames land, and the scene it marks among them (`recording.spec.ts`). */
export const FRAMES = resolve(dirname(fileURLToPath(import.meta.url)), "../../.dev/phone-frames");
export type Scene = { start: number; end: number; output: string };

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/capture-iphone.swift");
/** Compiling the tool takes some seconds, finding the phone up to ten more. */
const START_MS = 30_000;
const STOP_MS = 15_000;

/**
 * Starts capturing the iPhone's screen over USB into `dir`, as PNGs `width`
 * wide named by when they arrived; returns what stops it once every frame is
 * written. Before any WebDriverAgent session: a capture starting drops it.
 */
export async function startScreenCapture(dir: string, width: number): Promise<() => Promise<void>> {
    const tool = spawn("swift", ["-O", TOOL, dir, String(width)], { stdio: ["ignore", "pipe", "pipe"] });
    let errors = "";
    tool.stderr.on("data", (chunk: Buffer) => (errors += chunk));
    await new Promise<void>((started, failed) => {
        const timer = setTimeout(() => {
            tool.kill();
            failed(new Error(`No frame from the iPhone in ${START_MS / 1000} s. ${errors}`));
        }, START_MS);
        tool.stdout.on("data", (chunk: Buffer) => {
            if (!String(chunk).includes("capturing")) return;
            clearTimeout(timer);
            started();
        });
        tool.once("exit", (code) => {
            clearTimeout(timer);
            failed(new Error(`capture-iphone.swift exited with ${code}. ${errors}`));
        });
    });
    return () =>
        new Promise<void>((stopped, failed) => {
            const timer = setTimeout(() => {
                tool.kill("SIGKILL");
                failed(new Error(`capture-iphone.swift did not stop in ${STOP_MS / 1000} s.`));
            }, STOP_MS);
            tool.once("exit", () => {
                clearTimeout(timer);
                stopped();
            });
            tool.kill("SIGTERM");
        });
}
