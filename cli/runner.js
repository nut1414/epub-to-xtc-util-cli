const fs = require('fs');
const path = require('path');

const XtcCore = require('../core/xtc-core.js');
const host = require('./wasm-host');
const canvasAdapter = require('./canvas-adapter');
const { ProgressPrinter, bar, fmtBytes } = require('./progress');
const { walkEpubs } = require('./walk');
const { WorkerPool } = require('./pool');
const { MultiProgress } = require('./multi-progress');

const DEFAULT_SETTINGS = {
    fontSize: 22,
    fontWeight: 400,
    lineHeight: 120,
    margin: 20,
    fontFace: 'Literata',
    deviceType: 'x4',
    hyphenationLang: 'auto',
    qualityMode: 'fast',
    bitDepth: 1,
    enableDithering: true,
    ditherStrength: 70,
    enableNegative: false,
    enableProgressBar: true,
    progressPosition: 'bottom',
    showProgressLine: true,
    showChapterMarks: true,
    showChapterProgress: false,
    progressFullWidth: false,
    showPageInfo: true,
    showBookPercent: true,
    showChapterPage: true,
    showChapterPercent: false,
    progressFontSize: 14,
    progressEdgeMargin: 0,
    progressSideMargin: 0,
    textAlign: -1,
    wordSpacing: 100,
    hyphenation: 0,
    ignoreDocMargins: false,
    fontHinting: 1,
    fontAntialiasing: 2,
    rotation: 0,
};

function loadSettingsFile(p) {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    const settings = parsed && parsed.settings ? parsed.settings : parsed;
    if (!settings || typeof settings !== 'object') {
        throw new Error('settings file does not contain a settings object');
    }
    return settings;
}

function mergeSettings(base, overrides) {
    const out = { ...base };
    for (const [k, v] of Object.entries(overrides || {})) {
        if (v !== undefined && v !== null) out[k] = v;
    }
    if (out.qualityMode === 'hq') {
        out.bitDepth = 2;
    } else {
        out.qualityMode = 'fast';
        out.bitDepth = 1;
    }
    return out;
}

function deviceDims(settings) {
    const cfg = settings.deviceType === 'x3'
        ? { width: 528, height: 792 }
        : { width: 480, height: 800 };
    const isLandscape = settings.rotation === 90 || settings.rotation === 270;
    const screenWidth = isLandscape ? cfg.height : cfg.width;
    const screenHeight = isLandscape ? cfg.width : cfg.height;
    return {
        deviceWidth: cfg.width,
        deviceHeight: cfg.height,
        screenWidth,
        screenHeight,
    };
}

function applySettingsToRenderer(renderer, settings) {
    renderer.setFontSize(settings.fontSize);
    if (renderer.setFontWeight) renderer.setFontWeight(settings.fontWeight);
    renderer.setInterlineSpace(settings.lineHeight);

    let topMargin = settings.margin;
    let bottomMargin = settings.margin;
    const edgeMargin = settings.progressEdgeMargin || 0;

    if (settings.enableProgressBar) {
        const hasBothLines = settings.showProgressLine && settings.showChapterProgress;
        const hasProgressLine = settings.showProgressLine || settings.showChapterProgress;
        const isFullWidth = settings.progressFullWidth;
        let progressHeight = XtcCore.PROGRESS_BAR_HEIGHT;
        if (settings.showChapterMarks || (isFullWidth && hasBothLines)) {
            progressHeight = XtcCore.PROGRESS_BAR_HEIGHT_EXTENDED;
        } else if (isFullWidth && hasProgressLine) {
            progressHeight = XtcCore.PROGRESS_BAR_HEIGHT_FULLWIDTH;
        }
        if (settings.progressPosition === 'bottom') {
            bottomMargin = Math.max(settings.margin, progressHeight + edgeMargin);
        } else {
            topMargin = Math.max(settings.margin, progressHeight + edgeMargin);
        }
    }

    renderer.setMargins(settings.margin, topMargin, settings.margin, bottomMargin);
    if (settings.fontFace) renderer.setFontFace(settings.fontFace);
    if (renderer.setTextAlign) renderer.setTextAlign(settings.textAlign);
    if (renderer.setWordSpacing) renderer.setWordSpacing(settings.wordSpacing);
    if (renderer.setHyphenation) renderer.setHyphenation(settings.hyphenation);
    if (renderer.setIgnoreDocMargins) renderer.setIgnoreDocMargins(settings.ignoreDocMargins);
    if (renderer.setFontHinting) renderer.setFontHinting(settings.fontHinting);
    if (renderer.setFontAntialiasing) renderer.setFontAntialiasing(settings.fontAntialiasing);
    try {
        renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
    } catch (e) { /* status bar API may not exist */ }
}

