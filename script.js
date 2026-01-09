let DEVICE_WIDTH = 480;
let DEVICE_HEIGHT = 800;
let SCREEN_WIDTH = 480;
let SCREEN_HEIGHT = 800;

let Module = null;
let renderer = null;
let wasmReady = false;
let metadata = {};
let isProcessing = false;
let currentToc = [];

// Multi-file state
let loadedFiles = [];
let currentFileIndex = 0;

// Web Worker for dithering
let ditherWorker = null;
let ditherCallbacks = new Map();
let ditherJobId = 0;

// Initialize dither worker
try {
    ditherWorker = new Worker('dither-worker.js');
    ditherWorker.onmessage = function(e) {
const { imageData, id } = e.data;
const callback = ditherCallbacks.get(id);
if (callback) {
    callback(new Uint8ClampedArray(imageData));
    ditherCallbacks.delete(id);
}
    };
    console.log('Dither worker initialized');
} catch (err) {
    console.warn('Web Worker not available, falling back to main thread dithering');
}

// DOM elements
let dropZone, fileInput, bookInfo, bookTitle, bookAuthor, bookPages;
let fontSize, fontSizeInput, fontWeight, fontWeightInput, lineHeight, lineHeightInput, margin, marginInput;
let orientation, fontFace, qualityMode, enableDithering, ditherStrength, ditherStrengthInput, deviceType, wordSpacing, hyphenation, hyphenationLang, ignoreDocMargins, fontHinting, fontAntialiasing;
let enableNegative, enableProgressBar, progressPosition, showProgressLine, showChapterMarks, showChapterProgress, progressFullWidth;
let showPageInfo, showBookPercent, showChapterPage, showChapterPercent, progressFontSize, progressFontSizeInput;
let progressEdgeMargin, progressEdgeMarginInput, progressSideMargin, progressSideMarginInput;
let customFontUpload, uploadFontBtn, customFontName;
let chapterList, previewCanvas, previewFrame, emptyState, deviceColorToggle;
let prevBtn, nextBtn, refreshBtn, currentPageEl, totalPagesEl;
let exportBtn, exportXtgBtn, exportAllBtn, progressContainer, progressFill, progressText;
let loadingOverlay, loadingText;
let fileListContainer, fileListItems, fileCount, clearFilesBtn;

// State for loaded fonts and patterns
const loadedFontFamilies = new Set();
const loadedPatterns = new Set();

// Fetch font data from URL
async function fetchFontData(url) {
    try {
const response = await fetch(url);
if (!response.ok) {
    console.warn(`Font not found: ${url}`);
    return null;
}
return new Uint8Array(await response.arrayBuffer());
    } catch (e) {
console.warn(`Failed to fetch font from ${url}:`, e);
return null;
    }
}

// Load a single font file from URL
async function loadFontFromUrl(url, filename) {
    try {
const response = await fetch(url);
if (!response.ok) {
    console.warn(`Font not found: ${url}`);
    return false;
}
const data = new Uint8Array(await response.arrayBuffer());
const ptr = Module.allocateMemory(data.length);
Module.HEAPU8.set(data, ptr);
const result = renderer.registerFontFromMemory(ptr, data.length, filename);
Module.freeMemory(ptr);
if (result) {
    console.log(`Loaded font: ${filename} from CDN`);
    return true;
}
return false;
    } catch (e) {
console.warn(`Failed to load font ${filename}:`, e);
return false;
    }
}

// Load all variants of a font family
async function loadFontFamily(familyName) {
    if (loadedFontFamilies.has(familyName)) {
console.log(`Font family already loaded: ${familyName}`);
return true;
    }

    const family = FONT_FAMILIES[familyName];
    if (!family) {
console.warn(`Unknown font family: ${familyName}`);
return false;
    }

    console.log(`Loading font family: ${familyName}...`);
    const promises = family.variants.map(v => loadFontFromUrl(v.url, v.file));
    const results = await Promise.all(promises);
    const loaded = results.filter(r => r).length;

    if (loaded > 0) {
loadedFontFamilies.add(familyName);
console.log(`Loaded ${loaded}/${family.variants.length} variants of ${familyName}`);
return true;
    }
    return false;
}

// Load default font (Literata) and Arabic fallback
async function loadRequiredFonts() {
    console.log('Loading required fonts from CDN...');

    // Load Literata as default
    await loadFontFamily('Literata');

    // Load Arabic fallback fonts
    for (const font of ARABIC_FONTS) {
await loadFontFromUrl(font.url, font.file);
    }
    console.log('Loaded Arabic fonts (Regular, Medium, SemiBold, Bold)');

    // Set fallback fonts for Arabic support
    if (renderer.setFallbackFontFaces) {
renderer.setFallbackFontFaces('Literata;Noto Naskh Arabic');
    }

    return loadedFontFamilies.size > 0;
}

// Get pattern filename for a language tag
function getPatternForLang(langTag) {
    if (!langTag) return 'English_US.pattern';
    const lang = langTag.toLowerCase().trim();
    if (LANG_TO_PATTERN[lang]) return LANG_TO_PATTERN[lang];
    const prefix = lang.split('-')[0];
    if (LANG_TO_PATTERN[prefix]) return LANG_TO_PATTERN[prefix];
    return 'English_US.pattern';
}

// Load hyphenation pattern for a language
async function loadHyphenationPattern(langTag) {
    const patternFile = getPatternForLang(langTag);

    if (loadedPatterns.has(patternFile)) {
console.log(`Hyphenation pattern already loaded: ${patternFile}`);
return true;
    }

    try {
console.log(`Loading hyphenation pattern: ${patternFile} for language: ${langTag}`);
const response = await fetch(`patterns/${patternFile}`);
if (!response.ok) {
    console.warn(`Pattern not found: ${patternFile}`);
    return false;
}
const data = new Uint8Array(await response.arrayBuffer());
const ptr = Module.allocateMemory(data.length);
Module.HEAPU8.set(data, ptr);
const result = renderer.loadHyphenationPattern(ptr, data.length, patternFile);
Module.freeMemory(ptr);

if (result) {
    loadedPatterns.add(patternFile);
    renderer.initHyphenation('/hyph');
    renderer.activateHyphenationDict(patternFile);
    console.log(`Loaded and activated hyphenation: ${patternFile}`);
    return true;
}
return false;
    } catch (e) {
console.warn(`Failed to load hyphenation pattern ${patternFile}:`, e);
return false;
    }
}

// Initialize WASM module
if (typeof CREngine === 'undefined') {
    console.error('CREngine is not defined. Make sure lib/crengine.js is loaded.');
    alert('Failed to load CREngine. Please make sure lib/crengine.js is accessible.');
}

CREngine().then(async module => {
    Module = module;
    console.log('CREngine WASM loaded!');

    renderer = new Module.EpubRenderer(SCREEN_WIDTH, SCREEN_HEIGHT);

    await loadRequiredFonts();

    if (renderer.initHyphenation) {
renderer.initHyphenation('/hyph');
    }

    wasmReady = true;
    
    // Only load fonts if DOM is ready
    if (fontFace) {
loadAvailableFonts();
    }
    
    // Check for auto-load demo parameter
    checkAutoLoadDemo();
}).catch(err => {
    console.error('Failed to load CREngine WASM:', err);
    alert('Failed to load WASM module. Please refresh the page.');
});

