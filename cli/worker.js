const fs = require('fs');
const path = require('path');

const workerData = JSON.parse(process.argv[2] || '{}');
const parentPort = {
    postMessage: (m) => process.send(m),
    on: (ev, cb) => process.on(ev === 'message' ? 'message' : ev, cb),
};

const XtcCore = require('../core/xtc-core.js');
const host = require('./wasm-host');
const canvasAdapter = require('./canvas-adapter');
const runner = require('./runner');

function deviceDims(settings) {
    const cfg = settings.deviceType === 'x3'
        ? { width: 528, height: 792 }
        : { width: 480, height: 800 };
    const isLandscape = settings.rotation === 90 || settings.rotation === 270;
    return {
        deviceWidth: cfg.width,
        deviceHeight: cfg.height,
        screenWidth: isLandscape ? cfg.height : cfg.width,
        screenHeight: isLandscape ? cfg.width : cfg.height,
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

let H = null;
let renderer = null;
let dims = null;
let customFontFamily = null;
let progressFamily = 'sans-serif';

async function init() {
    const { baseSettings, fontPath } = workerData;
    H = await host.createHost();
    dims = deviceDims(baseSettings);
    renderer = new H.Module.EpubRenderer(dims.screenWidth, dims.screenHeight);
    await host.loadDefaultFonts(H.Module, renderer, H.cfg);
    if (fontPath) {
        customFontFamily = host.registerCustomFont(H.Module, renderer, fontPath);
    }
    if (renderer.initHyphenation) renderer.initHyphenation('/hyph');
    progressFamily = await canvasAdapter.ensureProgressFonts();
    parentPort.postMessage({ type: 'ready' });
}

async function processOne(task) {
    const { jobId, epubPath, outputPath, baseSettings, patternsDir } = task;
    let settings = { ...baseSettings };
    if (customFontFamily) settings.fontFace = customFontFamily;

    if (renderer.resize) renderer.resize(dims.screenWidth, dims.screenHeight);

    const meta = host.loadEpub(H.Module, renderer, epubPath);

    if (settings.hyphenation === 2) {
        if (patternsDir) {
            const lang = settings.hyphenationLang === 'auto' ? (meta.language || 'en') : settings.hyphenationLang;
            const ok = await host.loadHyphenationPattern(H.Module, renderer, H.cfg, lang, patternsDir);
            if (!ok) settings.hyphenation = 0;
        } else {
            settings.hyphenation = 0;
        }
    }

    applySettingsToRenderer(renderer, settings);

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
        onProgress: (pct, _max, msg) => {
            parentPort.postMessage({ type: 'progress', jobId, pct, msg });
        },
    });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(buf));

    return { pageCount: renderer.getPageCount(), bytes: buf.byteLength };
}

parentPort.on('message', async (msg) => {
    if (msg.type === 'process') {
        try {
            const res = await processOne(msg);
            parentPort.postMessage({ type: 'done', jobId: msg.jobId, ...res });
        } catch (err) {
            parentPort.postMessage({ type: 'error', jobId: msg.jobId, message: err.message });
        }
    } else if (msg.type === 'shutdown') {
        process.exit(0);
    }
});

init().catch((err) => {
    parentPort.postMessage({ type: 'fatal', message: err.message, stack: err.stack });
    process.exit(1);
});
