# epub-to-xtc

CLI to convert EPUB files to [XTC/XTH format](https://gist.github.com/CrazyCoder/b125f26d6987c0620058249f59f1327d) for XTEInk e-readers. Uses the [CoolReader](https://github.com/buggins/coolreader) engine.

## Install

```bash
git clone https://github.com/nut1414/epub-to-xtc-util.git
cd epub-to-xtc-util
npm install
```

Requires Node ≥ 18. Native `canvas` builds via `node-pre-gyp` (Linux/Alpine may need `cairo-dev pango-dev jpeg-dev`).

## Get a settings file

The CLI accepts a JSON settings file exported from the bundled web UI.

```bash
npm start
# open http://127.0.0.1:8080
# tweak font, margins, dithering, progress bar, etc. in sidebar
# click "Export Settings" → save as settings.json
```

Demo book: `http://127.0.0.1:8080/?demo=true`

## Run

```bash
# single file -> writes alongside input
node bin/epub-to-xtc book.epub

# explicit output
node bin/epub-to-xtc book.epub -o /tmp/book.xtc

# folder (recursive) -> writes to <folder>-xtc/ sibling
node bin/epub-to-xtc ~/Books

# folder + custom output dir
node bin/epub-to-xtc ~/Books -o ~/Converted

# with settings + custom font + parallel workers
node bin/epub-to-xtc ~/Books -s settings.json -f MyFont.ttf -c 4
```

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `-o, --out <path>` | sibling | output file (file mode) or directory (folder mode) |
| `-s, --settings <path>` | bundled defaults | settings JSON from web UI |
| `-f, --font <path>` | none | custom TTF/OTF; overrides `settings.fontFace` |
| `--format <fmt>` | from settings | `xtc` (1-bit), `xtch` (2-bit HQ), `xtg`, `xth` |
| `--patterns-dir <p>` | none | hyphenation patterns directory |
| `--set key=value` | — | inline setting override (repeatable) |
| `-c, --concurrency N` | 1 | parallel workers (folder mode) |
| `--worker-batch N` | 3 | restart each worker after N books (mitigates WASM table leak) |
| `--retries N` | 3 | max attempts per book on failure |
| `-q, --quiet` | off | suppress progress |

## Notes

- Folder input is always traversed recursively. Output mirrors directory structure.
- Existing output files are overwritten.
- Default fonts (Literata, Noto Naskh Arabic, Noto Sans JP, Noto Serif JP) are downloaded on first run and cached under `cli/.font-cache/`.
- Custom font is auto-set as primary; CJK + Arabic fallbacks remain active.

## License

GPL-2.0
