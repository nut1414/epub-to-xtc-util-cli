const isTTY = !!process.stderr.isTTY;
const supportsAnsi = isTTY && process.env.TERM !== 'dumb';

function bar(percent, width = 20) {
    const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
    return '[' + '='.repeat(Math.max(0, filled - 1)) + (filled > 0 ? '>' : '') + ' '.repeat(width - filled) + ']';
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function timestamp() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

class ProgressPrinter {
    constructor({ quiet = false, mode = 'single' } = {}) {
        this.quiet = quiet;
        this.mode = mode; // 'single' | 'folder'
        this.outerLine = '';
        this.outerDrawn = false;
        this.lastInnerWrite = 0;
        this.innerThrottleMs = 100;
        this.lastPipedLog = 0;
        this.pipedThrottleMs = 1000;
    }

    setOuter(line) {
        if (this.quiet) return;
        this.outerLine = line;
        if (supportsAnsi) {
            if (this.outerDrawn) {
                process.stderr.write('\r\x1b[K\x1b[1A\r\x1b[K');
            }
            process.stderr.write(line + '\n');
            this.outerDrawn = true;
        } else {
            process.stderr.write(`[${timestamp()}] ${line}\n`);
        }
    }

    inner(line) {
        if (this.quiet) return;
        if (supportsAnsi) {
            const now = Date.now();
            if (now - this.lastInnerWrite < this.innerThrottleMs) return;
            this.lastInnerWrite = now;
            process.stderr.write('\r\x1b[K' + line);
        } else {
            const now = Date.now();
            if (now - this.lastPipedLog < this.pipedThrottleMs) return;
            this.lastPipedLog = now;
            process.stderr.write(`[${timestamp()}] ${line}\n`);
        }
    }

    finalizeInner(line) {
        if (this.quiet) return;
        if (supportsAnsi) {
            process.stderr.write('\r\x1b[K' + line + '\n');
            this.outerDrawn = false;
            this.outerLine = '';
        } else {
            process.stderr.write(`[${timestamp()}] ${line}\n`);
        }
    }

    note(line) {
        if (this.quiet) return;
        if (supportsAnsi) {
            process.stderr.write('\r\x1b[K' + line + '\n');
        } else {
            process.stderr.write(`[${timestamp()}] ${line}\n`);
        }
    }
}

module.exports = { ProgressPrinter, bar, fmtBytes, timestamp, isTTY, supportsAnsi };
