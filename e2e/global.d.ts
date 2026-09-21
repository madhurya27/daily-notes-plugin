/** The Obsidian app object the renderer exposes on window; typed loosely on purpose. */
declare global {
    interface Window {
        app: any;
        /** Obsidian's Electron bridge; the harness hides the window through it. */
        electron: any;
    }
}
export {};