// Set random background gradient on page load
const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)', // Purple/Magenta
    'linear-gradient(135deg, #5896ec 0%, #5b73c8 50%, #7ac4e9 100%)', // Purple/Blue blend
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 50%, #43e97b 100%)', // Blue/Cyan/Green
    'linear-gradient(135deg, #74ab88 0%, #78ec8f 50%, #3ab99b 100%)', // Green/Teal blend
    'linear-gradient(135deg, #fa709a 0%, #fee140 50%, #30cfd0 100%)', // Pink/Yellow/Cyan
    'linear-gradient(135deg, #d18ab2 0%, #fee19b 50%, #7dd5da 100%)', // Soft warm blend
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 50%, #fbc2eb 100%)', // Soft Pastels
    'linear-gradient(135deg, #8898eb 0%, #b89bc2 50%, #f8b0ed 100%)', // Lavender/Pink blend
    'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)', // Magenta/Coral/Blue
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 50%, #667eea 100%)', // Green/Turquoise/Purple
    'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 50%, #2bff88 100%)', // Neon Pink/Cyan/Green
    'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 50%, #c2e9fb 100%)', // Pastel Pink/Lavender/Blue
    'linear-gradient(135deg, #fddb92 0%, #d1fdff 50%, #a8edea 100%)', // Yellow/Mint/Aqua
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fbc2eb 100%)', // Coral/Pink/Lavender
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #ff8177 100%)', // Peach/Coral/Orange
    'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 50%, #e0c3fc 100%)', // Sky Blue/Aqua/Lavender
    'linear-gradient(135deg, #d299c2 0%, #fef9d7 50%, #a1c4fd 100%)', // Mauve/Cream/Sky
    'linear-gradient(135deg, #89f7fe 0%, #66a6ff 50%, #667eea 100%)', // Cyan/Blue/Purple
    'linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 50%, #fab1a0 100%)', // Soft Yellow/Orange/Peach
    'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 50%, #fbc2eb 100%)', // Neon Pink/Cyan/Pastel
];

// Select random gradient
const randomGradient = gradients[Math.floor(Math.random() * gradients.length)];
document.body.style.background = randomGradient;
document.body.style.backgroundAttachment = 'fixed';

// Initialize DOM elements after page loads
document.addEventListener('DOMContentLoaded', function() {
    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    bookInfo = document.getElementById('bookInfo');
    bookTitle = document.getElementById('bookTitle');
    bookAuthor = document.getElementById('bookAuthor');
    bookPages = document.getElementById('bookPages');
    fontSize = document.getElementById('fontSize');
    fontSizeInput = document.getElementById('fontSizeInput');
    fontWeight = document.getElementById('fontWeight');
    fontWeightInput = document.getElementById('fontWeightInput');
    lineHeight = document.getElementById('lineHeight');
    lineHeightInput = document.getElementById('lineHeightInput');
    margin = document.getElementById('margin');
    marginInput = document.getElementById('marginInput');
    orientation = document.getElementById('orientation');
    deviceType = document.getElementById('deviceType');
    fontFace = document.getElementById('fontFace');
    textAlign = document.getElementById('textAlign');
    wordSpacing = document.getElementById('wordSpacing');
    hyphenation = document.getElementById('hyphenation');
    hyphenationLang = document.getElementById('hyphenationLang');
    ignoreDocMargins = document.getElementById('ignoreDocMargins');
    fontHinting = document.getElementById('fontHinting');
    fontAntialiasing = document.getElementById('fontAntialiasing');
    qualityMode = document.getElementById('qualityMode');
    enableDithering = document.getElementById('enableDithering');
    ditherStrength = document.getElementById('ditherStrength');
    ditherStrengthInput = document.getElementById('ditherStrengthInput');
    enableNegative = document.getElementById('enableNegative');
    enableProgressBar = document.getElementById('enableProgressBar');
    progressPosition = document.getElementById('progressPosition');
    showProgressLine = document.getElementById('showProgressLine');
    showChapterMarks = document.getElementById('showChapterMarks');
    showChapterProgress = document.getElementById('showChapterProgress');
    progressFullWidth = document.getElementById('progressFullWidth');
    showPageInfo = document.getElementById('showPageInfo');
    showBookPercent = document.getElementById('showBookPercent');
    showChapterPage = document.getElementById('showChapterPage');
    showChapterPercent = document.getElementById('showChapterPercent');
    progressFontSize = document.getElementById('progressFontSize');
    progressFontSizeInput = document.getElementById('progressFontSizeInput');
    progressEdgeMargin = document.getElementById('progressEdgeMargin');
    progressEdgeMarginInput = document.getElementById('progressEdgeMarginInput');
    progressSideMargin = document.getElementById('progressSideMargin');
    progressSideMarginInput = document.getElementById('progressSideMarginInput');
    customFontUpload = document.getElementById('customFontUpload');
    uploadFontBtn = document.getElementById('uploadFontBtn');
    customFontName = document.getElementById('customFontName');
    chapterList = document.getElementById('chapterList');
    previewCanvas = document.getElementById('previewCanvas');
    previewFrame = document.getElementById('previewFrame');
    emptyState = document.getElementById('emptyState');
    deviceColorToggle = document.getElementById('deviceColorToggle');
    prevBtn = document.getElementById('prevBtn');
    nextBtn = document.getElementById('nextBtn');
    refreshBtn = document.getElementById('refreshBtn');
    currentPageEl = document.getElementById('currentPage');
    totalPagesEl = document.getElementById('totalPages');
    exportBtn = document.getElementById('exportBtn');
    exportXtgBtn = document.getElementById('exportXtgBtn');
    exportAllBtn = document.getElementById('exportAllBtn');
    progressContainer = document.getElementById('progressContainer');
    progressFill = document.getElementById('progressFill');
    progressText = document.getElementById('progressText');
    loadingOverlay = document.getElementById('loadingOverlay');
    loadingText = document.getElementById('loadingText');
    fileListContainer = document.getElementById('fileListContainer');
    fileListItems = document.getElementById('fileListItems');
    fileCount = document.getElementById('fileCount');
    clearFilesBtn = document.getElementById('clearFilesBtn');

    initEventListeners();
    
    // Load available fonts if WASM is already ready
    if (wasmReady) {
loadAvailableFonts();
    }
    
    console.log('DOM loaded and event listeners initialized');
});

function loadAvailableFonts() {
    if (!fontFace) return;
    try {
fontFace.innerHTML = '<option value="">Default (from EPUB)</option>';
Object.keys(FONT_FAMILIES).forEach(familyName => {
    const option = document.createElement('option');
    option.value = familyName;
    option.textContent = familyName;
    fontFace.appendChild(option);
});
    } catch (e) {
console.error('Error loading fonts:', e);
    }
}

async function handleFontFamilyChange() {
    const familyName = fontFace.value;
    if (!familyName) {
applySettings();
return;
    }

    if (!loadedFontFamilies.has(familyName)) {
const originalText = fontFace.options[fontFace.selectedIndex].textContent;
fontFace.options[fontFace.selectedIndex].textContent = familyName + ' (loading...)';
fontFace.disabled = true;

await loadFontFamily(familyName);

fontFace.options[fontFace.selectedIndex].textContent = familyName;
fontFace.disabled = false;
    }

    applySettings();
}

async function handleCustomFontUpload(event) {
    const file = event.target.files[0];
    if (!file || !renderer) return;

    try {
customFontName.textContent = 'Loading font...';
customFontName.style.color = '#ffc107';

const arrayBuffer = await file.arrayBuffer();
const data = new Uint8Array(arrayBuffer);

const ptr = Module.allocateMemory(data.length);
Module.HEAPU8.set(data, ptr);

const fontName = renderer.registerFontFromMemory(ptr, data.length, file.name);
Module.freeMemory(ptr);

if (fontName && fontName.length > 0) {
    customFontName.textContent = `Loaded: ${fontName}`;
    customFontName.style.color = '#198754';

    let exists = false;
    for (let i = 0; i < fontFace.options.length; i++) {
        if (fontFace.options[i].value === fontName) {
            exists = true;
            break;
        }
    }
    if (!exists) {
        const option = document.createElement('option');
        option.value = fontName;
        option.textContent = fontName + ' (custom)';
        fontFace.appendChild(option);
    }

    fontFace.value = fontName;
    applySettings();
} else {
    customFontName.textContent = 'Failed to load font';
    customFontName.style.color = '#dc3545';
}
    } catch (e) {
console.error('Error loading custom font:', e);
customFontName.textContent = 'Error: ' + e.message;
customFontName.style.color = '#dc3545';
    }

    event.target.value = '';
}

