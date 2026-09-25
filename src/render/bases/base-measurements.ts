/**
 * What the stream's Bases measured, kept on the plugin: Back rebuilds the view,
 * and a Base redrawn without the height it left at drops and grows back while
 * Bases refills it. Keys hold the note, width and source, so every view can
 * share them.
 */
export class BaseMeasurements {
    /** Bases measured too wide for a table. */
    readonly tooWide = new Set<string>();
    /** The height each Base last laid out at. */
    readonly heights = new Map<string, number>();
}
