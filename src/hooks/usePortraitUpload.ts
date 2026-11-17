import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { resizeImage } from '@/lib/resize-image';
import { useCharacterMutations } from '@/hooks/useCharacters';
import { getLogger } from '@/lib/logger';
import { PORTRAIT_BUCKET, newPortraitPath, ownPortraitPath } from '@/lib/portrait-path';
import { portraitQueryKey } from '@/hooks/usePortraitSrc';
import { useQueryClient } from '@tanstack/react-query';

const logger = getLogger('portrait');

const BUCKET = PORTRAIT_BUCKET;

export interface UsePortraitUploadResult {
  /** `previousStored`: the value currently stored, its object is removed once the new one is saved. */
  upload: (file: File, characterId: string, previousStored?: string | null) => Promise<void>;
  remove: (characterId: string, currentPortraitUrl: string | null) => Promise<void>;
  isUploading: boolean;
  isRemoving: boolean;
  error: Error | null;
}

export function usePortraitUpload(): UsePortraitUploadResult {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const { update } = useCharacterMutations();
  const queryClient = useQueryClient();

  const upload = async (file: File, characterId: string, previousStored?: string | null): Promise<void> => {
    setIsUploading(true);
    setError(null);
    try {
      const blob = await resizeImage(file, 512);
      const path = newPortraitPath(characterId);

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

      if (storageError) throw storageError;

      // The bucket is private: the database keeps the path, the browser asks for signed URLs.
      try {
        await update.mutateAsync({ id: characterId, portrait_url: path });
      } catch (saveError) {
        // The sheet does not point to the new object: do not leave it behind (best effort).
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
        if (cleanupError) logger.warn('Failed to remove an unused portrait:', cleanupError);
        throw saveError;
      }

      // The previous object is no longer referenced: remove it (best effort, only an object of this character).
      const previous = ownPortraitPath(characterId, previousStored);
      if (previous && previous !== path) {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove([previous]);
        if (removeError) logger.warn('Failed to remove the previous portrait:', removeError);
        await queryClient.invalidateQueries({ queryKey: portraitQueryKey(previous) });
      }
      await queryClient.invalidateQueries({ queryKey: portraitQueryKey(path) });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const remove = async (characterId: string, currentPortraitUrl: string | null): Promise<void> => {
    if (!currentPortraitUrl) return;

    setIsRemoving(true);
    setError(null);
    try {
      // Only an object of this character, whatever the stored value says (a path of another character must never
      // make us delete someone else's portrait; the database refuses such a value as well).
      const path = ownPortraitPath(characterId, currentPortraitUrl);
      // The sheet stops pointing to the object FIRST: if this fails, nothing was deleted and the sheet stays valid.
      await update.mutateAsync({ id: characterId, portrait_url: null });
      if (path) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
        if (storageError) logger.warn('Failed to remove portrait from storage:', storageError);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsRemoving(false);
    }
  };

  return { upload, remove, isUploading, isRemoving, error };
}
