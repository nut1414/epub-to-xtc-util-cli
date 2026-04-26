#!/usr/bin/env node
// Minimal static server — needed because WASM fetch fails on file:// protocol.
// Run: `node server.js` then open http://localhost:8080

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.epub': 'application/epub+zip',
    '.ttf':  'font/ttf',
    '.otf':  'font/otf',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.txt':  'text/plain; charset=utf-8',
    '.map':  'application/json; charset=utf-8',
};

function safeJoin(root, reqPath) {
    const decoded = decodeURIComponent(reqPath.split('?')[0]);
    const target = path.normalize(path.join(root, decoded));
    if (!target.startsWith(root)) return null;
    return target;
}

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Allow': 'GET, HEAD' });
        return res.end('Method Not Allowed');
    }

    const parsed = url.parse(req.url);
    let filePath = safeJoin(ROOT, parsed.pathname);
    if (!filePath) {
        res.writeHead(403); return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stat) => {
        if (err) { res.writeHead(404); return res.end('Not Found'); }
        if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

        fs.stat(filePath, (err2, stat2) => {
            if (err2) { res.writeHead(404); return res.end('Not Found'); }
            const ext = path.extname(filePath).toLowerCase();
            const type = MIME[ext] || 'application/octet-stream';
            res.writeHead(200, {
                'Content-Type': type,
                'Content-Length': stat2.size,
                'Cache-Control': 'no-cache',
            });
            if (req.method === 'HEAD') return res.end();
            fs.createReadStream(filePath).pipe(res);
        });
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Serving ${ROOT}`);
    console.log(`http://${HOST}:${PORT}/`);
});
