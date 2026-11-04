'use client';

import { useEffect, useState } from 'react';

type OwnedObjectUrl = {
  blob: Blob;
  url: string;
};

/**
 * Owns a Blob URL for the lifetime of the committed effect only.
 * Creating the URL in an effect (rather than render/useMemo) keeps React's
 * render phase pure and guarantees revocation when the Blob changes/unmounts.
 * The Blob identity check prevents rendering a revoked URL for one frame while
 * an effect for a replacement Blob is waiting to run.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [ownedUrl, setOwnedUrl] = useState<OwnedObjectUrl | null>(null);

  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') {
      setOwnedUrl(null);
      return;
    }

    let nextUrl: string;
    try {
      nextUrl = URL.createObjectURL(blob);
    } catch {
      setOwnedUrl(null);
      return;
    }

    setOwnedUrl({ blob, url: nextUrl });
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [blob]);

  return ownedUrl?.blob === blob ? ownedUrl.url : null;
}
