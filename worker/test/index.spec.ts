import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('PicoCover Proxy Worker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 for invalid gameId', async () => {
		const request = new IncomingRequest('http://example.com/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const body = JSON.parse(await response.text());
		expect(body.error).toContain('gameId is required');
	});

	it('returns 200 for valid gameId', async () => {
		const request = new IncomingRequest('http://example.com/CEYE');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
	});

	it('sets correct Content-Type for image responses', async () => {
		// For actual image responses, Content-Type should be image/jpeg
		// This test documents the expected behavior for successful fetches
		const request = new IncomingRequest('http://example.com/CEYE');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
	});

	it('returns 400 for gameId with wrong length', async () => {
		const request = new IncomingRequest('http://example.com/AB');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const body = JSON.parse(await response.text());
		expect(body.error).toContain('Invalid gameId');
	});

	it('returns 404 when cover not found in any region', async () => {
		const request = new IncomingRequest('http://example.com/XXXX');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		const body = JSON.parse(await response.text());
		expect(body.error).toContain('Cover not found');
		expect(body.gameId).toBe('XXXX');
	});

	it('extracts and uppercases gameId from path', async () => {
		const request = new IncomingRequest('http://example.com/drea');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		// Should attempt to fetch DREA (uppercase)
		expect(response.status).toBe(404);
		const body = JSON.parse(await response.text());
		expect(body.gameId).toBe('DREA');
	});

	it('sets CORS headers on all responses', async () => {
		const request = new IncomingRequest('http://example.com/CQZE');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');
		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
	});

	it('sets Cache-Control header on all responses', async () => {
		const request = new IncomingRequest('http://example.com/test');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const cacheControl = response.headers.get('Cache-Control');
		expect(cacheControl).toBeTruthy();
		expect(cacheControl).toContain('max-age=604800');
	});

	it('returns X-Cache: MISS on first request for a gameId', async () => {
		const request = new IncomingRequest('http://example.com/CQZE');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('X-Cache')).toBe('MISS');
	});

	it('returns X-Cache: HIT on subsequent request for the same gameId', async () => {
		const gameId = 'CQZE';
		
		// First request - should be MISS
		const request1 = new IncomingRequest(`http://example.com/${gameId}`);
		const ctx1 = createExecutionContext();
		const response1 = await worker.fetch(request1, env, ctx1);
		await waitOnExecutionContext(ctx1);
		expect(response1.headers.get('X-Cache')).toBe('MISS');

		// Second request - should be HIT (from cache)
		const request2 = new IncomingRequest(`http://example.com/${gameId}`);
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
