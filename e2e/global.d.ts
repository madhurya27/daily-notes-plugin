/** The Obsidian app object the renderer exposes on window; typed loosely on purpose. */
declare global {
    interface Window {
        app: any;
        /** Obsidian's Electron bridge; the harness hides the window through it. */
        electron: any;
        /** history.spec's reading of the stream's place, defined by its `measurePlaces`. */
        streamPlace?: () => string | undefined;
    }
}
export {};
