import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PORTRAIT_BUCKET, portraitStoragePath } from '@/lib/portrait-path';

const SIGNED_URL_SECONDS = 3600;

export const portraitQueryKey = (path: string | null) => ['portrait-src', path] as const;

/** A short-lived signed URL for a stored portrait (the bucket is private). Null while loading or if none. */
export function usePortraitSrc(stored: string | null | undefined): string | null {
  const path = portraitStoragePath(stored);
  const { data } = useQuery({
    queryKey: portraitQueryKey(path),
    enabled: !!path,
    // Refresh well before the URL expires.
    staleTime: (SIGNED_URL_SECONDS - 600) * 1000,
    queryFn: async () => {
      const { data: signed, error } = await supabase.storage
        .from(PORTRAIT_BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_SECONDS);
      if (error) throw error;
      return signed.signedUrl;
    },
  });
  return path ? (data ?? null) : null;
}
