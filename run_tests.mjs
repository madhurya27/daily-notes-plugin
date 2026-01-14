import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to redirect imports
const mockPlugin = {
    name: 'mock-plugin',
    setup(build) {
        // Redirect 'obsidian' to our mock
        build.onResolve({ filter: /^obsidian$/ }, args => {
            return { path: path.resolve(__dirname, 'tests/mocks/obsidian.ts') };
        });

        // Redirect 'obsidian-daily-notes-interface' to our mock
        build.onResolve({ filter: /^obsidian-daily-notes-interface$/ }, args => {
            return { path: path.resolve(__dirname, 'tests/mocks/daily-notes-interface.ts') };
        });
    },
};

async function run() {
    try {
        await esbuild.build({
            entryPoints: ['tests/DailyNoteService.test.ts', 'tests/DailyNotesStreamView.test.ts'],
            bundle: true,
            platform: 'node',
            format: 'esm',
            outdir: 'tests/dist', // Changed to outdir for multiple entry points
            plugins: [mockPlugin],
            external: [],
        });

        console.log("Build successful. Running tests...");
        
        // Execute the tests
        await import('./tests/dist/DailyNoteService.test.js');
        await import('./tests/dist/DailyNotesStreamView.test.js');

    } catch (e) {
        console.error("Build failed:", e);
        process.exit(1);
    }
}

run();
