import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApiError, createPlayer } from './admin-api';

const input = { pseudo: 'aragorn', campaignId: '44444444-4444-4444-8444-444444444444' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPlayer', () => {
  it('posts to /admin-api/accounts with the bearer token and returns the created player', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ userId: 'u1', pseudo: 'aragorn', temporaryPassword: 'abcdefghijklmnop' }), {
        status: 201,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPlayer('tok', input)).resolves.toMatchObject({
      userId: 'u1',
      temporaryPassword: 'abcdefghijklmnop',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/admin-api/accounts');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('turns an error answer into an AdminApiError carrying the service code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'pseudo_taken' }), { status: 409 }))
    );
    await expect(createPlayer('tok', input)).rejects.toMatchObject({ status: 409, code: 'pseudo_taken' });
  });

  it('survives an answer that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })));
    await expect(createPlayer('tok', input)).rejects.toMatchObject({ status: 502, code: 'unknown' });
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await createPlayer('tok', input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ status: 0, code: 'network' });
  });
});