function syncSliderInput(slider, input, onChange) {
    let inputDebounceTimer = null;

    slider.addEventListener('input', () => {
input.value = slider.value;
    });
    slider.addEventListener('change', () => {
if (onChange) onChange();
    });
    input.addEventListener('input', () => {
let val = parseInt(input.value);
if (!isNaN(val)) {
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    if (val >= min && val <= max) {
        slider.value = val;
    }
}
    });
    input.addEventListener('change', () => {
let val = parseInt(input.value);
const min = parseInt(slider.min);
const max = parseInt(slider.max);
if (!isNaN(val)) {
    val = Math.max(min, Math.min(max, val));
    slider.value = val;
    input.value = val;
} else {
    input.value = slider.value;
}
clearTimeout(inputDebounceTimer);
inputDebounceTimer = setTimeout(() => {
    if (onChange) onChange();
}, 300);
    });
}

function updateDeviceType() {
    const device = deviceType.value;
    if (device === 'x4') {
DEVICE_WIDTH = 480;
DEVICE_HEIGHT = 800;
    } else if (device === 'x3') {
DEVICE_WIDTH = 528;
DEVICE_HEIGHT = 792;
    }
    updateOrientation();
}

function updateOrientation() {
    const rotation = parseInt(orientation.value);
    const isLandscape = (rotation === 90 || rotation === 270);
    SCREEN_WIDTH = isLandscape ? DEVICE_HEIGHT : DEVICE_WIDTH;
    SCREEN_HEIGHT = isLandscape ? DEVICE_WIDTH : DEVICE_HEIGHT;

    previewCanvas.width = SCREEN_WIDTH;
    previewCanvas.height = SCREEN_HEIGHT;

    // Update device frame orientation class
    if (previewFrame) {
previewFrame.className = previewFrame.className.replace(/orientation-\d+/g, '');
previewFrame.classList.add(`orientation-${rotation}`);
    }

    if (renderer) {
renderer.resize(SCREEN_WIDTH, SCREEN_HEIGHT);
applySettings();
    }
}

function initOrientationButtons() {
    const buttons = document.querySelectorAll('.orientation-btn');
    buttons.forEach(btn => {
btn.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    orientation.value = btn.dataset.orientation;
    updateOrientation();
});
    });
}

function initEventListeners() {
    syncSliderInput(fontSize, fontSizeInput, applySettings);
    syncSliderInput(fontWeight, fontWeightInput, applySettings);
    syncSliderInput(lineHeight, lineHeightInput, applySettings);
    syncSliderInput(margin, marginInput, applySettings);
    syncSliderInput(ditherStrength, ditherStrengthInput, renderPreview);

    initOrientationButtons();
    deviceType.addEventListener('change', updateDeviceType);
    fontFace.addEventListener('change', handleFontFamilyChange);
    textAlign.addEventListener('change', applySettings);
    wordSpacing.addEventListener('change', applySettings);
    hyphenation.addEventListener('change', async function() {
if (hyphenation.value === '2') {
    const lang = hyphenationLang.value === 'auto'
        ? (metadata && metadata.language ? metadata.language : 'en')
        : hyphenationLang.value;
    await loadHyphenationPattern(lang);
}
applySettings();
    });
    hyphenationLang.addEventListener('change', async function() {
if (hyphenation.value === '2') {
    const lang = hyphenationLang.value === 'auto'
        ? (metadata && metadata.language ? metadata.language : 'en')
        : hyphenationLang.value;
    await loadHyphenationPattern(lang);
    applySettings();
}
    });
    ignoreDocMargins.addEventListener('change', applySettings);
    qualityMode.addEventListener('change', function() {
const mode = qualityMode.value;
if (mode === 'fast') {
    fontAntialiasing.value = '0';
    fontHinting.value = '1';
} else {
    fontAntialiasing.value = '2';
    fontHinting.value = '2';
}
applySettings();
    });
    enableDithering.addEventListener('change', renderPreview);
    enableNegative.addEventListener('change', renderPreview);
    enableProgressBar.addEventListener('change', applySettings);
    progressPosition.addEventListener('change', applySettings);
    showProgressLine.addEventListener('change', applySettings);
    showChapterMarks.addEventListener('change', applySettings);
    showChapterProgress.addEventListener('change', applySettings);
    progressFullWidth.addEventListener('change', applySettings);
    showPageInfo.addEventListener('change', renderPreview);
    showBookPercent.addEventListener('change', renderPreview);
    showChapterPage.addEventListener('change', renderPreview);
    showChapterPercent.addEventListener('change', renderPreview);
    syncSliderInput(progressFontSize, progressFontSizeInput, renderPreview);
    syncSliderInput(progressEdgeMargin, progressEdgeMarginInput, applySettings);
    syncSliderInput(progressSideMargin, progressSideMarginInput, renderPreview);

    uploadFontBtn.addEventListener('click', () => customFontUpload.click());
    customFontUpload.addEventListener('change', handleCustomFontUpload);

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
e.preventDefault();
dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
e.preventDefault();
dropZone.classList.remove('drag-over');
addFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
addFiles(e.target.files);
e.target.value = '';
    });

    clearFilesBtn.addEventListener('click', clearAllFiles);

    prevBtn.addEventListener('click', () => {
if (!renderer) return;
renderer.prevPage();
renderPreview();
    });

    nextBtn.addEventListener('click', () => {
if (!renderer) return;
renderer.nextPage();
renderPreview();
    });

    refreshBtn.addEventListener('click', () => renderPreview());

    document.addEventListener('keydown', (e) => {
if (e.key === 'ArrowLeft' && !prevBtn.disabled) prevBtn.click();
else if (e.key === 'ArrowRight' && !nextBtn.disabled) nextBtn.click();
    });

    exportXtgBtn.addEventListener('click', () => {
if (!renderer) return;
const settings = getSettings();
const isHQ = settings.qualityMode === 'hq';
const pageData = isHQ ? generateXthData(previewCanvas) : generateXtgData(previewCanvas, 1);
const ext = isHQ ? 'xth' : 'xtg';
downloadFile(pageData, `page_${renderer.getCurrentPage() + 1}.${ext}`);
    });

    exportBtn.addEventListener('click', async () => {
if (!renderer || isProcessing) return;

isProcessing = true;
exportBtn.disabled = true;
progressContainer.style.display = 'block';

const startTime = performance.now();

try {
    const xtcData = await generateXtcData((current, total, message) => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        progressFill.style.width = current + '%';
        progressText.textContent = `${message || `Processing ${current}%...`} (${elapsed}s)`;
    });

    const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
    progressText.textContent = 'Downloading...';

    const settings = getSettings();
    const ext = settings.qualityMode === 'hq' ? '.xtch' : '.xtc';
    const filename = (metadata.title || 'book')
        .replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, '_')
        .substring(0, 50) + ext;

    downloadFile(xtcData, filename);
    const pageCount = renderer.getPageCount();
    const avgTimePerPage = (parseFloat(totalTime) / pageCount * 1000).toFixed(0);
    progressText.textContent = `Done! ${totalTime}s total (${avgTimePerPage}ms/page, ${pageCount} pages)`;

} catch (error) {
    console.error('Export error:', error);
    alert('Export error: ' + error.message);
} finally {
    isProcessing = false;
    exportBtn.disabled = false;
    setTimeout(() => {
        progressContainer.style.display = 'none';
    }, 2000);
}
    });

    exportAllBtn.addEventListener('click', async () => {
if (loadedFiles.length === 0 || isProcessing) return;

isProcessing = true;
exportBtn.disabled = true;
exportAllBtn.disabled = true;
exportXtgBtn.disabled = true;
progressContainer.style.display = 'block';

const totalFiles = loadedFiles.length;
const startTime = performance.now();

try {
    for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
        const fileInfo = loadedFiles[fileIdx];

        progressText.textContent = `Loading file ${fileIdx + 1}/${totalFiles}: ${fileInfo.name}...`;
        progressFill.style.width = `${(fileIdx / totalFiles) * 100}%`;

        await loadEpub(fileInfo.file);
        currentFileIndex = fileIdx;
        updateFileListUI();

        const fileStartTime = performance.now();
        const xtcData = await generateXtcData((current, total, message) => {
            const fileProgress = (fileIdx + current / 100) / totalFiles * 100;
            progressFill.style.width = `${fileProgress}%`;
            progressText.textContent = `File ${fileIdx + 1}/${totalFiles}: ${message || `Processing ${current}%`}`;
        });

        const settings = getSettings();
        const ext = settings.qualityMode === 'hq' ? '.xtch' : '.xtc';
        const filename = (metadata.title || fileInfo.name.replace('.epub', ''))
            .replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, '_')
            .substring(0, 50) + ext;

        downloadFile(xtcData, filename);

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
    progressFill.style.width = '100%';
    progressText.textContent = `All ${totalFiles} files exported! Total time: ${totalTime}s`;

} catch (error) {
    console.error('Export All error:', error);
    alert('Export error: ' + error.message);
} finally {
    isProcessing = false;
    exportBtn.disabled = false;
    exportAllBtn.disabled = false;
    exportXtgBtn.disabled = false;
    setTimeout(() => {
        progressContainer.style.display = 'none';
    }, 3000);
}
    });
    
    // Set default font to Literata (with Firefox compatibility)
    setTimeout(() => {
fontFace.value = 'Literata';
// Trigger change event to ensure it's applied
const event = new Event('change', { bubbles: true });
fontFace.dispatchEvent(event);
    }, 100);
    
    // Device color toggle
    deviceColorToggle.addEventListener('click', () => {
previewFrame.classList.toggle('light-mode');
    });
}

