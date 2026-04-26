const fs = require('fs');
const path = require('path');

const { parseArgs, applySetOverrides, HELP } = require('./args');
const runner = require('./runner');

async function main() {
    const opts = parseArgs(process.argv);

    if (opts.help) {
        process.stdout.write(HELP);
        process.exit(0);
    }
    if (opts.version) {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
        process.stdout.write(`${pkg.name} ${pkg.version}\n`);
        process.exit(0);
    }
    if (opts._errors.length > 0) {
        for (const e of opts._errors) process.stderr.write(`error: ${e}\n`);
        process.stderr.write('\n' + HELP);
        process.exit(2);
    }
    if (!opts.input) {
        process.stderr.write('error: <input> is required\n\n' + HELP);
        process.exit(2);
    }

    const inputAbs = path.resolve(opts.input);
    if (!fs.existsSync(inputAbs)) {
        process.stderr.write(`error: input not found: ${inputAbs}\n`);
        process.exit(2);
    }

    let baseSettings = { ...runner.DEFAULT_SETTINGS };
    if (opts.settingsPath) {
        try {
            const fromFile = runner.loadSettingsFile(opts.settingsPath);
            baseSettings = runner.mergeSettings(baseSettings, fromFile);
        } catch (err) {
            process.stderr.write(`error: failed to load settings: ${err.message}\n`);
            process.exit(2);
        }
    }
    applySetOverrides(baseSettings, opts.set);
    baseSettings = runner.mergeSettings(baseSettings, baseSettings);

    if (opts.format === 'xtc') baseSettings.qualityMode = 'fast';
    if (opts.format === 'xtch') baseSettings.qualityMode = 'hq';
    baseSettings = runner.mergeSettings(baseSettings, baseSettings);

    if (opts.fontPath && !fs.existsSync(path.resolve(opts.fontPath))) {
        process.stderr.write(`error: font file not found: ${opts.fontPath}\n`);
        process.exit(2);
    }

    const stat = fs.statSync(inputAbs);
    const sharedArgs = {
        outputArg: opts.output,
        baseSettings,
        fontPath: opts.fontPath ? path.resolve(opts.fontPath) : null,
        patternsDir: opts.patternsDir ? path.resolve(opts.patternsDir) : null,
        formatFlag: opts.format,
        quiet: opts.quiet,
        concurrency: opts.concurrency,
        workerBatch: opts.workerBatch,
        retries: opts.retries,
    };

    if (stat.isDirectory()) {
        const res = await runner.runFolder({ inputDir: inputAbs, ...sharedArgs });
        process.exit(res.ok ? 0 : 1);
    } else {
        if (!inputAbs.toLowerCase().endsWith('.epub')) {
            process.stderr.write(`error: input file is not an .epub: ${inputAbs}\n`);
            process.exit(2);
        }
        const res = await runner.runFile({ inputPath: inputAbs, ...sharedArgs });
        process.exit(res.ok ? 0 : 1);
    }
}

main().catch((err) => {
    process.stderr.write(`fatal: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
});