function deriveOutputExt(settings, formatFlag) {
    if (formatFlag === 'xtc' || formatFlag === 'xtch' || formatFlag === 'xtg' || formatFlag === 'xth') {
        return '.' + formatFlag;
    }
    return settings.qualityMode === 'hq' ? '.xtch' : '.xtc';
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveSingleOutputPath(inputPath, outputArg, ext) {
    const base = path.basename(inputPath, path.extname(inputPath));
    if (outputArg) {
        const knownExts = ['.xtc', '.xtch', '.xtg', '.xth'];
        if (knownExts.includes(path.extname(outputArg).toLowerCase())) {
            ensureDir(path.dirname(path.resolve(outputArg)));
            return path.resolve(outputArg);
        }
        ensureDir(path.resolve(outputArg));
        return path.join(path.resolve(outputArg), base + ext);
    }
    return path.join(path.dirname(path.resolve(inputPath)), base + ext);
}

function resolveFolderOutputRoot(inputDir, outputArg) {
    if (outputArg) return path.resolve(outputArg);
    const abs = path.resolve(inputDir);
    return abs.replace(/[\/\\]?$/, '') + '-xtc';
}

async function convertOne({ epubPath, outputPath, baseSettings, fontPath, patternsDir, host: H, renderer, dims, customFontFamily, log, onProgress }) {
    const cfg = H.cfg;
    const Module = H.Module;

    let settings = { ...baseSettings };
    if (customFontFamily) settings.fontFace = customFontFamily;

    if (renderer.resize) renderer.resize(dims.screenWidth, dims.screenHeight);

    const meta = host.loadEpub(Module, renderer, epubPath);

    if (settings.hyphenation === 2) {
        if (patternsDir) {
            const lang = settings.hyphenationLang === 'auto' ? (meta.language || 'en') : settings.hyphenationLang;
            const ok = await host.loadHyphenationPattern(Module, renderer, cfg, lang, patternsDir, log);
            if (!ok) settings.hyphenation = 0;
        } else {
            settings.hyphenation = 0;
        }
    }

    applySettingsToRenderer(renderer, settings);

    const progressFamily = await canvasAdapter.ensureProgressFonts(log);

    const buf = await XtcCore.processEpub({
        renderer,
        toc: renderer.getToc(),
        metadata: meta,
        settings,
        screenWidth: dims.screenWidth,
        screenHeight: dims.screenHeight,
        deviceWidth: dims.deviceWidth,
        deviceHeight: dims.deviceHeight,
        createCanvas: canvasAdapter.createCanvas,
        ditherAsync: null,
        progressBarFontFamily: progressFamily,
        onProgress,
    });

    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, Buffer.from(buf));

    return { meta, pageCount: renderer.getPageCount(), bytes: buf.byteLength };
}

async function setupHostAndRenderer({ baseSettings, fontPath, H, log }) {
    const dims = deviceDims(baseSettings);
    const renderer = new H.Module.EpubRenderer(dims.screenWidth, dims.screenHeight);
    await host.loadDefaultFonts(H.Module, renderer, H.cfg, log);
    let customFontFamily = null;
    if (fontPath) {
        customFontFamily = host.registerCustomFont(H.Module, renderer, fontPath);
        if (log) log(`registered custom font "${customFontFamily}" from ${path.basename(fontPath)}`);
    }
    if (renderer.initHyphenation) renderer.initHyphenation('/hyph');
    return { renderer, dims, customFontFamily };
}

