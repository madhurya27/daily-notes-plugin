// Scores placeholder estimates against the heights e2e/estimates.spec.ts measured.
import { readFileSync } from "fs";

const d = JSON.parse(readFileSync(".dev/estimates.json", "utf8"));
const text = (path) => d.texts[path];
const template = d.template;
const templateLines = new Set(template.split("\n").map((l) => l.trim()));

/** Lines of body text beyond the template, each wrapped at the column's width. */
function wrappedLines(path, m) {
    const body = text(path).replace(/^---[\s\S]*?---\n/, "");
    let lines = 0;
    for (const line of body.split("\n")) {
        const t = line.trim();
        if (!t || templateLines.has(t) || t.startsWith("![[")) continue;
        lines += Math.max(1, Math.ceil((t.length * m.text.charWidth) / m.text.width));
    }
    return lines;
}
const embeds = (path) => (text(path).match(/!\[\[/g) ?? []).length;

function score(name, to, from, estimate) {
    const T = d.results[to],
        F = d.results[from];
    const errs = Object.entries(T.heights).map(([p, h]) => estimate(p, T, F) - h);
    const abs = errs.map(Math.abs).sort((a, b) => a - b);
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const rel = Object.entries(T.heights)
        .map(([p, h]) => Math.abs(estimate(p, T, F) - h) / h)
        .sort((a, b) => a - b);
    console.log(
        `${to.padEnd(9)} ${name.padEnd(34)} mean|err| ${mean(abs).toFixed(0).padStart(4)}  median|err| ${abs[abs.length >> 1].toFixed(0).padStart(4)}  median %err ${(100 * rel[rel.length >> 1]).toFixed(0).padStart(3)}%  mean signed ${mean(errs).toFixed(0).padStart(5)}`
    );
}

/** Fits height = template + a·lines + b·embeds by least squares at `m`, template taken as measured. */
function fit(m) {
    const rows = Object.entries(m.heights).map(([p, h]) => [wrappedLines(p, m), embeds(p), h - m.template]);
    // Two-variable least squares, no intercept.
    const s = (f) => rows.reduce((acc, r) => acc + f(r), 0);
    const xx = s((r) => r[0] * r[0]),
        xy = s((r) => r[0] * r[1]),
        yy = s((r) => r[1] * r[1]);
    const xz = s((r) => r[0] * r[2]),
        yz = s((r) => r[1] * r[2]);
    const det = xx * yy - xy * xy;
    return { perLine: (xz * yy - yz * xy) / det, perEmbed: (xx * yz - xy * xz) / det };
}

for (const [to, from] of [
    ["portrait", "landscape"],
    ["landscape", "portrait"],
]) {
    const median = (m, except) => {
        const hs = Object.entries(m.heights)
            .filter(([p]) => p !== except)
            .map(([, h]) => h)
            .sort((a, b) => a - b);
        return hs[hs.length >> 1];
    };
    const other = fit(d.results[from]);
    score("400px (now, new notes)", to, from, () => 400);
    score("height at the other width (now)", to, from, (p, T, F) => F.heights[p]);
    score("median here, others measured", to, from, (p, T) => median(T, p));
    score("template here", to, from, (p, T) => T.template);
    score("template + lines × line height", to, from, (p, T) => T.template + wrappedLines(p, T) * T.text.lineHeight);
    score(
        "template + fit from other width",
        to,
        from,
        (p, T) => T.template + other.perLine * wrappedLines(p, T) + other.perEmbed * embeds(p)
    );
    score(
        "other width, its text re-wrapped",
        to,
        from,
        (p, T, F) => F.heights[p] + (wrappedLines(p, T) - wrappedLines(p, F)) * T.text.lineHeight
    );
    console.log(
        `          fit at ${from}: ${other.perLine.toFixed(1)}px per line, ${other.perEmbed.toFixed(0)}px per embed`
    );
}

console.log("\nsplit by embeds:");
for (const [to, from] of [
    ["portrait", "landscape"],
    ["landscape", "portrait"],
]) {
    const T = d.results[to],
        F = d.results[from];
    const other = fit(F);
    const ests = {
        "400px": () => 400,
        "other width (now)": (p) => F.heights[p],
        "template + lines × 24": (p) => T.template + wrappedLines(p, T) * T.text.lineHeight,
        "template + fit": (p) => T.template + other.perLine * wrappedLines(p, T) + other.perEmbed * embeds(p),
        "other width re-wrapped": (p) => F.heights[p] + (wrappedLines(p, T) - wrappedLines(p, F)) * T.text.lineHeight,
    };
    for (const withEmbeds of [false, true]) {
        const paths = Object.keys(T.heights).filter((p) => embeds(p) > 0 === withEmbeds);
        const line = Object.entries(ests).map(([n, e]) => {
            const abs = paths.map((p) => Math.abs(e(p) - T.heights[p])).sort((a, b) => a - b);
            return `${n}: ${Math.round(abs.reduce((s, x) => s + x, 0) / abs.length)}/${Math.round(abs[abs.length >> 1])}`;
        });
        console.log(
            `${to.padEnd(9)} ${withEmbeds ? "embeds" : "text  "} n=${String(paths.length).padStart(2)}  ${line.join("  ")}`
        );
    }
}

console.log("\nembed buffer:");
for (const to of ["portrait", "landscape"]) {
    const T = d.results[to];
    const paths = Object.keys(T.heights).filter((p) => embeds(p) > 0);
    const base = (p) => T.template + wrappedLines(p, T) * T.text.lineHeight;
    const residuals = paths.map((p) => (T.heights[p] - base(p)) / embeds(p)).sort((a, b) => a - b);
    const perEmbedHere = residuals[residuals.length >> 1];
    const errOf = (buffer, est) => {
        const abs = paths.map((p) => Math.abs(est(p) + buffer * embeds(p) - T.heights[p]));
        return Math.round(abs.reduce((s, x) => s + x, 0) / abs.length);
    };
    const viewport = to === "portrait" ? 874 : 402;
    console.log(
        `${to}: ideal buffer per embed here ${Math.round(perEmbedHere)} (spread ${Math.round(residuals[0])}..${Math.round(residuals.at(-1))})`
    );
    for (const b of [0, 200, 400, 600, 800, Math.round(perEmbedHere), viewport, Math.round(viewport / 2)])
        console.log(`   buffer ${String(b).padStart(4)}: template+lines ${errOf(b, base)}`);
}
