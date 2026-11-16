import { usePortraitSrc } from '@/hooks/usePortraitSrc';

interface PortraitImageProps {
  /** The stored portrait value (storage path, or a legacy public URL). */
  stored: string;
  alt: string;
  className?: string;
}

/** A portrait from the private bucket: shows nothing until its signed URL is ready. */
export function PortraitImage({ stored, alt, className }: PortraitImageProps) {
  const src = usePortraitSrc(stored);
  if (!src) return <span className={className} aria-hidden="true" />;
  return <img src={src} alt={alt} className={className} />;
}
