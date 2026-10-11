import { describe, it, expect, vi } from "vitest";
import type { App, ItemView } from "obsidian";
import {
    getPropertyIcon,
    getReadableLineLength,
    getSearchHotkeys,
    getViewTitle,
    onPostProcessorChange,
    onVaultConfigChange,
    openTagSearch,
    removeLocalStorageKeys,
} from "../src/obsidian-internals";

/** Builds an App-shaped object; `config` is the internal vault config under test. */
const makeApp = (config?: unknown): App => ({ vault: { config } }) as unknown as App;

describe("getReadableLineLength", () => {
    it("returns the configured value when readable line length is on", () => {
        expect(getReadableLineLength(makeApp({ readableLineLength: true }))).toBe(true);
    });

    it("returns the configured value when readable line length is off", () => {
        expect(getReadableLineLength(makeApp({ readableLineLength: false }))).toBe(false);
    });

    it("defaults to true when the setting is absent from the config", () => {
        expect(getReadableLineLength(makeApp({}))).toBe(true);
    });

    it("defaults to true when the internal config is unavailable", () => {
        expect(getReadableLineLength({} as App)).toBe(true);
    });
});

describe("onVaultConfigChange", () => {
    /** Captures the "raw" subscription so a test can fire paths at it. */
    function makeVaultApp(configDir: string) {
        let raw: ((path: string) => void) | null = null;
        const ref = {};
        const app = {
            vault: {
                configDir,
                on: (name: string, cb: (path: string) => void) => {
                    if (name === "raw") raw = cb;
                    return ref;
                },
            },
        } as unknown as App;
        return { app, ref, fire: (path: string) => raw?.(path) };
    }

    it("calls back when a file under the config directory changes", () => {
        const { app, fire } = makeVaultApp(".obsidian");
        const handler = vi.fn();
        onVaultConfigChange(app, handler);

        fire(".obsidian/daily-notes.json");

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("ignores vault notes, which arrive on the same event", () => {
        const { app, fire } = makeVaultApp(".obsidian");
        const handler = vi.fn();
        onVaultConfigChange(app, handler);

        fire("Notes/2025-01-01.md");

        expect(handler).not.toHaveBeenCalled();
    });

    it("returns the event ref, so the caller can register it for cleanup", () => {
        const { app, ref } = makeVaultApp(".obsidian");
        expect(onVaultConfigChange(app, vi.fn())).toBe(ref);
    });
});

describe("onPostProcessorChange", () => {
    it("subscribes the handler to the workspace's undeclared event, returning its ref", () => {
        const ref = {};
        const on = vi.fn().mockReturnValue(ref);
        const app = { workspace: { on } } as unknown as App;
        const handler = vi.fn();

        expect(onPostProcessorChange(app, handler)).toBe(ref);
        expect(on).toHaveBeenCalledWith("post-processor-change", handler);
    });
});

describe("openTagSearch", () => {
    /** An App whose global-search plugin is present, absent, or instance-less. */
    function makeSearchApp(plugin: unknown) {
        const getPluginById = vi.fn().mockReturnValue(plugin);
        return { app: { internalPlugins: { getPluginById } } as unknown as App, getPluginById };
    }

    it("opens the global search with the tag as its query", async () => {
        const openGlobalSearch = vi.fn();
        const { app, getPluginById } = makeSearchApp({ instance: { openGlobalSearch } });

        await openTagSearch(app, "work");

        expect(getPluginById).toHaveBeenCalledWith("global-search");
        expect(openGlobalSearch).toHaveBeenCalledWith("tag:#work");
    });

    it("takes a tag already written with its hash", async () => {
        const openGlobalSearch = vi.fn();
        const { app } = makeSearchApp({ instance: { openGlobalSearch } });

        await openTagSearch(app, "#work/daily");

        expect(openGlobalSearch).toHaveBeenCalledWith("tag:#work/daily");
    });

    it("quotes a tag holding a space, so the query stays one term", async () => {
        const openGlobalSearch = vi.fn();
        const { app } = makeSearchApp({ instance: { openGlobalSearch } });

        await openTagSearch(app, "on hold");

        expect(openGlobalSearch).toHaveBeenCalledWith('tag:"#on hold"');
    });

    it("opens the search in a new pane of the asked-for type", async () => {
        const openGlobalSearch = vi.fn();
        const { app } = makeSearchApp({ instance: { openGlobalSearch } });
        const view = { setQuery: vi.fn() };
        const leaf = { view, setViewState: vi.fn().mockResolvedValue(undefined) };
        const getLeaf = vi.fn().mockReturnValue(leaf);
        (app as unknown as { workspace: unknown }).workspace = { getLeaf };

        await openTagSearch(app, "work", "tab");

        expect(getLeaf).toHaveBeenCalledWith("tab");
        expect(leaf.setViewState).toHaveBeenCalledWith({ type: "search", active: true });
        expect(view.setQuery).toHaveBeenCalledWith("tag:#work");
        expect(openGlobalSearch).not.toHaveBeenCalled();
    });

    it("takes Keymap's bare `true` as the default new pane, a tab", async () => {
        const { app } = makeSearchApp({ instance: { openGlobalSearch: vi.fn() } });
        const leaf = { view: { setQuery: vi.fn() }, setViewState: vi.fn().mockResolvedValue(undefined) };
        const getLeaf = vi.fn().mockReturnValue(leaf);
        (app as unknown as { workspace: unknown }).workspace = { getLeaf };

        await openTagSearch(app, "work", true);

        expect(getLeaf).toHaveBeenCalledWith("tab");
    });

    it("leaves a new pane's query alone when its view exposes none", async () => {
        const { app } = makeSearchApp({ instance: { openGlobalSearch: vi.fn() } });
        const leaf = { view: {}, setViewState: vi.fn().mockResolvedValue(undefined) };
        (app as unknown as { workspace: unknown }).workspace = { getLeaf: vi.fn().mockReturnValue(leaf) };

        await expect(openTagSearch(app, "work", "split")).resolves.toBeUndefined();
    });

    it("does nothing when the search plugin is disabled", () => {
        const { app } = makeSearchApp(undefined);
        expect(() => openTagSearch(app, "work")).not.toThrow();
    });

    it("does nothing when the plugin exposes no instance", () => {
        const { app } = makeSearchApp({});
        expect(() => openTagSearch(app, "work")).not.toThrow();
    });

    it("does nothing when the internal plugin registry is unavailable", () => {
        expect(() => openTagSearch({} as App, "work")).not.toThrow();
    });
});

describe("getPropertyIcon", () => {
    /** The type manager's shape: `expected` is the assigned type, `inferred` the value's. */
    const makeTypeApp = (getTypeInfo?: unknown): App =>
        ({ metadataTypeManager: getTypeInfo ? { getTypeInfo } : {} }) as unknown as App;

    it("takes the icon off the type assigned to the key", () => {
        const app = makeTypeApp(() => ({
            expected: { type: "date", icon: "lucide-calendar" },
            inferred: { type: "text", icon: "lucide-text" },
        }));
        expect(getPropertyIcon(app, "created", "2026-09-22")).toBe("lucide-calendar");
    });

    it("falls back to the type inferred from the value when the key has none assigned", () => {
        const app = makeTypeApp(() => ({ expected: null, inferred: { type: "number", icon: "lucide-binary" } }));
        expect(getPropertyIcon(app, "steps", 12000)).toBe("lucide-binary");
    });

    it("asks about the key and its value, as Obsidian's own property row does", () => {
        const getTypeInfo = vi.fn().mockReturnValue({ expected: { icon: "lucide-list" }, inferred: null });
        getPropertyIcon(makeTypeApp(getTypeInfo), "topics", ["a", "b"]);
        expect(getTypeInfo).toHaveBeenCalledWith("topics", ["a", "b"]);
    });

    it("returns null when the type manager resolves no type", () => {
        expect(
            getPropertyIcon(
                makeTypeApp(() => undefined),
                "mystery",
                null
            )
        ).toBeNull();
    });

    it("returns null when the internal type manager is unavailable", () => {
        expect(getPropertyIcon({} as App, "tags", ["a"])).toBeNull();
    });

    it("returns null when the type manager exposes no lookup", () => {
        expect(getPropertyIcon(makeTypeApp(), "tags", ["a"])).toBeNull();
    });
});

describe("getSearchHotkeys", () => {
    /** An app whose hotkey manager holds `custom` and `defaults` for every command. */
    const withHotkeys = (custom: unknown, defaults: unknown) =>
        ({
            hotkeyManager: {
                getHotkeys: (id: string) => (id === "editor:open-search" ? custom : undefined),
                getDefaultHotkeys: (id: string) => (id === "editor:open-search" ? defaults : undefined),
            },
        }) as unknown as App;

    it("reads the binding the user set for Search current file", () => {
        const custom = [{ modifiers: ["Mod", "Shift"], key: "S" }];
        expect(getSearchHotkeys(withHotkeys(custom, [{ modifiers: ["Mod"], key: "F" }]))).toEqual(custom);
    });

    it("keeps an emptied binding: the user unbound search", () => {
        expect(getSearchHotkeys(withHotkeys([], [{ modifiers: ["Mod"], key: "F" }]))).toEqual([]);
    });

    it("falls back to Obsidian's default binding", () => {
        const defaults = [{ modifiers: ["Mod"], key: "F" }];
        expect(getSearchHotkeys(withHotkeys(undefined, defaults))).toEqual(defaults);
    });

    it("falls back to Mod+F when Obsidian knows no binding for it", () => {
        expect(getSearchHotkeys(withHotkeys(undefined, undefined))).toEqual([{ modifiers: ["Mod"], key: "F" }]);
    });

    it("falls back to Mod+F once the internal is gone", () => {
        expect(getSearchHotkeys({} as App)).toEqual([{ modifiers: ["Mod"], key: "F" }]);
    });
});

describe("getViewTitle", () => {
    it("returns the title in the view's header", () => {
        const titleEl = document.createElement("div");
        expect(getViewTitle({ titleEl } as unknown as ItemView)).toBe(titleEl);
    });

    it("returns null once the internal is gone", () => {
        expect(getViewTitle({} as ItemView)).toBeNull();
    });
});

describe("removeLocalStorageKeys", () => {
    /** Storage holding `keys`, as several vaults' saveLocalStorage would leave it. */
    function storageOf(...keys: string[]): Storage {
        const storage = new Map(keys.map((key) => [key, "true"]));
        return {
            get length() {
                return storage.size;
            },
            key: (index: number) => [...storage.keys()][index] ?? null,
            removeItem: (key: string) => void storage.delete(key),
        } as Storage;
    }
    const app = { appId: "vault1" } as unknown as App;
    const keysOf = (storage: Storage) => Array.from({ length: storage.length }, (_, i) => storage.key(i));

    it("removes this vault's keys the predicate picks, by their unprefixed name, and counts them", () => {
        const storage = storageOf("vault1-old:a", "vault1-old:b", "vault1-kept", "vault2-old:a", "old:a");

        const removed = removeLocalStorageKeys(app, (name) => name.startsWith("old:"), storage);

        expect(removed).toBe(2);
        expect(keysOf(storage)).toEqual(["vault1-kept", "vault2-old:a", "old:a"]);
    });

    it("removes nothing when the vault has no id to scope by", () => {
        const storage = storageOf("old:a", "-old:a");

        expect(removeLocalStorageKeys({} as App, () => true, storage)).toBe(0);
        expect(keysOf(storage)).toEqual(["old:a", "-old:a"]);
    });
});
