import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/wrapper';
import { supabase, mockQueryResult, mockStorageResult, setupMockReset } from '@/test/hook-test-helpers';
import { usePortraitUpload } from '@/hooks/usePortraitUpload';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));
vi.mock('@/lib/resize-image', () => ({
  resizeImage: vi.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' })),
}));

setupMockReset();

// Helper: a fake image File
function makeImageFile(name = 'portrait.png'): File {
  return new File(['img'], name, { type: 'image/png' });
}

const NEW_PATH =
  /^c1000000-0000-4000-8000-000000000001\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

describe('usePortraitUpload', () => {
  const characterId = 'c1000000-0000-4000-8000-000000000001';
  const publicUrl = 'https://example.com/c1000000-0000-4000-8000-000000000001/portrait.jpg';

  // Ensure the bucketRef spies are cleared between tests (setupMockReset handles storage.from,
  // but we also clear bucketRef methods directly here for safety).
  beforeEach(() => {
    vi.mocked(supabase.storage.from).mockClear();
  });

  describe('upload', () => {
    it('calls storage.upload with the correct path and upsert, then persists the storage path (private bucket)', async () => {
      mockStorageResult.error = null;
      mockStorageResult.publicUrl = publicUrl;
      // update mutation must succeed
      mockQueryResult.data = { id: characterId, portrait_url: publicUrl };

      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.upload(makeImageFile(), characterId);
      });

      const bucketRef = supabase.storage.from('character-portraits');
      expect(supabase.storage.from).toHaveBeenCalledWith('character-portraits');
      expect(bucketRef.upload).toHaveBeenCalledWith(
        expect.stringMatching(NEW_PATH),
        expect.any(Blob),
        expect.objectContaining({ contentType: 'image/jpeg', upsert: false })
      );
      expect(bucketRef.getPublicUrl).not.toHaveBeenCalled();
      // The update mutation destructures { id, ...updates } — id goes to .eq(), updates go to .update()
      expect(supabase.update).toHaveBeenCalledWith({ portrait_url: expect.stringMatching(NEW_PATH) });
      expect(supabase.eq).toHaveBeenCalledWith('id', characterId);
      expect(result.current.error).toBeNull();
    });

    it('sets error state and does NOT call update when storage upload fails', async () => {
      mockStorageResult.error = { message: 'Storage error' };

      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });

      await act(async () => {
        try {
          await result.current.upload(makeImageFile(), characterId);
        } catch {
          // expected
        }
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(supabase.update).not.toHaveBeenCalled();
    });

    it('removes the previous object of this character once the new one is saved, and never a foreign one', async () => {
      mockStorageResult.error = null;
      mockQueryResult.data = { id: characterId, portrait_url: 'x' };
      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });
      const bucketRef = supabase.storage.from('character-portraits');

      await act(async () => {
        await result.current.upload(makeImageFile(), characterId, `${characterId}/portrait.jpg`);
      });
      expect(bucketRef.remove).toHaveBeenCalledWith([`${characterId}/portrait.jpg`]);

      vi.mocked(bucketRef.remove).mockClear();
      await act(async () => {
        await result.current.upload(makeImageFile(), characterId, 'c2000000-0000-4000-8000-000000000002/portrait.jpg');
      });
      expect(bucketRef.remove).not.toHaveBeenCalled();
    });

    it('surfaces error and removes the new object when the DB update fails after a successful storage upload', async () => {
      mockStorageResult.error = null;
      mockStorageResult.publicUrl = publicUrl;
      mockQueryResult.error = { message: 'DB update failed' };

      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });

      const bucketRef = supabase.storage.from('character-portraits');

      await act(async () => {
        try {
          await result.current.upload(makeImageFile(), characterId);
        } catch {
          // expected — DB update throws, hook re-throws
        }
      });

      // Storage upload was called (storage succeeded)
      expect(bucketRef.upload).toHaveBeenCalled();
      // DB update was also called (distinguishes this from storage-failure case)
      expect(supabase.update).toHaveBeenCalledWith({ portrait_url: expect.stringMatching(NEW_PATH) });
      // Hook surfaces the error
      expect(result.current.error).toBeInstanceOf(Error);
      // The sheet does not point to the new object: it is removed again (best effort)
      expect(bucketRef.remove).toHaveBeenCalledWith([expect.stringMatching(NEW_PATH)]);
      // isUploading resets to false after failure
      expect(result.current.isUploading).toBe(false);
    });
  });

  describe('remove', () => {
    it('calls storage.remove with the correct path and sets portrait_url to null', async () => {
      mockStorageResult.error = null;
      mockQueryResult.data = { id: characterId, portrait_url: null };

      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.remove(characterId, `${characterId}/portrait.jpg`);
      });

      await waitFor(() => expect(result.current.isRemoving).toBe(false));

      const bucketRef = supabase.storage.from('character-portraits');
      expect(bucketRef.remove).toHaveBeenCalledWith([`${characterId}/portrait.jpg`]);
      expect(supabase.update).toHaveBeenCalledWith({ portrait_url: null });
      expect(supabase.eq).toHaveBeenCalledWith('id', characterId);
    });

    it('removes the object of a legacy public URL by its storage path', async () => {
      mockStorageResult.error = null;
      mockQueryResult.data = { id: characterId, portrait_url: null };

      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.remove(
          characterId,
          'http://127.0.0.1:54321/storage/v1/object/public/character-portraits/c1000000-0000-4000-8000-000000000001/portrait.jpg'
        );
      });

      const bucketRef = supabase.storage.from('character-portraits');
      expect(bucketRef.remove).toHaveBeenCalledWith(['c1000000-0000-4000-8000-000000000001/portrait.jpg']);
    });

    it('returns early without calling anything when currentPortraitUrl is null', async () => {
      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.remove(characterId, null);
      });

      const bucketRef = supabase.storage.from('character-portraits');
      expect(bucketRef.remove).not.toHaveBeenCalled();
      expect(supabase.update).not.toHaveBeenCalled();
    });

    it('still nulls portrait_url in the DB when storage.remove fails', async () => {
      mockStorageResult.error = { message: 'remove failed' };
      mockQueryResult.data = { id: characterId, portrait_url: null };

      const { result } = renderHook(() => usePortraitUpload(), { wrapper: createWrapper() });

      await act(async () => {
        // Should NOT reject — storage errors are swallowed, DB update still proceeds
        await result.current.remove(characterId, `${characterId}/portrait.jpg`);
      });

      // DB update is still called with portrait_url: null despite storage failure
      expect(supabase.update).toHaveBeenCalledWith({ portrait_url: null });
      expect(supabase.eq).toHaveBeenCalledWith('id', characterId);
    });
  });
});
