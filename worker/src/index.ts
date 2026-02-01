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

export default {
	async fetch(request, env, ctx): Promise<Response> {
const url = new URL(request.url);
    const gameId = url.pathname.split("/").pop()?.toUpperCase();

    if (!gameId || gameId.length !== 4) {
      return new Response("Invalid gameId", { status: 400 });
    }


    for (const region of REGIONS) {
      const target = `https://art.gametdb.com/ds/cover/${region}/${gameId}.jpg`;
      const res = await fetch(target);

      if (res.ok) {
        return new Response(res.body, {
          headers: {
            "Content-Type": "image/jpeg",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=604800"
          }
        });
      }
    }

    return new Response("Cover not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
