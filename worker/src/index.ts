/**
 * PicoCover Proxy Worker
 *
 * Cloudflare Worker that proxies image requests for Nintendo DS game covers.
 * - Fetches covers from GameTDB API (supports EN, US, EU, JP regions)
 * - Provides CORS headers for browser access from any origin
 * - Caches images in KV storage for 7 days
 * - Returns X-Cache header indicating HIT/MISS
 *
 * Deploy: npm run deploy
 * Dev: npm run dev (runs on http://localhost:8787/)
 * Learn more at https://developers.cloudflare.com/workers/
 * @author Scaletta
 */

const REGIONS = ["EN", "US", "EU", "JP"];
const CACHE_TTL = 604800; // 7 days in seconds

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

const defaultHeaders = {
	"Cache-Control": `public, max-age=${CACHE_TTL}`,
	...corsHeaders
};

const jsonHeaders = {
	"Content-Type": "application/json",
	...defaultHeaders
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const gameId = url.pathname.split("/").pop()?.toUpperCase();

		if (!gameId) {
			return new Response(JSON.stringify({ error: "gameId is required" }), { status: 400, headers: jsonHeaders });
		}

		if (!gameId || gameId.length !== 4) {
			return new Response(JSON.stringify({ error: "Invalid gameId. Must be exactly 4 characters." }), { status: 400, headers: jsonHeaders });
		}

		// Try KV cache first
		if (env.IMAGE_CACHE) {
			const cached = await env.IMAGE_CACHE.get(gameId, "arrayBuffer");
			if (cached) {
				console.log(`Cache hit for ${gameId}`);
				return new Response(cached, {
					headers: {
						"Content-Type": "image/jpeg",
						"Cache-Control": `public, max-age=${CACHE_TTL}`,
						"X-Cache": "HIT",
						...corsHeaders
					}
				});
			}
		}

		// Try to fetch from GameTDB
		for (const region of REGIONS) {
			const target = `https://art.gametdb.com/ds/cover/${region}/${gameId}.jpg`;
			const res = await fetch(target);

			if (res.ok) {
				const arrayBuffer = await res.arrayBuffer();

				// Store in KV cache
				if (env.IMAGE_CACHE) {
					ctx.waitUntil(env.IMAGE_CACHE.put(gameId, arrayBuffer, { expirationTtl: CACHE_TTL }));
				}

				return new Response(arrayBuffer, {
					headers: {
						"Content-Type": "image/jpeg",
						"Cache-Control": `public, max-age=${CACHE_TTL}`,
						"X-Cache": "MISS",
						...corsHeaders
					}
				});
			}
		}

		return new Response(JSON.stringify({ error: "Cover not found for gameId", gameId }), { status: 404, headers: jsonHeaders });
	},
} satisfies ExportedHandler<Env>;
