/**
 * PicoCover Proxy Worker
 *
 * Cloudflare Worker that proxies image requests for Nintendo DS and Game Boy Advance game covers.
 * - Fetches NDS covers from GameTDB API (supports EN, US, EU, JP regions)
 * - Fetches GBA covers from Cloudflare R2 (supports EN, US, EU, JP regions)
 * - Provides CORS headers for browser access from any origin
 * - Caches images in KV storage for 7 days
 * - Returns X-Cache header indicating HIT/MISS
 *
 * Routes:
 * - GET /nds/{gameid} - Fetch Nintendo DS cover from GameTDB API
 * - GET /gba/{gameid} - Fetch Game Boy Advance cover from Cloudflare R2
 * - GET /stats - Get analytics stats
 *
 * Deploy: npm run deploy
 * Dev: npm run dev (runs on http://localhost:8787/)
 * Learn more at https://developers.cloudflare.com/workers/
 * @author Scaletta
 */

const REGIONS = ["EN", "US", "EU", "JA"];
const CACHE_TTL = 2628000; // 30 days in seconds
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

		// Parse route: /nds/{gameid} or /gba/{gameid}
		const pathParts = url.pathname.split("/").filter(p => p.length > 0);
		const platform = pathParts[0]?.toLowerCase();
		const gameId = pathParts[1]?.toUpperCase();

		// Validate platform
		if (!platform || !["nds", "gba"].includes(platform)) {
			return new Response(
				JSON.stringify({ error: "Invalid platform. Must be /nds/{gameid} or /gba/{gameid}" }),
				{ status: 400, headers: jsonHeaders }
			);
		}

		if (!gameId) {
			return new Response(JSON.stringify({ error: "gameId is required" }), { status: 400, headers: jsonHeaders });
		}

		if (gameId.length !== 4) {
			return new Response(JSON.stringify({ error: "Invalid gameId. Must be exactly 4 characters." }), { status: 400, headers: jsonHeaders });
		}

		// Create cache key with platform prefix
		const cacheKey = `${platform}:${gameId}`;

		// Try KV cache first
		if (env.IMAGE_CACHE) {
			const cached = await env.IMAGE_CACHE.get(cacheKey, "arrayBuffer");
			if (cached) {
				console.log(`Cache hit for ${cacheKey}`);
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

		// Fetch based on platform: NDS from GameTDB, GBA from R2 bucket (with ScreenScraper fallback)
		let result: ArrayBuffer | null = null;
		
		if (platform === "nds") {
			result = await fetchCoverFromGameTdb(gameId, platform);
		} else if (platform === "gba") {
			// Try R2 bucket first
			if (env.GBA_COVERS) {
				try {
					// Try multiple extensions since covers might be .png or .jpg
					const extensions = ['.png', '.jpg', '.jpeg'];
					for (const ext of extensions) {
						// Try both with and without gba/ prefix
						const paths = [`${gameId}${ext}`, `gba/${gameId}${ext}`];
						for (const path of paths) {
							const r2Object = await env.GBA_COVERS.get(path);
							if (r2Object) {
								console.log(`R2 hit for ${path}`);
								const buffer = await r2Object.arrayBuffer();
								trackDownload(request, env, ctx);
								return new Response(buffer, {
									headers: {
										"Content-Type": `image/${ext === '.png' ? 'png' : 'jpeg'}`,
										"Cache-Control": `public, max-age=${CACHE_TTL}`,
										"X-Cache": "R2",
										...corsHeaders
									}
								});
							}
						}
					}
				} catch (error) {
					console.error(`R2 lookup failed for ${gameId}:`, error);
				}
			}
			//TODO: Fall back to ScreenScraper
			//result = await fetchCoverFromScreenScraper(gameId, platform, env);
		}

		if (result) {
			// Store in KV cache
			if (env.IMAGE_CACHE) {
				ctx.waitUntil(env.IMAGE_CACHE.put(cacheKey, result, { expirationTtl: CACHE_TTL }));
			}

			trackDownload(request, env, ctx);
			return new Response(result, {
				headers: {
					"Content-Type": "image/jpeg",
					"Cache-Control": `public, max-age=${CACHE_TTL}`,
					"X-Cache": "MISS",
					...corsHeaders
				}
			});
		}

		return new Response(
			JSON.stringify({ error: `Cover not found for ${platform.toUpperCase()} game`, gameId, platform }),
			{ status: 404, headers: jsonHeaders }
		);
	},
} satisfies ExportedHandler<Env>;

/* TODO: Re-enable ScreenScraper fallback for GBA covers. If i ever receive approval to use their API again...

async function fetchCoverFromScreenScraper(gameId: string, platform: string, env: Env): Promise<ArrayBuffer | null> {
	const devid = env.SCREENSCRAPER_DEVID || "";
	const devpassword = env.SCREENSCRAPER_DEVPASS || "";
	const softwarename = "PicoCover";
	
	if (!devid || !devpassword) {
		console.error("ScreenScraper credentials not configured");
		return null;
	}

	// System IDs: NDS = 15, GBA = 12
	const systemeid = platform === "nds" ? "15" : "12";

	const apiUrl = new URL("https://www.screenscraper.fr/api2/jeuInfos.php");
	apiUrl.searchParams.set("devid", devid);
	apiUrl.searchParams.set("devpassword", devpassword);
	apiUrl.searchParams.set("softwarename", softwarename);
	apiUrl.searchParams.set("output", "json");
	apiUrl.searchParams.set("romtype", "rom");
	apiUrl.searchParams.set("systemeid", systemeid);
	apiUrl.searchParams.set("romnom", gameId);

	try {
		const response = await fetch(apiUrl.toString());
		
		if (!response.ok) {
			console.error(`ScreenScraper API error: ${response.status}`);
			return null;
		}

		const data = await response.json() as any;
		
		// Check for API errors
		if (data.response?.error) {
			console.error(`ScreenScraper error: ${data.response.error}`);
			return null;
		}

		// Get box-2D (front cover) media
		const medias = data.response?.jeu?.medias;
		if (!medias || !Array.isArray(medias)) {
			return null;
		}

		// Find box-2D (front cover) with highest resolution
		const boxCover = medias
			.filter((m: any) => m.type === "box-2D")
			.sort((a: any, b: any) => (b.resolution || 0) - (a.resolution || 0))[0];

		if (!boxCover?.url) {
			return null;
		}

		// Fetch the actual image
		const imageResponse = await fetch(boxCover.url);
		if (imageResponse.ok) {
			return await imageResponse.arrayBuffer();
		}
	} catch (error) {
		console.error(`ScreenScraper fetch error: ${error}`);
	}

	return null;
} 
	*/

async function fetchCoverFromGameTdb(gameId: string, platform: string): Promise<ArrayBuffer | null> {
	const platformPath = platform === "nds" ? "ds" : "gba";

	for (const region of REGIONS) {
		const target = `https://art.gametdb.com/${platformPath}/cover/${region}/${gameId}.jpg`;
		const res = await fetch(target);

		if (res.ok) {
			return await res.arrayBuffer();
		}
	}

	return null;
}

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
