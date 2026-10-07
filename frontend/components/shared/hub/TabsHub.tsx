'use client';

/**
 * TabsHub — the one tab shell behind /my-store, /my-services, /activity and
 * /settings (MY-STORE-HUB-01, MY-SERVICES-HUB-01, ACTIVITY-HUB-01,
 * SETTINGS-HUB-01). Each hub used to carry its own copy of this component; they
 * now only supply their tab model (lib/*HubTabs.ts), tab metadata and bodies.
 *
 * Deliberate choices (unchanged from the per-hub versions):
 *  - Tab bodies are STATICALLY imported by the caller, never next/dynamic: the
 *    warming engine caches only the chunks referenced by the route's HTML.
 *  - Tab switching uses history.replaceState, NOT router.push: no RSC request,
 *    so it works with no network.
 *  - Next.js does not reliably re-render on history.replaceState, so a local
 *    `active` state is kept alongside useSearchParams() (the URL stays the
 *    source of truth for deep links / back-forward).
 *  - Links inside the panel that point at the hub path are handled in place
 *    (capture phase).
 *  - Switching tabs drops per-tab query params (page/status/q/section …).
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface HubTabMeta {
  label: string;
  Icon: LucideIcon;
}

export interface TabsHubProps<T extends string> {
  /** DOM id prefix, e.g. 'my-store' → `my-store-tab-products` / `my-store-panel-products`. */
  idPrefix: string;
  sectionLabel: string;
  tabListLabel: string;
  hubPath: string;
  tabs: readonly T[];
  defaultTab: T;
  meta: Record<T, HubTabMeta>;
  resolveTab: (search: string) => T | null;
  searchForTabSwitch: (tab: T) => string;
  renderTab: (tab: T) => ReactNode;
  /** When set, the panel body is wrapped in <Suspense fallback={…}>. */
  panelFallback?: ReactNode;
}

export function TabsHub<T extends string>({
  idPrefix,
  sectionLabel,
  tabListLabel,
  hubPath,
  tabs,
  defaultTab,
  meta,
  resolveTab,
  searchForTabSwitch,
  renderTab,
  panelFallback,
}: TabsHubProps<T>) {
  const sp = useSearchParams();
  const urlTab: T = resolveTab(sp.toString() ? `?${sp.toString()}` : '') ?? defaultTab;

  const [active, setActive] = useState<T>(urlTab);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setActive(urlTab);
  }, [urlTab]);

  const writeUrl = useCallback(
    (search: string) => {
      try {
        window.history.replaceState(window.history.state, '', `${hubPath}${search}`);
      } catch {
        /* non-fatal */
      }
    },
    [hubPath],
  );

  const select = useCallback(
    (tab: T) => {
      writeUrl(searchForTabSwitch(tab));
      setActive(tab);
      window.scrollTo({ top: 0 });
    },
    [writeUrl, searchForTabSwitch],
  );

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, current: T) => {
      const index = tabs.indexOf(current);
      if (index < 0) return;
      let nextIndex = index;
      if (event.key === 'ArrowLeft') nextIndex = index === 0 ? tabs.length - 1 : index - 1;
      else if (event.key === 'ArrowRight') nextIndex = index === tabs.length - 1 ? 0 : index + 1;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else return;

      event.preventDefault();
      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      select(nextTab);
      requestAnimationFrame(() => tabRefs.current[nextTab]?.focus());
    },
    [select, tabs],
  );

  const onPanelClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as HTMLElement).closest?.('a');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      try {
        const url = new URL(a.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname.replace(/\/+$/, '') !== hubPath) return;
        e.preventDefault();
        e.stopPropagation();
        writeUrl(url.search);
        setActive(resolveTab(url.search) ?? defaultTab);
        window.scrollTo({ top: 0 });
      } catch {
        /* unparsable link — let the browser handle it */
      }
    },
    [writeUrl, hubPath, resolveTab, defaultTab],
  );

  const body = renderTab(active);

  return (
    <section aria-label={sectionLabel} className="w-full text-start">
      <div
        role="tablist"
        aria-label={tabListLabel}
        className="sticky top-16 z-30 -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border/70 bg-background/95 px-1 py-2 shadow-xs backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:-mx-2 lg:px-2"
      >
        {tabs.map((tab) => {
          const { label, Icon } = meta[tab];
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab}`}
              ref={(node) => { tabRefs.current[tab] = node; }}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab)}
              onKeyDown={(event) => onTabKeyDown(event, tab)}
              className={cn(
                'flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-h-11 lg:px-3.5',
                selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-xs ring-1 ring-primary/10'
                  : 'border-border/80 bg-card/50 text-muted-foreground hover:border-primary/30 hover:bg-primary-soft/50 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden={true} />
              {label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${active}`}
        aria-labelledby={`${idPrefix}-tab-${active}`}
        onClickCapture={onPanelClickCapture}
      >
        {panelFallback !== undefined ? <Suspense fallback={panelFallback}>{body}</Suspense> : body}
      </div>
    </section>
  );
}
