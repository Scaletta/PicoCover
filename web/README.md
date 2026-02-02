# PicoCover Web UI

Web interface for PicoCover - download and convert Nintendo DS cover art in your browser.

## Features

- Browser-based cover processing (no backend needed)
- Uses WebAssembly for fast image processing
- File System Access API for local file operations
- Batch processing of NDS ROM collections
- Automatic game code extraction from ROM headers
- Fetches covers from Cloudflare Worker proxy (https://picocover.retrosave.games)

## Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Building

```bash
npm run build
```

Output in `dist/`

## WASM Module

The web UI uses the WASM module from `../crates/wasm`. To rebuild WASM bindings:

```bash
cd ..
cargo build -p pico-cover-wasm --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/pico_cover_wasm.wasm \
  --out-dir web/pkg \
  --target web
```

## Browser Compatibility

Requires browsers with File System Access API support:
- Chrome 86+
- Edge 86+
- Opera 72+

**Firefox does not support this API yet.**

## Tech Stack

- React 18 + TypeScript
- Vite
- HeroUI
- Rust WebAssembly (via wasm-bindgen)
