# PicoCover Worker

Cloudflare Worker that proxies Nintendo DS cover images from GameTDB, adds CORS headers, and caches images in KV for 7 days.

## Endpoints
- `/{GAME_ID}` (4-letter game code). Example: `/DREA`

## Features
- CORS enabled for browser usage
- KV cache with 7-day TTL
- `X-Cache: HIT|MISS` response header
- JSON error responses on invalid or missing IDs and not found

## Development
- `npm run dev` (http://localhost:8787)

## Deployment
- `npm run deploy`

## KV Setup
Bind a KV namespace as `IMAGE_CACHE` in wrangler.jsonc. Use `wrangler kv:namespace create IMAGE_CACHE` to create IDs, then set `id`.
