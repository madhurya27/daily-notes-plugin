import { execFileSync, spawn, spawnSync, type ChildProcess } from "child_process";
import { X509Certificate } from "crypto";
import { mkdirSync, openSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
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
    if (!phone) throw new Error("No iPhone on USB.");
    // Written and checked against iPhones only.
    if (phone.hardwareProperties.deviceType !== "iPhone")
        throw new Error(`${phone.deviceProperties.name} is not an iPhone: the harness drives iPhones only.`);
    const { udid } = phone.hardwareProperties;
    if (devicectl(env, "device", "info", "lockState", "--device", udid).passcodeRequired)
        throw new Error(`Unlock ${phone.deviceProperties.name}.`);
    return udid;
}

function installDriver(env: NodeJS.ProcessEnv): void {
    const installed = execFileSync(APPIUM, ["driver", "list", "--installed", "--json"], { env, encoding: "utf8" });
    if (!("xcuitest" in JSON.parse(installed)))
        execFileSync(APPIUM, ["driver", "install", XCUITEST], { env, stdio: "inherit" });
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

/** Appium serving the phone on the cable; returns what stops it. */
export default async function startAppium(): Promise<() => void> {
    mkdirSync(DEV, { recursive: true });
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
        throw e;
    }
    return () => stopAppium(appium);
}

/**
 * Appium, and the WebDriverAgent it started on the phone: Appium runs its
 * xcodebuild in a process group of its own, which outlives Appium.
 */
function stopAppium(appium: ChildProcess): void {
    appium.kill();
    spawnSync("pkill", ["-f", `xcodebuild test-without-building .* -derivedDataPath ${process.env.IOS_WDA_DATA} `]);
}
