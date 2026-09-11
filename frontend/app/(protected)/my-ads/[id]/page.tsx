'use client';

/**
 * /my-ads/[id] — legacy alias, kept only as a redirect.
 *
 * FIX (audit #12): before REORG-03 this file *was* the canonical "edit
 * my ad" page. REORG-03 moved the canonical implementation to
 * /my-ads/[id]/edit/page.tsx (see that file's own comment) and updated
 * ROUTES.adEdit to point there, but this old file was never deleted or
 * turned into a redirect — it kept working as a second, fully live,
 * stale implementation (old max-w-2xl layout, no EditPageHeader) with
 * no in-app links pointing at it, reachable only via an old bookmark or
 * shared URL from before the rename. Converted to the same
 * redirect-only pattern already used for the other retired edit route
 * (/ads/[id]/edit/page.tsx), so old links keep working instead of
 * silently serving a stale form.
 */
import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

export default function LegacyMyAdIdRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.adEdit(id));
  }, [id, router]);

  return null;
}
