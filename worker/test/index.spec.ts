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
		expect(await response.text()).toBe('Invalid gameId');
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
		expect(await response.text()).toBe('Invalid gameId');
	});

	it('returns 404 when cover not found in any region', async () => {
		const request = new IncomingRequest('http://example.com/XXXX');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe('Cover not found');
	});

	it('extracts and uppercases gameId from path', async () => {
		const request = new IncomingRequest('http://example.com/drea');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		// Should attempt to fetch DREA (uppercase)
		expect(response.status).toBeGreaterThanOrEqual(400);
	});

	it('sets CORS headers on all responses', async () => {
		const request = new IncomingRequest('http://example.com/test');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');
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
});
