const HELP = `Usage: epub-to-xtc <input> [options]

Positional
  <input>                file (.epub) or folder

Options
  -o, --out <path>       output file (file mode) or output dir (folder mode)
  -s, --settings <path>  settings JSON exported from the HTML UI
  -f, --font <path>      custom TTF/OTF; overrides settings.fontFace
      --format <fmt>     xtc | xtch | xtg | xth (default: derived from settings.qualityMode)
      --patterns-dir <p> hyphenation patterns directory
      --set key=value    inline override of a settings key, repeatable
  -c, --concurrency N    parallel workers for folder mode (default: 1)
      --worker-batch N   restart each worker after N books (default: 3, mitigates WASM table leak)
      --retries N        max attempts per book on failure (default: 3)
  -q, --quiet            suppress progress output
  -h, --help             show this help
  -V, --version          show version

Folder input is always traversed recursively.
`;

function parseArgs(argv) {
    const out = {
        input: null,
        output: null,
        settingsPath: null,
        fontPath: null,
        format: null,
        patternsDir: null,
        set: [],
        concurrency: 1,
        workerBatch: 3,
        retries: 3,
        quiet: false,
        help: false,
        version: false,
        _errors: [],
    };

    const args = argv.slice(2);
    let i = 0;
    const requireVal = (flag) => {
        const v = args[i + 1];
        if (v === undefined || v.startsWith('-')) {
            out._errors.push(`missing value for ${flag}`);
            return null;
        }
        i += 1;
        return v;
    };

    while (i < args.length) {
        const a = args[i];
        if (a === '-h' || a === '--help') {
            out.help = true;
        } else if (a === '-V' || a === '--version') {
            out.version = true;
        } else if (a === '-q' || a === '--quiet') {
            out.quiet = true;
        } else if (a === '-o' || a === '--out') {
            out.output = requireVal(a);
        } else if (a === '-s' || a === '--settings') {
            out.settingsPath = requireVal(a);
        } else if (a === '-f' || a === '--font') {
            out.fontPath = requireVal(a);
        } else if (a === '--format') {
            out.format = requireVal(a);
        } else if (a === '--patterns-dir') {
            out.patternsDir = requireVal(a);
        } else if (a === '--set') {
            const v = requireVal(a);
            if (v) out.set.push(v);
        } else if (a === '-c' || a === '--concurrency') {
            const v = requireVal(a);
            if (v) {
                const n = parseInt(v, 10);
                if (Number.isFinite(n) && n >= 1) out.concurrency = n;
                else out._errors.push(`invalid --concurrency: ${v}`);
            }
        } else if (a.startsWith('--concurrency=')) {
            const n = parseInt(a.slice(14), 10);
            if (Number.isFinite(n) && n >= 1) out.concurrency = n;
            else out._errors.push(`invalid --concurrency: ${a.slice(14)}`);
        } else if (a === '--worker-batch') {
            const v = requireVal(a);
            if (v) {
                const n = parseInt(v, 10);
                if (Number.isFinite(n) && n >= 1) out.workerBatch = n;
                else out._errors.push(`invalid --worker-batch: ${v}`);
            }
        } else if (a.startsWith('--worker-batch=')) {
            const n = parseInt(a.slice(15), 10);
            if (Number.isFinite(n) && n >= 1) out.workerBatch = n;
            else out._errors.push(`invalid --worker-batch: ${a.slice(15)}`);
        } else if (a === '--retries') {
            const v = requireVal(a);
            if (v) {
                const n = parseInt(v, 10);
                if (Number.isFinite(n) && n >= 1) out.retries = n;
                else out._errors.push(`invalid --retries: ${v}`);
            }
        } else if (a.startsWith('--retries=')) {
            const n = parseInt(a.slice(10), 10);
            if (Number.isFinite(n) && n >= 1) out.retries = n;
            else out._errors.push(`invalid --retries: ${a.slice(10)}`);
        } else if (a.startsWith('--out=')) {
            out.output = a.slice(6);
        } else if (a.startsWith('--settings=')) {
            out.settingsPath = a.slice(11);
        } else if (a.startsWith('--font=')) {
            out.fontPath = a.slice(7);
        } else if (a.startsWith('--format=')) {
            out.format = a.slice(9);
        } else if (a.startsWith('--patterns-dir=')) {
            out.patternsDir = a.slice(15);
        } else if (a.startsWith('--set=')) {
            out.set.push(a.slice(6));
        } else if (a.startsWith('-')) {
            out._errors.push(`unknown flag: ${a}`);
        } else if (out.input === null) {
            out.input = a;
        } else {
            out._errors.push(`unexpected positional: ${a}`);
        }
        i += 1;
    }

    if (out.format) {
        const ok = ['xtc', 'xtch', 'xtg', 'xth'].includes(out.format);
        if (!ok) out._errors.push(`invalid --format: ${out.format} (must be xtc|xtch|xtg|xth)`);
    }

    return out;
}

function applySetOverrides(settings, setList) {
    for (const entry of setList) {
        const eq = entry.indexOf('=');
        if (eq < 0) continue;
        const key = entry.slice(0, eq).trim();
        let value = entry.slice(eq + 1);
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (/^-?\d+$/.test(value)) value = parseInt(value, 10);
        else if (/^-?\d+\.\d+$/.test(value)) value = parseFloat(value);
        settings[key] = value;
    }
    return settings;
}

module.exports = { parseArgs, applySetOverrides, HELP };
