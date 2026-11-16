import type * as React from 'react';
import { usePortraitSrc } from '@/hooks/usePortraitSrc';

interface PortraitImageProps {
  /** The stored portrait value (storage path, or a legacy public URL). */
  stored: string;
  alt: string;
  className?: string;
  /** Shown when the signed URL could not be obtained. */
  fallback?: React.ReactNode;
}

/** A portrait from the private bucket: shows nothing until its signed URL is ready. */
export function PortraitImage({ stored, alt, className, fallback }: PortraitImageProps) {
  const { src, isError } = usePortraitSrc(stored);
  if (!src) {
    // Loading: an empty circle. Failed (object missing, no access): the caller's fallback if any.
    if (isError && fallback) return <>{fallback}</>;
    return <span className={className} aria-hidden="true" />;
  }
  return <img src={src} alt={alt} className={className} />;
}
