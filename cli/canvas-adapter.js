const fs = require('fs');
const path = require('path');
const { createCanvas: nodeCreateCanvas, registerFont } = require('canvas');
const { fetchToCache, FONT_CACHE_DIR } = require('./wasm-host');

const NOTO_SANS_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf';
const NOTO_SANS_JP_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf';

let registered = false;
let probedFamily = null;

async function tryRegister(url, filename, family, log) {
    try {
        const filePath = path.join(FONT_CACHE_DIR, filename);
        if (!fs.existsSync(filePath)) {
            await fetchToCache(url, FONT_CACHE_DIR, filename, log);
        }
        registerFont(filePath, { family });
        return true;
    } catch (err) {
        if (log) log(`warn: ${family} unavailable: ${err.message}`);
        return false;
    }
}

async function ensureProgressFonts(log) {
    if (registered) return probedFamily;
    const okSans = await tryRegister(NOTO_SANS_URL, 'NotoSans-Regular.ttf', 'XtcNotoSans', log);
    const okJp = await tryRegister(NOTO_SANS_JP_URL, 'NotoSansJP-Regular.ttf', 'XtcNotoSansJP', log);
    const families = [];
    if (okJp) families.push('XtcNotoSansJP');
    if (okSans) families.push('XtcNotoSans');
    families.push('sans-serif');
    probedFamily = families.join(', ');
    registered = true;
    return probedFamily;
}

function createCanvas(w, h) {
    return nodeCreateCanvas(w, h);
}

module.exports = {
    createCanvas,
    ensureProgressFonts,
};
