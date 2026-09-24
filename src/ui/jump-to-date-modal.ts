import { App, SuggestModal, moment, setIcon } from "obsidian";
import type { DailyNoteService, Moment } from "../notes/daily-note-service";

/** The one format every reader can fall back on, whatever their vault uses. */
const ISO_FORMAT = "YYYY-MM-DD";

/** As many dates as a reader scans before narrowing the query instead. */
export const JUMP_SUGGESTION_LIMIT = 50;

/** A date the reader can jump to; `fallback` when no note carries it. */
interface JumpChoice {
    date: Moment;
    /** The date as this vault's filenames spell it. */
    label: string;
    /** What the jump will do instead, when the date itself has no note. */
    fallback: string | null;
}

/**
 * Offers the days this vault actually has a note for, so a jump lands on one
 * the reader chose rather than on the silent nearest older note. A date with no
 * note is still reachable — as one entry that says what it will do.
 */
export class JumpToDateModal extends SuggestModal<JumpChoice> {
    private readonly service: DailyNoteService;
    private readonly onSubmit: (_target: Moment) => void;
    /** Snapshotted on open: the vault cannot change under a modal. */
    private readonly choices: JumpChoice[];

    constructor(app: App, service: DailyNoteService, onSubmit: (_target: Moment) => void) {
        super(app);
        this.service = service;
        this.onSubmit = onSubmit;
        this.limit = JUMP_SUGGESTION_LIMIT;
        this.choices = service.dates().map((date) => this.choice(date, null));

        this.setPlaceholder(`Jump to a date, e.g. ${service.formatDate(moment())}`);
        this.emptyStateText = "No daily note, and no date to jump to.";
        this.addCalendarButton();
    }

    getSuggestions(query: string): JumpChoice[] {
        const needle = query.trim().toLowerCase();
        if (!needle) return this.choices;

        // Both haystacks: the reader may reach for ISO whatever their own
        // filenames look like.
        const matches = this.choices.filter(
            (choice) => choice.label.toLowerCase().includes(needle) || choice.date.format(ISO_FORMAT).includes(needle)
        );
        if (matches.length > 0) return matches;

        const typed = this.readDate(query.trim());
        return typed ? [this.choice(typed, "Jump to the nearest older note")] : [];
    }

    renderSuggestion(choice: JumpChoice, el: HTMLElement): void {
        el.createDiv({ text: choice.fallback ? `${choice.label} has no note` : choice.label });
        if (choice.fallback) el.createDiv({ cls: "daily-notes-jump-fallback", text: choice.fallback });
    }

    onChooseSuggestion(choice: JumpChoice): void {
        this.onSubmit(choice.date);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    /** This vault's own spelling first, then ISO. */
    private readDate(text: string): Moment | null {
        const own = this.service.parseNoteDate(text);
        if (own) return own;
        const iso = moment(text, ISO_FORMAT, true);
        return iso.isValid() ? iso : null;
    }

    private choice(date: Moment, fallback: string | null): JumpChoice {
        return { date, label: this.service.formatDate(date), fallback };
    }

    /**
     * The platform's own date wheel, beside the query rather than instead of
     * it: typing is faster for a date the reader knows, and picking is easier
     * for one they are looking for. The icon's tap target is the date input
     * itself, invisible over it: iOS has `showPicker()` but opens nothing from
     * it, only for a tap on the input. Desktop needs `showPicker()`, since a
     * click on a date input's text only focuses it.
     */
    private addCalendarButton(): void {
        // SuggestModal always wraps its input in the prompt's container; the
        // cast states that contract rather than branch on it.
        const container = this.inputEl.parentElement as HTMLElement;
        const icon = container.createDiv({ cls: "clickable-icon daily-notes-jump-calendar" });
        setIcon(icon, "calendar");
        const picker = icon.createEl("input", {
            type: "date",
            cls: "daily-notes-jump-picker",
            attr: { "aria-label": "Pick a date" },
        });

        picker.onclick = () => {
            if (typeof picker.showPicker === "function") picker.showPicker();
        };
        // A property, not a registration: the picker dies with the modal, and
        // one handler is all a single element can hold.
        picker.onchange = () => {
            const picked = moment(picker.value, ISO_FORMAT, true);
            if (!picked.isValid()) return;
            // Through the query, not straight to the jump: the reader sees what
            // they picked, and can correct it without reopening the wheel.
            // Focus stays: iOS fires this as its wheel opens, and moving focus
            // would close it. Enter still reaches the modal from the picker.
            this.inputEl.value = this.service.formatDate(picked);
            this.inputEl.dispatchEvent(new Event("input"));
        };
    }
}
