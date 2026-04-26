const path = require('path');
const { fork } = require('child_process');

const DEFAULT_WORKER_BATCH = 3;

class WorkerPool {
    constructor({ size, baseSettings, fontPath, workerBatch }) {
        this.size = size;
        this.baseSettings = baseSettings;
        this.fontPath = fontPath;
        this.workerBatch = workerBatch || DEFAULT_WORKER_BATCH;
        this.workerArg = JSON.stringify({ baseSettings, fontPath });
        this.workers = [];
        this.jobIdCounter = 0;
        this.activeJobs = new Map();
        this.queue = [];
        this.shuttingDown = false;

        for (let i = 0; i < size; i++) {
            this._spawnWorker(i);
        }
    }

    _spawnWorker(slotId) {
        const child = fork(path.join(__dirname, 'worker.js'), [this.workerArg], {
            stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        });
        if (child.stderr) {
            let buf = '';
            child.stderr.on('data', (chunk) => {
                buf += chunk.toString();
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line) continue;
                    if (line.startsWith('CRE:')) continue;
                    process.stderr.write(`[w${slotId}] ${line}\n`);
                }
            });
        }
        const wrapper = {
            worker: child,
            ready: false,
            busy: false,
            id: slotId,
            booksProcessed: 0,
            recycling: false,
            shuttingDown: false,
        };
        child.on('message', (msg) => this._onMessage(wrapper, msg));
        child.on('error', (err) => {
            process.stderr.write(`worker ${slotId} error: ${err.message}\n`);
        });
        child.on('exit', (code) => {
            if (wrapper.shuttingDown || wrapper.recycling) return;
            if (wrapper.currentJobId !== null && wrapper.currentJobId !== undefined) {
                const job = this.activeJobs.get(wrapper.currentJobId);
                this.activeJobs.delete(wrapper.currentJobId);
                if (job) job.resolve({ ok: false, error: `worker crashed (exit ${code})` });
            }
            wrapper.busy = false;
            wrapper.currentJobId = null;
            if (code !== 0) process.stderr.write(`worker ${slotId} exited with code ${code}; respawning\n`);
            if (!this.shuttingDown) {
                this._spawnWorker(slotId);
                this._dispatch();
            }
        });
        this.workers[slotId] = wrapper;
    }

    _recycleWorker(wrapper) {
        wrapper.recycling = true;
        try { wrapper.worker.send({ type: 'shutdown' }); } catch (e) { /* */ }
        wrapper.worker.once('exit', () => {
            if (this.shuttingDown) return;
            this._spawnWorker(wrapper.id);
            this._dispatch();
        });
        setTimeout(() => {
            try { wrapper.worker.kill(); } catch (e) {}
        }, 2000);
    }

    _onMessage(wrapper, msg) {
        if (msg.type === 'ready') {
            wrapper.ready = true;
            this._dispatch();
        } else if (msg.type === 'fatal') {
            process.stderr.write(`worker ${wrapper.id} fatal: ${msg.message}\n`);
        } else if (msg.type === 'progress') {
            const job = this.activeJobs.get(msg.jobId);
            if (job && job.onProgress) job.onProgress(msg.pct, msg.msg, wrapper.id);
        } else if (msg.type === 'done' || msg.type === 'error') {
            const job = this.activeJobs.get(msg.jobId);
            this.activeJobs.delete(msg.jobId);
            wrapper.busy = false;
            wrapper.currentJobId = null;
            wrapper.booksProcessed++;
            if (job) {
                if (msg.type === 'done') job.resolve({ ok: true, ...msg });
                else job.resolve({ ok: false, error: msg.message });
            }
            const hitBatch = wrapper.booksProcessed >= this.workerBatch;
            const errored = msg.type === 'error';
            if ((hitBatch || errored) && !this.shuttingDown) {
                this._recycleWorker(wrapper);
            } else {
                this._dispatch();
            }
        }
    }

    _dispatch() {
        while (this.queue.length > 0) {
            const idle = this.workers.find((w) => w && w.ready && !w.busy && !w.recycling && !w.shuttingDown);
            if (!idle) return;
            const job = this.queue.shift();
            idle.busy = true;
            idle.currentJobId = job.id;
            this.activeJobs.set(job.id, job);
            idle.worker.send({
                type: 'process',
                jobId: job.id,
                epubPath: job.epubPath,
                outputPath: job.outputPath,
                baseSettings: job.baseSettings,
                patternsDir: job.patternsDir,
            });
        }
    }

    submit({ epubPath, outputPath, baseSettings, patternsDir, onProgress, priority }) {
        return new Promise((resolve) => {
            const id = ++this.jobIdCounter;
            const job = { id, epubPath, outputPath, baseSettings, patternsDir, onProgress, resolve };
            if (priority) this.queue.unshift(job);
            else this.queue.push(job);
            this._dispatch();
        });
    }

    async shutdown() {
        this.shuttingDown = true;
        for (const w of this.workers) {
            if (!w) continue;
            w.shuttingDown = true;
            try { w.worker.send({ type: 'shutdown' }); } catch (e) { /* */ }
        }
        await Promise.all(this.workers.map((w) => {
            if (!w) return Promise.resolve();
            return new Promise((res) => {
                w.worker.once('exit', res);
                setTimeout(() => { try { w.worker.kill(); } catch (e) {} res(); }, 2000);
            });
        }));
    }
}

module.exports = { WorkerPool };
