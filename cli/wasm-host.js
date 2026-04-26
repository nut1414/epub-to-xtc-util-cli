const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const FONT_CACHE_DIR = path.join(__dirname, '.font-cache');
const PATTERN_CACHE_DIR = path.join(__dirname, '.pattern-cache');

const CJK_FONTS = [
    { file: 'NotoSansJP-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf' },
    { file: 'NotoSerifJP-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserifjp/NotoSerifJP%5Bwght%5D.ttf' },
];

function loadConfig() {
    const cfgSource = fs.readFileSync(path.join(REPO_ROOT, 'config.js'), 'utf8');
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(cfgSource, ctx);
    return {
        DEVICE_SPECS: ctx.DEVICE_SPECS,
        FONT_FAMILIES: ctx.FONT_FAMILIES,
        ARABIC_FONTS: ctx.ARABIC_FONTS,
        LANG_TO_PATTERN: ctx.LANG_TO_PATTERN,
    };
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function fetchToCache(url, cacheDir, filename, log) {
    ensureDir(cacheDir);
    const cachePath = path.join(cacheDir, filename);
    if (fs.existsSync(cachePath)) {
        return fs.readFileSync(cachePath);
    }
    if (log) log(`fetching ${filename}...`);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`failed to fetch ${url}: ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(cachePath, buf);
    return buf;
}

function registerFontBytes(Module, renderer, bytes, filename) {
    const ptr = Module.allocateMemory(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    const result = renderer.registerFontFromMemory(ptr, bytes.length, filename);
    Module.freeMemory(ptr);
    return result;
}

async function loadFontFromCacheOrUrl(Module, renderer, variant, log) {
    try {
        const bytes = await fetchToCache(variant.url, FONT_CACHE_DIR, variant.file, log);
        const result = registerFontBytes(Module, renderer, bytes, variant.file);
        return !!result;
    } catch (err) {
        if (log) log(`warn: ${variant.file}: ${err.message}`);
        return false;
    }
}

async function loadFontFamily(Module, renderer, FONT_FAMILIES, familyName, log) {
    const family = FONT_FAMILIES[familyName];
    if (!family) return false;
    const results = await Promise.all(
        family.variants.map((v) => loadFontFromCacheOrUrl(Module, renderer, v, log))
    );
    return results.some(Boolean);
}

async function loadArabicFonts(Module, renderer, ARABIC_FONTS, log) {
    for (const variant of ARABIC_FONTS) {
        await loadFontFromCacheOrUrl(Module, renderer, variant, log);
    }
}

async function loadCjkFonts(Module, renderer, log) {
    for (const variant of CJK_FONTS) {
        await loadFontFromCacheOrUrl(Module, renderer, variant, log);
    }
}

async function loadDefaultFonts(Module, renderer, cfg, log) {
    await loadFontFamily(Module, renderer, cfg.FONT_FAMILIES, 'Literata', log);
    await loadArabicFonts(Module, renderer, cfg.ARABIC_FONTS, log);
    await loadCjkFonts(Module, renderer, log);
    if (renderer.setFallbackFontFaces) {
        renderer.setFallbackFontFaces('Noto Sans JP;Noto Serif JP;Literata;Noto Naskh Arabic');
    }
}

function getPatternForLang(LANG_TO_PATTERN, langTag) {
    if (!langTag) return 'English_US.pattern';
    const lang = langTag.toLowerCase().trim();
    if (LANG_TO_PATTERN[lang]) return LANG_TO_PATTERN[lang];
    const prefix = lang.split('-')[0];
    if (LANG_TO_PATTERN[prefix]) return LANG_TO_PATTERN[prefix];
    return 'English_US.pattern';
}

async function loadHyphenationPattern(Module, renderer, cfg, langTag, patternsDir, log) {
    const patternFile = getPatternForLang(cfg.LANG_TO_PATTERN, langTag);
    const candidate = path.join(patternsDir, patternFile);
    if (!fs.existsSync(candidate)) {
        if (log) log(`hyphenation: pattern file not found: ${candidate}`);
        return false;
    }
    const bytes = fs.readFileSync(candidate);
    const ptr = Module.allocateMemory(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    const result = renderer.loadHyphenationPattern(ptr, bytes.length, patternFile);
    Module.freeMemory(ptr);
    if (result) {
        if (renderer.initHyphenation) renderer.initHyphenation('/hyph');
        if (renderer.activateHyphenationDict) renderer.activateHyphenationDict(patternFile);
        return true;
    }
    return false;
}

function loadEpub(Module, renderer, epubPath) {
    const bytes = fs.readFileSync(epubPath);
    const ptr = Module.allocateMemory(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    const ok = renderer.loadEpubFromMemory(ptr, bytes.length);
    Module.freeMemory(ptr);
    if (!ok) throw new Error(`failed to load EPUB: ${epubPath}`);
    const info = renderer.getDocumentInfo();
    return {
        title: info.title || path.basename(epubPath, path.extname(epubPath)),
        authors: info.authors || 'Unknown',
        language: info.language || '',
    };
}

function registerCustomFont(Module, renderer, fontPath) {
    const bytes = fs.readFileSync(fontPath);
    const familyName = registerFontBytes(Module, renderer, bytes, path.basename(fontPath));
    if (!familyName || familyName.length === 0) {
        throw new Error(`failed to register font: ${fontPath}`);
    }
    return familyName;
}

async function createHost({ deviceWidth, deviceHeight, log } = {}) {
    const cfg = loadConfig();
    const CREngine = require(path.join(REPO_ROOT, 'lib', 'crengine.js'));
    const Module = await CREngine();
    const w = deviceWidth || 480;
    const h = deviceHeight || 800;
    const renderer = new Module.EpubRenderer(w, h);
    if (renderer.initHyphenation) renderer.initHyphenation('/hyph');
    return { Module, renderer, cfg };
}

module.exports = {
    REPO_ROOT,
    FONT_CACHE_DIR,
    PATTERN_CACHE_DIR,
    CJK_FONTS,
    loadConfig,
    createHost,
    loadDefaultFonts,
    loadFontFamily,
    loadArabicFonts,
    loadCjkFonts,
    loadHyphenationPattern,
    getPatternForLang,
    registerCustomFont,
    registerFontBytes,
    loadEpub,
    fetchToCache,
};