async function runFile({ inputPath, outputArg, baseSettings, fontPath, patternsDir, formatFlag, quiet }) {
    const ext = deriveOutputExt(baseSettings, formatFlag);
    const outputPath = resolveSingleOutputPath(inputPath, outputArg, ext);

    const printer = new ProgressPrinter({ quiet, mode: 'single' });
    const start = Date.now();
    const label = path.basename(inputPath);

    printer.note(`${label}: starting (writing to ${outputPath})`);

    const H = await host.createHost({ log: (m) => printer.note(m) });
    const { renderer, dims, customFontFamily } = await setupHostAndRenderer({
        baseSettings, fontPath, H, log: (m) => printer.note(m),
    });

    try {
        const res = await convertOne({
            epubPath: inputPath,
            outputPath,
            baseSettings,
            fontPath,
            patternsDir,
            host: H,
            renderer,
            dims,
            customFontFamily,
            log: (m) => printer.note(m),
            onProgress: (pct, _max, msg) => {
                printer.inner(`${label}: ${msg || `processing ${pct}%`} ${bar(pct)} ${pct}%`);
            },
        });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        printer.finalizeInner(`${label} -> ${outputPath} (${res.pageCount} pages, ${fmtBytes(res.bytes)}, ${elapsed}s)`);
        return { ok: true, outputPath };
    } catch (err) {
        printer.finalizeInner(`${label}: ERROR ${err.message}`);
        return { ok: false, error: err };
    }
}

async function runFolder({ inputDir, outputArg, baseSettings, fontPath, patternsDir, formatFlag, quiet, concurrency, workerBatch, retries }) {
    const ext = deriveOutputExt(baseSettings, formatFlag);
    const outRoot = resolveFolderOutputRoot(inputDir, outputArg);

    const epubs = walkEpubs(inputDir);
    if (epubs.length === 0) {
        process.stderr.write(`no .epub files found under ${inputDir}\n`);
        return { ok: false, succeeded: 0, failed: 0, total: 0 };
    }

    const printer = new ProgressPrinter({ quiet, mode: 'folder' });
    const N = Math.max(1, Math.min(concurrency || 1, epubs.length));
    const R = Math.max(1, retries || 3);
    printer.note(`found ${epubs.length} .epub file(s); writing to ${outRoot} (concurrency=${N}, worker-batch=${workerBatch || 3}, retries=${R})`);
    return runFolderParallel({ epubs, outRoot, ext, baseSettings, fontPath, patternsDir, printer, concurrency: N, workerBatch, retries: R });
}

async function runFolderParallel({ epubs, outRoot, ext, baseSettings, fontPath, patternsDir, printer, concurrency, workerBatch, retries }) {
    const pool = new WorkerPool({ size: concurrency, baseSettings, fontPath, workerBatch });
    const ui = new MultiProgress({ total: epubs.length, workerCount: concurrency });

    const submissions = epubs.map(async ({ absPath, relPath }) => {
        const relNoExt = relPath.replace(/\.epub$/i, '');
        const outputPath = path.join(outRoot, relNoExt + ext);
        const label = relPath;
        const overallStart = Date.now();

        let lastErr = null;
        let lastWorkerId = -1;
        let lastRes = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            if (attempt > 1) {
                ui.note(`  ↻ retry ${attempt}/${retries}: ${label}  (prev: ${lastErr})`);
            }
            const ctx = { workerId: -1, start: 0 };
            const labelWithAttempt = attempt > 1 ? `${label} (try ${attempt}/${retries})` : label;
            const res = await pool.submit({
                epubPath: absPath,
                outputPath,
                baseSettings,
                patternsDir,
                priority: attempt > 1,
                onProgress: (pct, _msg, workerId) => {
                    if (ctx.workerId === -1) {
                        ctx.workerId = workerId;
                        ctx.start = Date.now();
                    }
                    ui.onProgress(workerId, labelWithAttempt, pct);
                },
            });
            lastWorkerId = ctx.workerId;
            lastRes = res;
            if (res.ok) {
                if (attempt > 1) ui.note(`  ✓ recovered ${label} on attempt ${attempt}/${retries}`);
                break;
            }
            lastErr = res.error;
        }

        const elapsed = ((Date.now() - overallStart) / 1000).toFixed(1);
        if (lastRes && lastRes.ok) {
            ui.onComplete(lastWorkerId, label, true, `${elapsed}s · ${lastRes.pageCount} pages · ${fmtBytes(lastRes.bytes)}`);
        } else {
            ui.onComplete(lastWorkerId, label, false, `${elapsed}s · ${lastErr} (after ${retries} tries)`);
            process.stderr.write(`failed: ${absPath}: ${lastErr} (after ${retries} tries)\n`);
        }
        return lastRes || { ok: false, error: lastErr };
    });

    await Promise.all(submissions);
    await pool.shutdown();
    ui.finish();

    return { ok: ui.failed === 0, succeeded: ui.done, failed: ui.failed, total: epubs.length };
}

module.exports = {
    runFile,
    runFolder,
    DEFAULT_SETTINGS,
    loadSettingsFile,
    mergeSettings,
};
