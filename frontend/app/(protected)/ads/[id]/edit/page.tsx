'use client';

/**
 * /ads/[id]/edit — legacy alias, kept only as a redirect.
 *
 * AUDIT-FIX (protected — file organization): this route and
 * /my-ads/[id] were two independent implementations of the exact same
 * "edit my ad" page (identical isOwner logic, identical loading/404/
 * redirect sequence — see protected-audit issue #7). No redirect
 * existed between them and nothing in the app ever documented which one
 * was canonical, despite both working. /my-ads/[id] is now the single
 * canonical implementation (grouped with the rest of the my-ads/*
 * tree); this route stays live only so old bookmarks/shared links to
 * /ads/:id/edit keep working, and immediately forwards to the
 * canonical path via ROUTES.adEdit — now defined as `/my-ads/${id}`
 * rather than `/ads/${id}/edit` — so every in-app link (e.g.
 * MyAdsList's edit button) already points at the canonical route
 * without further changes.
 *
 * middleware.ts's PROTECTED_AD_EDIT_RE still matches this path, so an
 * unauthenticated visit is bounced to /login before ever reaching this
 * redirect — same protection /my-ads/[id] gets via the '/my-ads'
 * prefix entry.
 */
import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

export default function LegacyEditAdRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.adEdit(id));
  }, [id, router]);

  return null;
}
