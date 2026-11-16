import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortraitSrc } from './usePortraitSrc';

const storage = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { storage } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  storage.createSignedUrl.mockReset();
  storage.from.mockReset().mockReturnValue({ createSignedUrl: storage.createSignedUrl });
});

describe('usePortraitSrc', () => {
  it('asks nothing when there is no portrait', () => {
    const { result } = renderHook(() => usePortraitSrc(null), { wrapper });
    expect(result.current).toEqual({ src: null, isError: false });
    expect(storage.from).not.toHaveBeenCalled();
  });

  it('signs the storage path of the private bucket', async () => {
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x?token=t' }, error: null });
    const { result } = renderHook(() => usePortraitSrc('c1/portrait.jpg'), { wrapper });
    await waitFor(() => expect(result.current.src).toBe('https://signed/x?token=t'));
    expect(storage.from).toHaveBeenCalledWith('character-portraits');
    expect(storage.createSignedUrl).toHaveBeenCalledWith('c1/portrait.jpg', 3600);
  });

  it('turns a legacy public URL into its storage path before signing', async () => {
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/y' }, error: null });
    renderHook(
      () => usePortraitSrc('http://127.0.0.1:54321/storage/v1/object/public/character-portraits/c1/portrait.jpg?v=2'),
      { wrapper }
    );
    await waitFor(() => expect(storage.createSignedUrl).toHaveBeenCalledWith('c1/portrait.jpg', 3600));
  });

  it('reports an error (no image) when the signature is refused', async () => {
    storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    const { result } = renderHook(() => usePortraitSrc('c1/portrait.jpg'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.src).toBeNull();
  });
});
