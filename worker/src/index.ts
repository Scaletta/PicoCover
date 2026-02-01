/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const REGIONS = ["EN", "US", "EU", "JP"];
const CACHE_TTL = 604800; // 7 days in seconds

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const gameId = url.pathname.split("/").pop()?.toUpperCase();

		if (!gameId || gameId.length !== 4) {
			return new Response("Invalid gameId", { status: 400 });
		}

		// Try KV cache first
		if (env.IMAGE_CACHE) {
			const cached = await env.IMAGE_CACHE.get(gameId, "arrayBuffer");
			if (cached) {
        console.log(`Cache hit for ${gameId}`);
				return new Response(cached, {
					headers: {
						"Content-Type": "image/jpeg",
						"Access-Control-Allow-Origin": "*",
						"Cache-Control": `public, max-age=${CACHE_TTL}`,
						"X-Cache": "HIT"
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
						"Access-Control-Allow-Origin": "*",
						"Cache-Control": `public, max-age=${CACHE_TTL}`,
						"X-Cache": "MISS"
					}
				});
			}
		}

		return new Response("Cover not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