function getSettings() {
    const mode = qualityMode.value;
    return {
fontSize: parseInt(fontSize.value),
fontWeight: parseInt(fontWeight.value),
lineHeight: parseInt(lineHeight.value),
margin: parseInt(margin.value),
fontFace: fontFace.value,
qualityMode: mode,
bitDepth: mode === 'hq' ? 2 : 1,
enableDithering: enableDithering.checked,
ditherStrength: parseInt(ditherStrength.value),
enableNegative: enableNegative.checked,
enableProgressBar: enableProgressBar.checked,
progressPosition: progressPosition.value,
showProgressLine: showProgressLine.checked,
showChapterMarks: showChapterMarks.checked,
showChapterProgress: showChapterProgress.checked,
progressFullWidth: progressFullWidth.checked,
showPageInfo: showPageInfo.checked,
showBookPercent: showBookPercent.checked,
showChapterPage: showChapterPage.checked,
showChapterPercent: showChapterPercent.checked,
progressFontSize: parseInt(progressFontSize.value),
progressEdgeMargin: parseInt(progressEdgeMargin.value),
progressSideMargin: parseInt(progressSideMargin.value),
textAlign: parseInt(textAlign.value),
wordSpacing: parseInt(wordSpacing.value),
hyphenation: parseInt(hyphenation.value),
ignoreDocMargins: ignoreDocMargins.checked,
fontHinting: parseInt(fontHinting.value),
fontAntialiasing: parseInt(fontAntialiasing.value),
rotation: parseInt(orientation.value),
    };
}

// Helper function to get the chapter info for a given page
function getChapterInfoForPage(pageNum) {
    if (!currentToc || currentToc.length === 0) return null;

    let topLevelChapter = null;
    let topLevelIndex = 0;
    let topLevelPage = -1;
    const topLevelTotal = currentToc.length;

    for (let i = 0; i < currentToc.length; i++) {
const item = currentToc[i];
if (item.page <= pageNum && item.page > topLevelPage) {
    topLevelChapter = item;
    topLevelIndex = i + 1;
    topLevelPage = item.page;
}
    }

    if (!topLevelChapter) return null;

    let currentChapter = {
title: topLevelChapter.title,
startPage: topLevelChapter.page,
index: topLevelIndex,
totalCount: topLevelTotal,
level: 0
    };

    let deepestPage = currentChapter.startPage;

    function findDeepestChapter(items, depth = 0) {
for (const item of items) {
    if (item.page <= pageNum && item.page > deepestPage) {
        deepestPage = item.page;
        currentChapter.startPage = item.page;
        currentChapter.title = item.title;
        currentChapter.level = depth;
    }
    if (item.children && item.children.length > 0) {
        findDeepestChapter(item.children, depth + 1);
    }
}
    }

    findDeepestChapter(currentToc);

    let foundNext = false;
    function findNextChapter(items) {
for (const item of items) {
    if (foundNext) return;
    if (item.page > currentChapter.startPage) {
        currentChapter.endPage = item.page - 1;
        foundNext = true;
        return;
    }
    if (item.children) findNextChapter(item.children);
}
    }
    findNextChapter(currentToc);
    if (!foundNext) {
currentChapter.endPage = renderer.getPageCount() - 1;
    }

    return currentChapter;
}

function getChapterPositions() {
    const positions = [];
    const totalPages = renderer ? renderer.getPageCount() : 1;

    function extractPositions(items) {
for (const item of items) {
    positions.push(item.page / totalPages);
    if (item.children && item.children.length > 0) {
        extractPositions(item.children);
    }
}
    }

    if (currentToc && currentToc.length > 0) {
extractPositions(currentToc);
    }

    return positions;
}

const PROGRESS_BAR_HEIGHT = 14;
const PROGRESS_BAR_HEIGHT_FULLWIDTH = 20;
const PROGRESS_BAR_HEIGHT_EXTENDED = 28;

