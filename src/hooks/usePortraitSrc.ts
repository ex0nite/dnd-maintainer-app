import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PORTRAIT_BUCKET, portraitStoragePath } from '@/lib/portrait-path';

const SIGNED_URL_SECONDS = 3600;

export const portraitQueryKey = (path: string | null) => ['portrait-src', path] as const;

/** A short-lived signed URL for a stored portrait (the bucket is private). `src` is null while loading or if none. */
export function usePortraitSrc(stored: string | null | undefined): { src: string | null; isError: boolean } {
  const path = portraitStoragePath(stored);
  const { data, isError } = useQuery({
    queryKey: portraitQueryKey(path),
    enabled: !!path,
    // Refresh well before the URL expires, even for a component that stays mounted.
    staleTime: (SIGNED_URL_SECONDS - 600) * 1000,
    refetchInterval: (SIGNED_URL_SECONDS - 600) * 1000,
    retry: false,
    queryFn: async () => {
      const { data: signed, error } = await supabase.storage
        .from(PORTRAIT_BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_SECONDS);
      if (error) throw error;
      return signed.signedUrl;
    },
  });
  return { src: path ? (data ?? null) : null, isError };
}
