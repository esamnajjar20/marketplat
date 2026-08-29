/**
 * DESKTOP-AUDIT-03: no app-level keyboard shortcuts existed anywhere —
 * every onKeyDown in the codebase was a local "Enter submits this one
 * field" handler (search filters, admin table search boxes, message
 * input), not a real shortcut a desktop/keyboard-heavy user (an admin
 * running this panel all day, in particular) could rely on globally.
 *
 * Ctrl+K / Cmd+K, mirroring the convention from Slack/Linear/GitHub/
 * Discord/VS Code's own command palette:
 *   - Not already on /search → navigate there with ?focus=1, which
 *     SearchBox reads once to focus its input then strips from the URL.
 *   - Already on /search → just refocus the existing input in place;
 *     a full navigation here would reset whatever query/filters the
 *     user already has active for no reason.
 *
 * Deliberately does NOT suppress the browser's own Ctrl+K/Cmd+K when
 * the focused element is a text input, textarea, or contentEditable
 * region — overriding a shortcut while someone is mid-sentence in the
 * message composer or an admin table's search box would fight the
 * platform's own address-bar-focus shortcut (Ctrl+K in Chrome/Firefox)
 * for a feature that isn't more urgent than what they're already
 * typing into.
 *
 * Mounted once in AppProviders, same posture as PresenceHeartbeat/
 * PageViewTracker — no props, no visible output.
 */
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function GlobalSearchShortcut() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      if (isTypingTarget(e.target)) return;

      e.preventDefault();

      if (pathname === ROUTES.search) {
        document.getElementById('global-search-input')?.focus();
        return;
      }
      router.push(`${ROUTES.search}?focus=1`);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, router]);

  return null;
}
