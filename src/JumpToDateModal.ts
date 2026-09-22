import { App, Modal, Setting, TextComponent, moment } from "obsidian";
import type { Moment } from "./DailyNoteService";

const DATE_FORMAT = "YYYY-MM-DD";

/** Asks for a date and hands back the moment it parses to. */
export class JumpToDateModal extends Modal {
    private readonly onSubmit: (_target: Moment) => void;

    constructor(app: App, onSubmit: (_target: Moment) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        this.setTitle("Jump to date");

        // A native date control: the platform's own picker, desktop and mobile.
        // Full width, with the button under it, the way Obsidian's own modals
        // lay a single field out — a Setting row would strand it at the right.
        const field = new TextComponent(this.contentEl);
        field.inputEl.type = "date";
        field.inputEl.addClass("daily-notes-jump-input");

        const submit = () => {
            const target = moment(field.inputEl.value, DATE_FORMAT, true);
            if (!target.isValid()) return;
            this.close();
            this.onSubmit(target);
        };

        new Setting(this.contentEl).addButton((button) => button.setButtonText("Jump").setCta().onClick(submit));

        // The modal owns its scope, so Enter needs no teardown of ours.
        this.scope.register([], "Enter", submit);
        field.inputEl.focus();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
