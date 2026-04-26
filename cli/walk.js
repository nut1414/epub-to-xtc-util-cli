const fs = require('fs');
const path = require('path');

function shouldSkip(name) {
    if (!name) return true;
    if (name.startsWith('.')) return true;
    if (name === '__MACOSX') return true;
    return false;
}

function walkEpubs(rootDir) {
    const results = [];
    const absRoot = path.resolve(rootDir);

    function walk(dir, relPrefix) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (err) {
            return;
        }
        for (const entry of entries) {
            if (shouldSkip(entry.name)) continue;
            const abs = path.join(dir, entry.name);
            const rel = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
            if (entry.isDirectory()) {
                walk(abs, rel);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.epub')) {
                results.push({ absPath: abs, relPath: rel });
            }
        }
    }

    walk(absRoot, '');
    results.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return results;
}

module.exports = { walkEpubs };
