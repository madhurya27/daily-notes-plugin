import { moment as obsidianMoment } from "obsidian";

/**
 * The part of moment the plugin uses. Obsidian's types reach moment's through
 * its own dependency, which the community scorecard's lint cannot resolve
 * (D-152); a test holds the real moment to this type. Another moment is passed
 * as its milliseconds, which moment takes as readily.
 */
export interface Moment {
    add(amount: number, unit: "day"): Moment;
    clone(): Moment;
    diff(other: number): number;
    format(pattern?: string): string;
    isSame(other: number, unit: "day"): boolean;
    isValid(): boolean;
    startOf(unit: "day"): Moment;
    valueOf(): number;
}

export interface MomentFactory {
    (): Moment;
    (text: string, format: string, strict: boolean): Moment;
}

export const moment = obsidianMoment as unknown as MomentFactory;