function drawProgressIndicator(ctx, settings, currentPage, totalPages) {
    if (!settings.enableProgressBar) return;

    const lineThickness = 1;
    const progressThickness = 4;
    const chapterMarkHeight = 11;
    const edgeMargin = settings.progressEdgeMargin || 0;
    const sideMargin = settings.progressSideMargin || 0;
    const padding = 8 + sideMargin;
    const isTop = settings.progressPosition === 'top';
    const isFullWidth = settings.progressFullWidth;
    const hasProgressLine = settings.showProgressLine || settings.showChapterProgress;
    const hasBothLines = settings.showProgressLine && settings.showChapterProgress;

    let barHeight = PROGRESS_BAR_HEIGHT;
    if (settings.showChapterMarks || (isFullWidth && hasBothLines)) {
barHeight = PROGRESS_BAR_HEIGHT_EXTENDED;
    } else if (isFullWidth && hasProgressLine) {
barHeight = PROGRESS_BAR_HEIGHT_FULLWIDTH;
    }

    const baseY = isTop ? edgeMargin : SCREEN_HEIGHT - barHeight - edgeMargin;
    const centerY = baseY + barHeight / 2;

    const isNegative = settings.enableNegative;
    const bgColor = isNegative ? '#000000' : '#ffffff';
    const textColor = isNegative ? '#ffffff' : '#000000';
    const baseLineColor = isNegative ? '#ffffff' : '#000000';
    const progressColor = isNegative ? '#ffffff' : '#000000';
    const chapterMarkColor = isNegative ? '#ffffff' : '#000000';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, baseY, SCREEN_WIDTH, barHeight);

    const fontSize = settings.progressFontSize || 10;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    let leftText = '';
    if (settings.showChapterPage || settings.showChapterPercent) {
const chapterInfo = getChapterInfoForPage(currentPage);
if (chapterInfo) {
    const chapterPages = chapterInfo.endPage - chapterInfo.startPage + 1;
    const pageInChapter = currentPage - chapterInfo.startPage + 1;
    const leftParts = [];

    if (settings.showChapterPage) {
        leftParts.push(`${pageInChapter}/${chapterPages}`);
    }
    if (settings.showChapterPercent) {
        const chapterPercent = Math.round((pageInChapter / chapterPages) * 100);
        leftParts.push(`${chapterPercent}%`);
    }
    leftText = leftParts.join('  ');
}
    }

    let rightText = '';
    const rightParts = [];
    if (settings.showPageInfo) {
rightParts.push(`${currentPage + 1}/${totalPages}`);
    }
    if (settings.showBookPercent) {
const bookPercent = Math.round(((currentPage + 1) / totalPages) * 100);
rightParts.push(`${bookPercent}%`);
    }
    rightText = rightParts.join('  ');

    const leftTextWidth = leftText ? ctx.measureText(leftText).width : 0;
    const rightTextWidth = rightText ? ctx.measureText(rightText).width : 0;

    let barStartX, barEndX, barWidth, lineY;

    if (isFullWidth && hasProgressLine) {
lineY = baseY + 4;
const textY = baseY + barHeight - fontSize / 2 - 1;
barStartX = padding;
barEndX = SCREEN_WIDTH - padding;
barWidth = barEndX - barStartX;

if (leftText) {
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.fillText(leftText, padding, textY);
}

if (rightText) {
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.fillText(rightText, SCREEN_WIDTH - padding, textY);
}
    } else {
lineY = centerY;
barStartX = padding + (leftText ? leftTextWidth + 12 : 0);
barEndX = SCREEN_WIDTH - padding - (rightText ? rightTextWidth + 12 : 0);
barWidth = barEndX - barStartX;

if (leftText) {
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.fillText(leftText, padding, centerY);
}

if (rightText) {
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.fillText(rightText, SCREEN_WIDTH - padding, centerY);
}
    }

    if (settings.showProgressLine && barWidth > 0) {
ctx.strokeStyle = baseLineColor;
ctx.lineWidth = lineThickness;
ctx.beginPath();
ctx.moveTo(barStartX, lineY);
ctx.lineTo(barEndX, lineY);
ctx.stroke();

const progress = (currentPage + 1) / totalPages;
const progressX = barStartX + barWidth * progress;
ctx.strokeStyle = progressColor;
ctx.lineWidth = progressThickness;
ctx.beginPath();
ctx.moveTo(barStartX, lineY);
ctx.lineTo(progressX, lineY);
ctx.stroke();

if (settings.showChapterMarks) {
    const positions = getChapterPositions();
    ctx.strokeStyle = chapterMarkColor;
    ctx.lineWidth = 1;
    for (const pos of positions) {
        const markX = barStartX + pos * barWidth;
        if (markX >= barStartX && markX <= barEndX) {
            ctx.beginPath();
            ctx.moveTo(markX, lineY - chapterMarkHeight / 2);
            ctx.lineTo(markX, lineY + chapterMarkHeight / 2);
            ctx.stroke();
        }
    }
}
    }

    if (settings.showChapterProgress && barWidth > 0) {
const chapterInfo = getChapterInfoForPage(currentPage);
if (chapterInfo) {
    const chapterPages = chapterInfo.endPage - chapterInfo.startPage + 1;
    const pageInChapter = currentPage - chapterInfo.startPage + 1;
    const chapterProgress = pageInChapter / chapterPages;

    if (!settings.showProgressLine) {
        ctx.strokeStyle = baseLineColor;
        ctx.lineWidth = lineThickness;
        ctx.beginPath();
        ctx.moveTo(barStartX, lineY);
        ctx.lineTo(barEndX, lineY);
        ctx.stroke();
    }

    const chapterY = settings.showProgressLine ? lineY + 9 : lineY;
    const chapterProgressX = barStartX + barWidth * chapterProgress;
    ctx.strokeStyle = progressColor;
    ctx.lineWidth = settings.showProgressLine ? 2 : progressThickness;
    ctx.beginPath();
    ctx.moveTo(barStartX, chapterY);
    ctx.lineTo(chapterProgressX, chapterY);
    ctx.stroke();
}
    }
}

function applySettings() {
    if (!renderer) return;
    const settings = getSettings();

    renderer.setFontSize(settings.fontSize);
    if (renderer.setFontWeight) {
renderer.setFontWeight(settings.fontWeight);
    }
    renderer.setInterlineSpace(settings.lineHeight);

    let topMargin = settings.margin;
    let bottomMargin = settings.margin;
    const edgeMargin = settings.progressEdgeMargin || 0;

    if (settings.enableProgressBar) {
const hasBothLines = settings.showProgressLine && settings.showChapterProgress;
const hasProgressLine = settings.showProgressLine || settings.showChapterProgress;
const isFullWidth = settings.progressFullWidth;
let progressHeight = PROGRESS_BAR_HEIGHT;
if (settings.showChapterMarks || (isFullWidth && hasBothLines)) {
    progressHeight = PROGRESS_BAR_HEIGHT_EXTENDED;
} else if (isFullWidth && hasProgressLine) {
    progressHeight = PROGRESS_BAR_HEIGHT_FULLWIDTH;
}

if (settings.progressPosition === 'bottom') {
    bottomMargin = Math.max(settings.margin, progressHeight + edgeMargin);
} else {
    topMargin = Math.max(settings.margin, progressHeight + edgeMargin);
}
    }

    renderer.setMargins(settings.margin, topMargin, settings.margin, bottomMargin);

    if (settings.fontFace) {
renderer.setFontFace(settings.fontFace);
    }

    if (renderer.setTextAlign) {
renderer.setTextAlign(settings.textAlign);
    }

    if (renderer.setWordSpacing) {
renderer.setWordSpacing(settings.wordSpacing);
    }

    if (renderer.setHyphenation) {
renderer.setHyphenation(settings.hyphenation);
    }

    if (renderer.setIgnoreDocMargins) {
renderer.setIgnoreDocMargins(settings.ignoreDocMargins);
    }

    if (renderer.setFontHinting) {
renderer.setFontHinting(settings.fontHinting);
    }

    if (renderer.setFontAntialiasing) {
renderer.setFontAntialiasing(settings.fontAntialiasing);
    }

    try {
renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
    } catch (e) {
// Status bar API may not be available
    }

    const pageCount = renderer.getPageCount();
    totalPagesEl.textContent = pageCount;
    bookPages.textContent = pageCount;

    loadToc();
    renderPreview();
}

function addFiles(files) {
    const epubFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.epub'));
    if (epubFiles.length === 0) return;

    let firstNewIndex = -1;
    for (const file of epubFiles) {
if (!loadedFiles.some(f => f.name === file.name && f.file.size === file.size)) {
    if (firstNewIndex === -1) {
        firstNewIndex = loadedFiles.length;
    }
    loadedFiles.push({ file, name: file.name, loaded: false });
}
    }

    updateFileListUI();

    if (firstNewIndex !== -1) {
switchToFile(firstNewIndex);
    }
}

