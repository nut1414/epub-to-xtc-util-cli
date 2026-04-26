const supportsAnsi = !!process.stderr.isTTY && process.env.TERM !== 'dumb';

function bar(percent, width = 24) {
    const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pad(s, n) {
    s = String(s);
    if (s.length >= n) return s.slice(0, n);
    return s + ' '.repeat(n - s.length);
}

function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(secs) {
    if (secs < 60) return `${secs.toFixed(0)}s`;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}m${s.toString().padStart(2, '0')}s`;
}

class MultiProgress {
    constructor({ total, workerCount, quiet = false, label = '' }) {
        this.total = total;
        this.workerCount = workerCount;
        this.quiet = quiet;
        this.label = label;
        this.done = 0;
        this.failed = 0;
        this.workers = new Map(); // workerId -> { file, pct, startedAt }
        this.linesDrawn = 0;
        this.startedAt = Date.now();
        this.lastDraw = 0;
        this.drawThrottleMs = 80;
        this.headerNotePending = label ? label : null;
    }

    _eta() {
        const completed = this.done + this.failed;
        if (completed === 0) return null;
        const elapsed = (Date.now() - this.startedAt) / 1000;
        const rate = completed / elapsed;
        if (rate <= 0) return null;
        const remaining = this.total - completed;
        if (remaining <= 0) return null;
        return remaining / rate;
    }

    _clear() {
        if (!supportsAnsi || this.linesDrawn === 0) return;
        for (let i = 0; i < this.linesDrawn; i++) {
            process.stderr.write('\x1b[1A\x1b[2K');
        }
        this.linesDrawn = 0;
    }

    _draw() {
        if (this.quiet) return;
        if (!supportsAnsi) return;
        const now = Date.now();
        if (now - this.lastDraw < this.drawThrottleMs) return;
        this.lastDraw = now;

        this._clear();

        const eta = this._eta();
        const elapsed = ((Date.now() - this.startedAt) / 1000);
        const etaStr = eta !== null ? `  ETA ${fmtDuration(eta)}` : '';
        const header = `\x1b[1mbatch\x1b[0m: ${this.done}/${this.total} done | ${this.workers.size} active | ${this.failed} failed | elapsed ${fmtDuration(elapsed)}${etaStr}`;
        process.stderr.write(header + '\n');
        this.linesDrawn = 1;

        for (let i = 0; i < this.workerCount; i++) {
            const w = this.workers.get(i);
            const slot = pad(`W${i + 1}`, 3);
            if (w) {
                const file = pad(w.file, 32);
                process.stderr.write(`  ${slot} ${file} [${bar(w.pct)}] ${pad(w.pct + '%', 4)}\n`);
            } else {
                process.stderr.write(`  ${slot} ${pad('idle', 32)} ${pad('', 26)} \n`);
            }
            this.linesDrawn++;
        }
    }

    note(line) {
        if (this.quiet) return;
        if (supportsAnsi) {
            this._clear();
            process.stderr.write(line + '\n');
            this._draw();
        } else {
            process.stderr.write(line + '\n');
        }
    }

    onProgress(workerId, file, pct) {
        let w = this.workers.get(workerId);
        if (!w) {
            w = { file, pct: 0, startedAt: Date.now() };
            this.workers.set(workerId, w);
        }
        w.file = file;
        w.pct = pct;
        this._draw();
    }

    onComplete(workerId, file, ok, summary) {
        this.workers.delete(workerId);
        if (ok) this.done++;
        else this.failed++;
        if (!this.quiet) {
            if (supportsAnsi) {
                this._clear();
                const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
                process.stderr.write(`  ${tag} ${file} ${summary}\n`);
                this._draw();
            } else {
                const tag = ok ? 'OK' : 'FAIL';
                process.stderr.write(`[${tag}] ${file} ${summary}\n`);
            }
        }
    }

    finish() {
        if (this.quiet) return;
        if (supportsAnsi) this._draw();
        const elapsed = (Date.now() - this.startedAt) / 1000;
        const tag = this.failed === 0 ? '\x1b[32mdone\x1b[0m' : '\x1b[33mdone\x1b[0m';
        if (supportsAnsi) {
            this._clear();
        }
        process.stderr.write(`${supportsAnsi ? tag : 'done'}: converted ${this.done}/${this.total} files (${this.failed} failed) in ${fmtDuration(elapsed)}\n`);
    }
}

module.exports = { MultiProgress, bar, fmtBytes, fmtDuration, supportsAnsi };
