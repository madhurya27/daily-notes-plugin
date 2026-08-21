import { TFile } from "obsidian";

export class StreamState {
    private _notes: TFile[] = [];

    /** The live internal array; `readonly` keeps callers from mutating it. */
    get notes(): readonly TFile[] {
        return this._notes;
    }

    append(files: TFile[]): void {
        this._notes.push(...files);
    }

    insert(index: number, file: TFile): void {
        this._notes.splice(index, 0, file);
    }

    remove(filePath: string): void {
        const index = this._notes.findIndex(n => n.path === filePath);
        if (index === -1) return;
        this._notes.splice(index, 1);
    }

    reset(notes: TFile[] = []): void {
        this._notes = [...notes];
    }

    get length(): number {
        return this._notes.length;
    }
}