function updateFileListUI() {
    if (loadedFiles.length === 0) {
fileListContainer.style.display = 'none';
exportAllBtn.style.display = 'none';
return;
    }

    fileListContainer.style.display = 'block';
    fileCount.textContent = `${loadedFiles.length} file${loadedFiles.length > 1 ? 's' : ''} loaded`;

    if (loadedFiles.length > 1) {
exportAllBtn.style.display = 'block';
exportAllBtn.disabled = false;
    } else {
exportAllBtn.style.display = 'none';
    }

    fileListItems.innerHTML = '';
    loadedFiles.forEach((fileInfo, index) => {
const div = document.createElement('div');
div.className = 'file-item' + (index === currentFileIndex ? ' active' : '');
div.innerHTML = `
    <span class="file-name" title="${fileInfo.name}">${fileInfo.name}</span>
    <span class="file-remove" data-index="${index}" title="Remove">&times;</span>
`;
div.addEventListener('click', (e) => {
    if (!e.target.classList.contains('file-remove')) {
        switchToFile(index);
    }
});
fileListItems.appendChild(div);
    });

    fileListItems.querySelectorAll('.file-remove').forEach(btn => {
btn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeFile(parseInt(btn.dataset.index));
});
    });
}

function removeFile(index) {
    loadedFiles.splice(index, 1);

    if (loadedFiles.length === 0) {
currentFileIndex = 0;
resetUI();
    } else if (index <= currentFileIndex) {
currentFileIndex = Math.max(0, currentFileIndex - 1);
switchToFile(currentFileIndex);
    }

    updateFileListUI();
}

function clearAllFiles() {
    loadedFiles = [];
    currentFileIndex = 0;
    resetUI();
    updateFileListUI();
}

function resetUI() {
    if (bookInfo) bookInfo.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    if (previewFrame) previewFrame.style.display = 'none';
    if (deviceColorToggle) deviceColorToggle.style.display = 'none';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;
    if (exportBtn) exportBtn.disabled = true;
    if (exportXtgBtn) exportXtgBtn.disabled = true;
    if (chapterList) chapterList.innerHTML = '<div class="chapter-item text-muted">Load an EPUB file...</div>';
    if (currentPageEl) currentPageEl.textContent = '0';
    if (totalPagesEl) totalPagesEl.textContent = '0';
}

async function switchToFile(index) {
    if (index < 0 || index >= loadedFiles.length) return;
    if (isProcessing) return;

    currentFileIndex = index;
    const fileInfo = loadedFiles[index];

    await loadEpub(fileInfo.file);
    fileInfo.loaded = true;

    updateFileListUI();
}

async function loadEpub(file) {
    if (!wasmReady || !renderer) {
alert('WASM not ready yet. Please wait...');
return;
    }

    try {
loadingOverlay.classList.remove('hidden');
if (loadingText) loadingText.textContent = 'Loading book...';

const arrayBuffer = await file.arrayBuffer();
const data = new Uint8Array(arrayBuffer);

const ptr = Module.allocateMemory(data.length);
Module.HEAPU8.set(data, ptr);

const result = renderer.loadEpubFromMemory(ptr, data.length);
Module.freeMemory(ptr);

if (!result) {
    throw new Error('Failed to load EPUB');
}

const info = renderer.getDocumentInfo();
metadata = {
    title: info.title || file.name,
    authors: info.authors || 'Unknown',
    language: info.language || ''
};

if (hyphenation.value === '2') {
    const lang = hyphenationLang.value === 'auto'
        ? (metadata.language || 'en')
        : hyphenationLang.value;
    await loadHyphenationPattern(lang);
}

const autoOption = hyphenationLang.querySelector('option[value="auto"]');
if (metadata.language) {
    autoOption.textContent = `Auto (${metadata.language})`;
} else {
    autoOption.textContent = 'Auto (from EPUB)';
}

bookInfo.style.display = 'flex';
bookTitle.textContent = metadata.title;
bookAuthor.textContent = metadata.authors;
bookPages.textContent = renderer.getPageCount();
totalPagesEl.textContent = renderer.getPageCount();

applySettings();

emptyState.style.display = 'none';
previewFrame.style.display = 'block';
previewFrame.classList.add(`orientation-${orientation.value || '0'}`);
deviceColorToggle.style.display = 'flex';
loadingOverlay.classList.add('hidden');

prevBtn.disabled = false;
nextBtn.disabled = false;
refreshBtn.disabled = false;
exportBtn.disabled = false;
exportXtgBtn.disabled = false;

renderPreview();

    } catch (error) {
console.error('Error loading EPUB:', error);
alert('Error loading EPUB file: ' + error.message);
loadingOverlay.classList.add('hidden');
    }
}

function loadToc() {
    if (!renderer) return;

    try {
currentToc = renderer.getToc();
renderChapterList(currentToc);
    } catch (e) {
console.error('Error loading TOC:', e);
    }
}

function renderChapterList(toc, container = chapterList, depth = 0) {
    if (depth === 0) {
container.innerHTML = '';
    }

    for (const item of toc) {
const div = document.createElement('div');
div.className = 'chapter-item';
div.style.paddingLeft = (12 + depth * 15) + 'px';
div.textContent = item.title;
div.dataset.page = item.page;
div.addEventListener('click', () => {
    renderer.goToPage(item.page);
    renderPreview();
});
container.appendChild(div);

if (item.children && item.children.length > 0) {
    renderChapterList(item.children, container, depth + 1);
}
    }
}

function renderPreview() {
    if (!renderer) return;

    renderer.renderCurrentPage();

    const buffer = renderer.getFrameBuffer();

    const ctx = previewCanvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

    for (let i = 0; i < buffer.length; i++) {
imageData.data[i] = buffer[i];
    }

    ctx.putImageData(imageData, 0, 0);

    const settings = getSettings();
    const isHQ = settings.qualityMode === 'hq';

    if (settings.enableDithering) {
applyDithering(ctx, settings.bitDepth, settings.ditherStrength, isHQ);
    } else {
quantizeImage(ctx, settings.bitDepth, isHQ);
    }

    if (settings.enableNegative) {
applyNegative(ctx);
    }

    const currentPage = renderer.getCurrentPage();
    const totalPages = renderer.getPageCount();
    drawProgressIndicator(ctx, settings, currentPage, totalPages);

    currentPageEl.textContent = renderer.getCurrentPage() + 1;

    prevBtn.disabled = renderer.getCurrentPage() === 0;
    nextBtn.disabled = renderer.getCurrentPage() >= renderer.getPageCount() - 1;
}

function applyDitheringAsync(imageData, bits, strength, xthMode = false) {
    return new Promise((resolve) => {
if (!ditherWorker) {
    applyDitheringSyncToData(imageData.data, SCREEN_WIDTH, SCREEN_HEIGHT, bits, strength, xthMode);
    resolve(imageData.data);
    return;
}

const id = ++ditherJobId;
const dataCopy = new Uint8ClampedArray(imageData.data);

ditherCallbacks.set(id, resolve);
ditherWorker.postMessage({
    imageData: dataCopy.buffer,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    bits,
    strength,
    id,
    xthMode
}, [dataCopy.buffer]);
    });
}

function applyDitheringSyncToData(data, width, height, bits, strength, xthMode = false) {
    const factor = strength / 100;
    const pixelCount = width * height;

    const err7_16 = factor * 7 / 16;
    const err3_16 = factor * 3 / 16;
    const err5_16 = factor * 5 / 16;
    const err1_16 = factor * 1 / 16;

    let quantize;
    if (xthMode) {
quantize = (val) => {
    if (val > 212) return 255;
    else if (val > 127) return 170;
    else if (val > 42) return 85;
    else return 0;
};
    } else {
const levels = Math.pow(2, bits);
const step = 255 / (levels - 1);
const invStep = 1 / step;
quantize = (val) => Math.round(val * invStep) * step;
    }

    const gray = new Float32Array(pixelCount);

    for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    const widthM1 = width - 1;
    const heightM1 = height - 1;

    for (let y = 0; y < height; y++) {
const rowStart = y * width;
const nextRowStart = rowStart + width;
const isNotLastRow = y < heightM1;

for (let x = 0; x < width; x++) {
    const idx = rowStart + x;
    const oldPixel = gray[idx];
    const newPixel = quantize(oldPixel);

    gray[idx] = newPixel;
    const error = oldPixel - newPixel;

    if (x < widthM1) gray[idx + 1] += error * err7_16;
    if (isNotLastRow) {
        if (x > 0) gray[nextRowStart + x - 1] += error * err3_16;
        gray[nextRowStart + x] += error * err5_16;
        if (x < widthM1) gray[nextRowStart + x + 1] += error * err1_16;
    }
}
    }

    for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
const g = gray[i] < 0 ? 0 : (gray[i] > 255 ? 255 : (gray[i] + 0.5) | 0);
data[idx] = data[idx + 1] = data[idx + 2] = g;
    }
}

