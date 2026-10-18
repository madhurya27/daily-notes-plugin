import { App, Platform, SuggestModal, setIcon } from "obsidian";
import type { DailyNoteService } from "../notes/daily-note-service";
import { moment, type Moment } from "../notes/moment";

/** The one format every reader can fall back on, whatever their vault uses. */
const ISO_FORMAT = "YYYY-MM-DD";

/** About two months of notes on open: the list draws fast on a phone (D-128). */
export const JUMP_OPEN_LIMIT = 62;
/** About a year once a query is typed, so a year lists all its notes. */
export const JUMP_SEARCH_LIMIT = 366;

/** A date the reader can jump to; `fallback` when no note carries it. */
interface JumpChoice {
    date: Moment;
    /** The date as this vault's filenames spell it. */
    label: string;
    /** What the jump will do instead, when the date itself has no note. */
    fallback: string | null;
    /** The label, lowercased, and the ISO date: what a query is found in, spelled once per open. */
    searchText: string;
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
        this.limit = JUMP_SEARCH_LIMIT;
        this.choices = service.dates().map((date) => this.choice(date, null));

        this.setPlaceholder(`Jump to a date, e.g. ${service.formatDate(moment())}`);
        this.emptyStateText = "No daily note, and no date to jump to.";
        this.addCalendarButton();
    }

    /**
     * On a phone, the list opens without the keyboard covering half of it; the
     * reader taps the query to type, or the calendar.
     */
    open(): void {
        super.open();
        if (Platform.isMobile) this.inputEl.blur();
    }

    getSuggestions(query: string): JumpChoice[] {
        const needle = query.trim().toLowerCase();
        if (!needle) return this.choices.slice(0, JUMP_OPEN_LIMIT);

        const matches = this.choices.filter((choice) => choice.searchText.includes(needle));
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
        const label = this.service.formatDate(date);
        // Both: the reader may reach for ISO whatever their own filenames look
        // like. The separator keeps a query from spanning the two.
        return { date, label, fallback, searchText: `${label.toLowerCase()}\u0000${date.format(ISO_FORMAT)}` };
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
            // Stryker disable next-line BooleanLiteral: a date input's value is a whole ISO date or empty.
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
