import { TFile } from "obsidian";

export type StreamEvent =
    | { type: "note-inserted"; index: number; file: TFile }
    | { type: "note-removed"; index: number; file: TFile }
    | { type: "note-updated"; index: number; file: TFile }
    | { type: "notes-replaced"; notes: TFile[] };

type StreamEventHandler = (e: StreamEvent) => void;

export class StreamState {
    private _notes: TFile[] = [];
    private _handlers: StreamEventHandler[] = [];

    get notes(): readonly TFile[] {
        return [...this._notes];
    }

    on(handler: StreamEventHandler): () => void {
        this._handlers.push(handler);
        return () => {
            this._handlers = this._handlers.filter(h => h !== handler);
        };
    }

    private emit(event: StreamEvent): void {
        for (const handler of this._handlers) {
            handler(event);
        }
    }

    insert(index: number, file: TFile): void {
        this._notes.splice(index, 0, file);
        this.emit({ type: "note-inserted", index, file });
    }

    remove(filePath: string): void {
        const index = this._notes.findIndex(n => n.path === filePath);
        if (index === -1) return;
        const file = this._notes[index]!;
        this._notes.splice(index, 1);
        this.emit({ type: "note-removed", index, file });
    }

    update(file: TFile): void {
        const index = this._notes.findIndex(n => n.path === file.path);
        if (index === -1) return;
        this._notes[index] = file;
        this.emit({ type: "note-updated", index, file });
    }

    reset(notes: TFile[] = []): void {
        this._notes = [...notes];
        this.emit({ type: "notes-replaced", notes: this._notes });
    }

    findIndex(filePath: string): number {
        return this._notes.findIndex(n => n.path === filePath);
    }

    getAt(index: number): TFile | undefined {
        return this._notes[index];
    }

    get length(): number {
        return this._notes.length;
    }
}