function applyDithering(ctx, bits, strength, xthMode = false) {
    const imageData = ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    applyDitheringSyncToData(imageData.data, SCREEN_WIDTH, SCREEN_HEIGHT, bits, strength, xthMode);
    ctx.putImageData(imageData, 0, 0);
}

function quantizeImage(ctx, bits, xthMode = false) {
    const imageData = ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    const data = imageData.data;
    const len = data.length;

    if (xthMode) {
for (let i = 0; i < len; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let quantized;
    if (gray > 212) quantized = 255;
    else if (gray > 127) quantized = 170;
    else if (gray > 42) quantized = 85;
    else quantized = 0;
    data[i] = data[i + 1] = data[i + 2] = quantized;
}
    } else {
const levels = Math.pow(2, bits);
const step = 255 / (levels - 1);
const invStep = 1 / step;

for (let i = 0; i < len; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const quantized = ((gray * invStep + 0.5) | 0) * step;
    data[i] = data[i + 1] = data[i + 2] = quantized;
}
    }

    ctx.putImageData(imageData, 0, 0);
}

function applyNegative(ctx) {
    const imageData = ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
data[i] = 255 - data[i];
data[i + 1] = 255 - data[i + 1];
data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
}

function generateXtgData(canvas, bits) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    function writeHeader(view, dataSize, bitCode) {
view.setUint8(0, 0x58); // X
view.setUint8(1, 0x54); // T
view.setUint8(2, 0x47); // G
view.setUint8(3, 0x00);
view.setUint16(4, width, true);
view.setUint16(6, height, true);
view.setUint8(8, 0);
view.setUint8(9, bitCode);
view.setUint32(10, dataSize, true);
    }

    if (bits === 1) {
const bytesPerRow = (width + 7) >> 3;
const dataSize = bytesPerRow * height;
const buffer = new ArrayBuffer(22 + dataSize);
const view = new DataView(buffer);
const dataArray = new Uint8Array(buffer);
writeHeader(view, dataSize, 0);

let pixelIdx = 0;
for (let y = 0; y < height; y++) {
    const rowOffset = 22 + y * bytesPerRow;
    for (let x = 0; x < width; x += 8) {
        let byte = 0;
        const endX = Math.min(x + 8, width);
        for (let bx = x; bx < endX; bx++) {
            if (data[pixelIdx] >= 128) {
                byte |= (1 << (7 - (bx - x)));
            }
            pixelIdx += 4;
        }
        dataArray[rowOffset + (x >> 3)] = byte;
    }
}
return buffer;
    } else if (bits === 2) {
const bytesPerRow = (width + 3) >> 2;
const dataSize = bytesPerRow * height;
const buffer = new ArrayBuffer(22 + dataSize);
const view = new DataView(buffer);
const dataArray = new Uint8Array(buffer);
writeHeader(view, dataSize, 1);

let pixelIdx = 0;
for (let y = 0; y < height; y++) {
    const rowOffset = 22 + y * bytesPerRow;
    for (let x = 0; x < width; x += 4) {
        let byte = 0;
        const endX = Math.min(x + 4, width);
        for (let bx = x; bx < endX; bx++) {
            const level = data[pixelIdx] >> 6;
            byte |= (level << ((3 - (bx - x)) * 2));
            pixelIdx += 4;
        }
        dataArray[rowOffset + (x >> 2)] = byte;
    }
}
return buffer;
    } else {
const bytesPerRow = (width + 1) >> 1;
const dataSize = bytesPerRow * height;
const buffer = new ArrayBuffer(22 + dataSize);
const view = new DataView(buffer);
const dataArray = new Uint8Array(buffer);
writeHeader(view, dataSize, 2);

let pixelIdx = 0;
for (let y = 0; y < height; y++) {
    const rowOffset = 22 + y * bytesPerRow;
    for (let x = 0; x < width; x += 2) {
        let byte = 0;
        const endX = Math.min(x + 2, width);
        for (let bx = x; bx < endX; bx++) {
            const level = data[pixelIdx] >> 4;
            byte |= (level << ((1 - (bx - x)) * 4));
            pixelIdx += 4;
        }
        dataArray[rowOffset + (x >> 1)] = byte;
    }
}
return buffer;
    }
}

function generateXthData(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const bytesPerColumn = Math.ceil(height / 8);
    const planeSize = bytesPerColumn * width;
    const dataSize = planeSize * 2;

    const buffer = new ArrayBuffer(22 + dataSize);
    const view = new DataView(buffer);
    const dataArray = new Uint8Array(buffer);

    view.setUint8(0, 0x58); // X
    view.setUint8(1, 0x54); // T
    view.setUint8(2, 0x48); // H
    view.setUint8(3, 0x00);
    view.setUint16(4, width, true);
    view.setUint16(6, height, true);
    view.setUint8(8, 0);
    view.setUint8(9, 0);
    view.setUint32(10, dataSize, true);

    const plane1Offset = 22;
    const plane2Offset = 22 + planeSize;

    for (let x = width - 1; x >= 0; x--) {
for (let y = 0; y < height; y++) {
    const pixelIdx = (y * width + x) * 4;
    const gray = data[pixelIdx];

    let val;
    if (gray > 212) val = 0;
    else if (gray > 127) val = 2;
    else if (gray > 42) val = 1;
    else val = 3;

    const bit1 = (val >> 1) & 1;
    const bit2 = val & 1;

    const colIdx = (width - 1 - x);
    const byteInCol = Math.floor(y / 8);
    const byteIdx = colIdx * bytesPerColumn + byteInCol;

    const bitIdx = 7 - (y % 8);

    if (bit1) {
        dataArray[plane1Offset + byteIdx] |= (1 << bitIdx);
    }
    if (bit2) {
        dataArray[plane2Offset + byteIdx] |= (1 << bitIdx);
    }
}
    }

    return buffer;
}

