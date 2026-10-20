/** Whether this run records a README recording: only the `capture:recording` commands ask. */
export function recordingAsked(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.CAPTURE_RECORDING === "1";
}
