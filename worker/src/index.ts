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

const REGIONS = ["EN", "US", "EU", "JA"];
const CACHE_TTL = 604800; // 7 days in seconds
const ANALYTICS_TTL = 2592000; // 30 days in seconds (unique user retention)

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

		if (url.pathname === "/stats") {
			return handleStats(request, env);
		}

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
				trackDownload(request, env, ctx);
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

				trackDownload(request, env, ctx);
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

async function handleStats(request: Request, env: Env): Promise<Response> {
	if (!env.ANALYTICS) {
		return new Response(JSON.stringify({ error: "Analytics not configured" }), { status: 501, headers: jsonHeaders });
	}

	const url = new URL(request.url);
	const token = url.searchParams.get("token") || request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
	if (env.STATS_TOKEN && token !== env.STATS_TOKEN) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
	}

	const downloadsTotal = parseInt((await env.ANALYTICS.get("stats:downloads:total")) || "0", 10);
	const uniqueUsers = parseInt((await env.ANALYTICS.get("stats:users:total")) || "0", 10);

	return new Response(
		JSON.stringify({ downloadsTotal, uniqueUsers }),
		{ status: 200, headers: jsonHeaders }
	);
}

function trackDownload(request: Request, env: Env, ctx: ExecutionContext) {
	if (!env.ANALYTICS) return;

	ctx.waitUntil((async () => {
		await incrementCounter(env.ANALYTICS, "stats:downloads:total");

		const userKey = await getUserKey(request);
		if (!userKey) return;

		const uniqueKey = `stats:users:unique:${userKey}`;
		const existing = await env.ANALYTICS.get(uniqueKey);
		if (!existing) {
			await env.ANALYTICS.put(uniqueKey, "1", { expirationTtl: ANALYTICS_TTL });
			await incrementCounter(env.ANALYTICS, "stats:users:total");
		}
	})());
}

async function incrementCounter(kv: KVNamespace, key: string) {
	const current = parseInt((await kv.get(key)) || "0", 10);
	await kv.put(key, String(current + 1));
}

async function getUserKey(request: Request): Promise<string | null> {
	const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
	const ua = request.headers.get("User-Agent") || "";
	if (!ip && !ua) return null;

	const data = new TextEncoder().encode(`${ip}|${ua}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
