import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const IMAGE_TTL = 2628000;

function mockImageFetchOk() {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(new Uint8Array([1, 2, 3]), {
			status: 200,
			headers: { 'Content-Type': 'image/jpeg' },
		})
	);
}

function mockImageFetchNotFound() {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));
}

describe('PicoCover Proxy Worker', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns 400 for invalid platform route', async () => {
		const request = new IncomingRequest('http://example.com/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const body = JSON.parse(await response.text());
		expect(body.error).toContain('Invalid platform');
	});

	it('returns 400 when gameId is missing', async () => {
		const request = new IncomingRequest('http://example.com/nds/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const body = JSON.parse(await response.text());
		expect(body.error).toContain('gameId is required');
	});

	it('returns 200 for valid NDS gameId when upstream cover exists', async () => {
		mockImageFetchOk();
		const request = new IncomingRequest('http://example.com/nds/CEYE');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
	});

	it('sets correct Content-Type for image responses', async () => {
		mockImageFetchOk();
		const request = new IncomingRequest('http://example.com/nds/CEYE');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
	});

	it('returns 400 for gameId with wrong length', async () => {
		const request = new IncomingRequest('http://example.com/nds/AB');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const body = JSON.parse(await response.text());
		expect(body.error).toContain('Invalid gameId');
	});

	it('returns 404 when cover not found in any region', async () => {
		mockImageFetchNotFound();
		const request = new IncomingRequest('http://example.com/nds/XXXX');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		const body = JSON.parse(await response.text());
		expect(body.error).toContain('Cover not found');
		expect(body.gameId).toBe('XXXX');
	});

	it('extracts and uppercases gameId from path', async () => {
		mockImageFetchNotFound();
		const request = new IncomingRequest('http://example.com/nds/drea');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		const body = JSON.parse(await response.text());
		expect(body.gameId).toBe('DREA');
		expect(globalThis.fetch).toHaveBeenCalled();
		expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain('/DREA.jpg');
	});

	it('sets CORS headers on all responses', async () => {
		mockImageFetchOk();
		const request = new IncomingRequest('http://example.com/nds/CQZE');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');
		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
	});

	it('sets Cache-Control header on all responses', async () => {
		mockImageFetchOk();
		const request = new IncomingRequest('http://example.com/nds/TEST');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const cacheControl = response.headers.get('Cache-Control');
		expect(cacheControl).toBeTruthy();
		expect(cacheControl).toContain(`max-age=${IMAGE_TTL}`);
	});

	it('returns X-Cache: MISS on first request for a gameId', async () => {
		mockImageFetchOk();
		await env.IMAGE_CACHE.delete('nds:MISS');
		const request = new IncomingRequest('http://example.com/nds/MISS');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('X-Cache')).toBe('MISS');
	});

	it('returns X-Cache: HIT on subsequent request for the same gameId', async () => {
		mockImageFetchOk();
		const gameId = 'HITT';
		await env.IMAGE_CACHE.delete(`nds:${gameId}`);
		
		// First request - should be MISS
		const request1 = new IncomingRequest(`http://example.com/nds/${gameId}`);
		const ctx1 = createExecutionContext();
		const response1 = await worker.fetch(request1, env, ctx1);
		await waitOnExecutionContext(ctx1);
		expect(response1.headers.get('X-Cache')).toBe('MISS');

		// Second request - should be HIT (from cache)
		const request2 = new IncomingRequest(`http://example.com/nds/${gameId}`);
		const ctx2 = createExecutionContext();
		const response2 = await worker.fetch(request2, env, ctx2);
		await waitOnExecutionContext(ctx2);
		expect(response2.headers.get('X-Cache')).toBe('HIT');
	});

	it('returns stats from the analytics KV', async () => {
		await env.ANALYTICS.put('stats:downloads:total', '12');
		await env.ANALYTICS.put('stats:users:total', '3');

		const request = new IncomingRequest('http://example.com/stats');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = JSON.parse(await response.text());
		expect(body.downloadsTotal).toBe(12);
		expect(body.uniqueUsers).toBe(3);
	});

	it('protects stats endpoint when STATS_TOKEN is set', async () => {
		(env as unknown as { STATS_TOKEN?: string }).STATS_TOKEN = 'secret-token';
		try {
			const request = new IncomingRequest('http://example.com/stats');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(401);
		} finally {
			delete (env as unknown as { STATS_TOKEN?: string }).STATS_TOKEN;
		}

		const requestWithToken = new IncomingRequest('http://example.com/stats?token=secret-token');
		const ctx2 = createExecutionContext();
		const response2 = await worker.fetch(requestWithToken, env, ctx2);
		await waitOnExecutionContext(ctx2);
		expect(response2.status).toBe(200);
	});
});
