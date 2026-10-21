import { execFileSync, spawn, spawnSync, type ChildProcess } from "child_process";
import { X509Certificate } from "crypto";
import { mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { oneConsoleListener } from "./console-listener";
import { keyboardAfterRun } from "./keyboard";
import { loadLocalEnv } from "./local-env";
import { recordingAsked } from "../recording-asked";
import { writeWebp } from "../../scripts/recording.mjs";
import { FRAMES, startScreenCapture, type Scene } from "./screen-capture";
import { APPIUM_PORT } from "./session";

/**
 * Readies a USB-connected iPhone for `phone.ts`: the XCUITest driver, a
 * WebDriverAgent signed by this Mac's Apple Development certificate, and an
 * Appium server (ADR 0016).
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEV = join(REPO, ".dev");
const APPIUM = join(REPO, "node_modules/.bin/appium");
const XCUITEST = "xcuitest@12.13.3";

/** Xcode itself: the command-line tools alone have no `devicectl` or iOS SDK. */
function developerDir(): string {
    const selected = execFileSync("xcode-select", ["-p"], { encoding: "utf8" }).trim();
    return selected.includes("CommandLineTools") ? "/Applications/Xcode.app/Contents/Developer" : selected;
}

/** The team in the Apple Development certificate's subject, as `OU=`. */
function teamId(): string {
    const pem = execFileSync("security", ["find-certificate", "-c", "Apple Development", "-p"], { encoding: "utf8" });
    const team = /^OU=(\w+)$/m.exec(new X509Certificate(pem).subject)?.[1];
    if (!team) throw new Error("No Apple Development certificate: Xcode → Settings → Accounts → Manage Certificates.");
    return team;
}

function devicectl(env: NodeJS.ProcessEnv, ...args: string[]): any {
    const out = join(DEV, "devicectl.json");
    execFileSync("xcrun", ["devicectl", ...args, "--quiet", "--json-output", out], { env });
    return JSON.parse(readFileSync(out, "utf8")).result;
}

/** The iPhone on the cable, unlocked: a locked one leaves WebDriverAgent waiting out the test's timeout. */
function connectedPhone(env: NodeJS.ProcessEnv): string {
    const phone = (devicectl(env, "list", "devices").devices as any[]).find(
        (d) => d.connectionProperties.transportType === "wired" && d.hardwareProperties.reality === "physical"
    );
    if (!phone) throw new Error("No iPhone or iPad on USB.");
    // Written against an iPhone; an iPad runs it too, though some specs assume a phone.
    if (!["iPhone", "iPad"].includes(phone.hardwareProperties.deviceType))
        throw new Error(`${phone.deviceProperties.name} is not an iPhone or iPad: the harness drives only those.`);
    const { udid } = phone.hardwareProperties;
    if (devicectl(env, "device", "info", "lockState", "--device", udid).passcodeRequired)
        throw new Error(`Unlock ${phone.deviceProperties.name}.`);
    return udid;
}

function installDriver(env: NodeJS.ProcessEnv): void {
    const installed = execFileSync(APPIUM, ["driver", "list", "--installed", "--json"], { env, encoding: "utf8" });
    if (!("xcuitest" in JSON.parse(installed)))
        execFileSync(APPIUM, ["driver", "install", XCUITEST], { env, stdio: "inherit" });
    const context = join(env.APPIUM_HOME!, "node_modules/appium-xcuitest-driver/build/lib/commands/context.js");
    writeFileSync(context, oneConsoleListener(readFileSync(context, "utf8")));
}

/** Incremental after the first run; re-signs when the free profile's week is up. */
function buildWebDriverAgent(env: NodeJS.ProcessEnv): void {
    const project = join(env.APPIUM_HOME!, "node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent");
    execFileSync(
        "xcodebuild",
        [
            "build-for-testing",
            ...["-project", join(project, "WebDriverAgent.xcodeproj"), "-scheme", "WebDriverAgentRunner"],
            ...["-destination", "generic/platform=iOS", "-derivedDataPath", env.IOS_WDA_DATA!],
            "-allowProvisioningUpdates",
            `DEVELOPMENT_TEAM=${env.IOS_TEAM_ID}`,
            `PRODUCT_BUNDLE_IDENTIFIER=${env.IOS_WDA_BUNDLE}`,
        ],
        { env, stdio: ["ignore", openSync(join(DEV, "wda-build.log"), "w"), "inherit"] }
    );
}

async function waitForAppium(): Promise<void> {
    for (const deadline = Date.now() + 30_000; Date.now() < deadline;) {
        try {
            if ((await fetch(`http://127.0.0.1:${APPIUM_PORT}/status`)).ok) return;
        } catch {
            // Not listening yet.
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Appium did not start: see ${join(DEV, "appium.log")}`);
}

/**
 * Encodes the frames inside the scene the recording marked, if it did: the
 * Focus banner iOS shows as a capture starts and stops falls outside it.
 */
/**
 * How much later a touch shows in the frames than the harness logs it: a
 * gesture is logged as Appium answers, after it ends. Measured: a key's bubble
 * shows 120–150 ms before, a stroke's scroll 160.
 */
const TOUCH_SHIFT_MS = -150;

function encodeScene(): void {
    let scene: Scene;
    try {
        scene = JSON.parse(readFileSync(join(FRAMES, "scene.json"), "utf8")) as Scene;
    } catch {
        return;
    }
    const touches = join(FRAMES, "touches.json");
    writeFileSync(touches, JSON.stringify(scene.touches));
    execFileSync(
        "swift",
        [
            "-O",
            join(REPO, "scripts/draw-touches.swift"),
            FRAMES,
            touches,
            String(scene.screenWidth),
            String(TOUCH_SHIFT_MS),
        ],
        { stdio: "inherit" }
    );
    const frames = readdirSync(FRAMES)
        .filter((name) => name.endsWith(".png"))
        .map((name) => ({ timestamp: Number(name.slice(0, -4)) / 1000, path: join(FRAMES, name) }))
        .filter(({ timestamp }) => timestamp >= scene.start && timestamp <= scene.end)
        .sort((a, b) => a.timestamp - b.timestamp);
    // Lossy: a glide changes the whole screen each frame, which lossless keeps at twice the size.
    // Thirty a second: a key's bubble shows for some 60 ms, and a glide is choppy at ten.
    writeWebp(frames, scene.output, { quality: 80, minInterval: 1 / 30 });
}

/** Appium serving the phone on the cable; returns what stops it. */
export default async function startAppium(): Promise<() => Promise<void>> {
    mkdirSync(DEV, { recursive: true });
    loadLocalEnv(join(REPO, "e2e-tests/ios/.env"));
    // A typo fails here, not after the run.
    keyboardAfterRun(process.env);
    const team = teamId();
    // Set here, the workers inherit them.
    Object.assign(process.env, {
        APPIUM_HOME: join(DEV, "appium"),
        DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? developerDir(),
        IOS_TEAM_ID: team,
        IOS_WDA_BUNDLE: `dev.team${team.toLowerCase()}.WebDriverAgentRunner`,
        IOS_WDA_DATA: join(DEV, "wda"),
    });
    process.env.IOS_UDID = connectedPhone(process.env);
    // First, before WebDriverAgent connects: starting a capture drops its connection.
    let stopCapture = async () => {};
    if (recordingAsked()) {
        rmSync(FRAMES, { recursive: true, force: true });
        stopCapture = await startScreenCapture(FRAMES, 600);
    }
    installDriver(process.env);
    buildWebDriverAgent(process.env);

    const appium = spawn(
        APPIUM,
        ["--port", String(APPIUM_PORT), "--log", join(DEV, "appium.log"), "--log-level", "info:debug"],
        { env: process.env, stdio: "ignore" }
    );
    try {
        await waitForAppium();
    } catch (e) {
        stopAppium(appium);
        await stopCapture();
        throw e;
    }
    return async () => {
        stopAppium(appium);
        await stopCapture();
        // A capture's scene.json stays among the frames: re-encoding it on a plain run rewrote the README's.
        if (recordingAsked()) encodeScene();
    };
}

/**
 * Appium, and the WebDriverAgent it started on the phone: Appium runs its
 * xcodebuild in a process group of its own, which outlives Appium.
 */
function stopAppium(appium: ChildProcess): void {
    appium.kill();
    spawnSync("pkill", ["-f", `xcodebuild test-without-building .* -derivedDataPath ${process.env.IOS_WDA_DATA} `]);
}