async function generateXtcData(progressCallback) {
    const headerSize = 56;
    const metadataSize = 256;
    const chapterEntrySize = 96;
    const indexEntrySize = 16;

    const pageBuffers = [];
    let totalDataSize = 0;

    const settings = getSettings();
    const bits = settings.bitDepth;
    const isHQ = settings.qualityMode === 'hq';
    const pageCount = renderer.getPageCount();

    const chapters = [];
    function extractChapters(items) {
for (const item of items) {
    const page = Math.max(0, Math.min(item.page, pageCount - 1));
    chapters.push({
        name: item.title.substring(0, 79),
        startPage: page,
        endPage: -1
    });
    if (item.children && item.children.length > 0) {
        extractChapters(item.children);
    }
}
    }
    extractChapters(currentToc);

    chapters.sort((a, b) => a.startPage - b.startPage);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = SCREEN_WIDTH;
    tempCanvas.height = SCREEN_HEIGHT;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    const pendingDither = [];
    const PIPELINE_DEPTH = 2;

    function finalizePage(imageData, page, settings, bits, pageCount, isHQ) {
tempCtx.putImageData(imageData, 0, 0);

if (settings.enableNegative) {
    applyNegative(tempCtx);
}

drawProgressIndicator(tempCtx, settings, page, pageCount);

const rotation = settings.rotation;
let finalCanvas = tempCanvas;

if (rotation !== 0) {
    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = DEVICE_WIDTH;
    rotatedCanvas.height = DEVICE_HEIGHT;
    const rCtx = rotatedCanvas.getContext('2d');

    if (rotation === 90) {
        rCtx.translate(DEVICE_WIDTH, 0);
        rCtx.rotate(90 * Math.PI / 180);
    } else if (rotation === 180) {
        rCtx.translate(DEVICE_WIDTH, DEVICE_HEIGHT);
        rCtx.rotate(180 * Math.PI / 180);
    } else if (rotation === 270) {
        rCtx.translate(0, DEVICE_HEIGHT);
        rCtx.rotate(270 * Math.PI / 180);
    }
    rCtx.drawImage(tempCanvas, 0, 0);

    finalCanvas = rotatedCanvas;
}

return isHQ ? generateXthData(finalCanvas) : generateXtgData(finalCanvas, 1);
    }

    for (let page = 0; page < pageCount; page++) {
if (progressCallback) {
    const progress = Math.round((page / pageCount) * 100);
    progressCallback(progress, 100, `Rendering page ${page + 1} of ${pageCount}...`);
}

renderer.goToPage(page);
renderer.renderCurrentPage();

const buffer = renderer.getFrameBuffer();
const imageData = tempCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
imageData.data.set(buffer);

if (settings.enableDithering && ditherWorker) {
    const ditherPromise = applyDitheringAsync(imageData, bits, settings.ditherStrength, isHQ);
    pendingDither.push({ page, imageData, promise: ditherPromise });
} else {
    tempCtx.putImageData(imageData, 0, 0);
    if (settings.enableDithering) {
        applyDithering(tempCtx, bits, settings.ditherStrength, isHQ);
    } else {
        quantizeImage(tempCtx, bits, isHQ);
    }
    const finalImageData = tempCtx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    const pageData = finalizePage(finalImageData, page, settings, bits, pageCount, isHQ);
    pageBuffers[page] = pageData;
    totalDataSize += pageData.byteLength;
}

while (pendingDither.length >= PIPELINE_DEPTH) {
    const oldest = pendingDither.shift();
    const ditheredData = await oldest.promise;

    const finalImageData = tempCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    finalImageData.data.set(ditheredData);

    const pageData = finalizePage(finalImageData, oldest.page, settings, bits, pageCount, isHQ);
    pageBuffers[oldest.page] = pageData;
    totalDataSize += pageData.byteLength;
}
    }

    while (pendingDither.length > 0) {
const oldest = pendingDither.shift();
const ditheredData = await oldest.promise;

const finalImageData = tempCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
finalImageData.data.set(ditheredData);

const pageData = finalizePage(finalImageData, oldest.page, settings, bits, pageCount, isHQ);
pageBuffers[oldest.page] = pageData;
totalDataSize += pageData.byteLength;
    }

    for (let i = 0; i < chapters.length; i++) {
if (i < chapters.length - 1) {
    chapters[i].endPage = chapters[i + 1].startPage - 1;
} else {
    chapters[i].endPage = pageCount - 1;
}
if (chapters[i].endPage < chapters[i].startPage) {
    chapters[i].endPage = chapters[i].startPage;
}
    }

    const chapterCount = chapters.length;
    const hasChapters = chapterCount > 0 ? 1 : 0;

    const metadataOffset = headerSize;
    const chaptersOffset = metadataOffset + metadataSize;
    const chaptersSize = chapterCount * chapterEntrySize;
    const indexOffset = chaptersOffset + chaptersSize;
    const indexSize = pageCount * indexEntrySize;
    const dataOffset = indexOffset + indexSize;
    const totalSize = dataOffset + totalDataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const dataArray = new Uint8Array(buffer);

    view.setUint8(0, 0x58); // X
    view.setUint8(1, 0x54); // T
    view.setUint8(2, 0x43); // C
    view.setUint8(3, isHQ ? 0x48 : 0x00);
    view.setUint16(4, 1, true);
    view.setUint16(6, pageCount, true);
    view.setUint8(8, 0);
    view.setUint8(9, 1);
    view.setUint8(10, 0);
    view.setUint8(11, hasChapters);
    view.setUint32(12, 1, true);

    view.setBigUint64(16, BigInt(metadataOffset), true);
    view.setBigUint64(24, BigInt(indexOffset), true);
    view.setBigUint64(32, BigInt(dataOffset), true);
    view.setBigUint64(40, BigInt(0), true);
    view.setBigUint64(48, BigInt(chaptersOffset), true);

    const encoder = new TextEncoder();
    const title = metadata.title || 'Untitled';
    const author = metadata.authors || 'Unknown';

    const titleBytes = encoder.encode(title);
    const authorBytes = encoder.encode(author);

    for (let i = 0; i < Math.min(titleBytes.length, 127); i++) {
dataArray[metadataOffset + i] = titleBytes[i];
    }

    for (let i = 0; i < Math.min(authorBytes.length, 63); i++) {
dataArray[metadataOffset + 0x80 + i] = authorBytes[i];
    }

    view.setUint32(metadataOffset + 0xF0, Math.floor(Date.now() / 1000), true);
    view.setUint16(metadataOffset + 0xF4, 0, true);
    view.setUint16(metadataOffset + 0xF6, chapterCount, true);

    for (let i = 0; i < chapters.length; i++) {
const chapterOffset = chaptersOffset + i * chapterEntrySize;
const chapter = chapters[i];

const nameBytes = encoder.encode(chapter.name);
for (let j = 0; j < Math.min(nameBytes.length, 79); j++) {
    dataArray[chapterOffset + j] = nameBytes[j];
}

view.setUint16(chapterOffset + 0x50, chapter.startPage + 1, true);
view.setUint16(chapterOffset + 0x52, chapter.endPage + 1, true);
    }

    let absoluteOffset = dataOffset;
    for (let i = 0; i < pageCount; i++) {
const indexEntryAddr = indexOffset + i * indexEntrySize;
const pageData = new Uint8Array(pageBuffers[i]);

view.setBigUint64(indexEntryAddr, BigInt(absoluteOffset), true);
view.setUint32(indexEntryAddr + 8, pageData.byteLength, true);
view.setUint16(indexEntryAddr + 12, DEVICE_WIDTH, true);
view.setUint16(indexEntryAddr + 14, DEVICE_HEIGHT, true);

absoluteOffset += pageData.byteLength;
    }

    let writeOffset = dataOffset;
    for (let i = 0; i < pageCount; i++) {
const pageData = new Uint8Array(pageBuffers[i]);
dataArray.set(pageData, writeOffset);
writeOffset += pageData.byteLength;
    }

    return buffer;
}

function downloadFile(data, filename) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
document.body.removeChild(a);
URL.revokeObjectURL(url);
    }, 100);
}

async function checkAutoLoadDemo() {
    const urlParams = new URLSearchParams(window.location.search);
    const demo = urlParams.get('demo');
    const book = urlParams.get('book');
    
    if (demo === 'true' || book === 'alice') {
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const response = await fetch('./assets/pg11-alice-in-wonderland-licensefree.epub');
            if (!response.ok) {
                console.error('Failed to fetch demo book:', response.statusText);
                return;
            }
            
            const blob = await response.blob();
            const file = new File([blob], 'alice-in-wonderland.epub', { type: 'application/epub+zip' });
            
            addFiles([file]);
            
            console.log('Demo book loaded successfully!');
        } catch (error) {
            console.error('Error loading demo book:', error);
        }
    }
}
