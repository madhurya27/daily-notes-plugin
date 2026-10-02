/** The Obsidian app object the renderer exposes on window; typed loosely on purpose. */
declare global {
    interface Window {
        app: any;
        /** The moment.js Obsidian bundles and exposes. */
        moment: any;
        /** Obsidian's Electron bridge; the harness hides the window through it. */
        electron: any;
        /** history.spec's reading of the stream's place, defined by its `measurePlaces`. */
        streamPlace?: () => string | undefined;
        /** Each place the stream shows, frame by frame, until it holds still or `deadline`; also `measurePlaces`'. */
        streamPlaces?: (deadline: number) => Promise<string[]>;
    }
}
export {};
