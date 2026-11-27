'use client';

/**
 * TabsHub — the one tab shell behind /my-store, /my-services, /activity and
 * /settings (MY-STORE-HUB-01, MY-SERVICES-HUB-01, ACTIVITY-HUB-01,
 * SETTINGS-HUB-01). Each hub used to carry its own copy of this component; they
 * now only supply their tab model (lib/*HubTabs.ts), tab metadata and bodies.
 *
 * Deliberate choices (unchanged from the per-hub versions):
 *  - Tab bodies may be loaded with next/dynamic; route-specific dynamic
 *    chunks must be included in the offline warming manifest.
 *  - Tab switching uses history.replaceState, NOT router.push: no RSC request,
 *    so it works with no network.
 *  - Next.js does not reliably re-render on history.replaceState, so a local
 *    `active` state is kept alongside useSearchParams() (the URL stays the
 *    source of truth for deep links / back-forward).
 *  - Links inside the panel that point at the hub path are handled in place
 *    (capture phase).
 *  - Switching tabs drops per-tab query params (page/status/q/section …).
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { TabsBar } from '@/components/shared/ui/TabsBar';

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
  /** Optional notification for hubs that gate ancillary queries by active tab. */
  onActiveChange?: (tab: T) => void;
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
  onActiveChange,
  panelFallback,
}: TabsHubProps<T>) {
  const sp = useSearchParams();
  const urlTab: T = resolveTab(sp.toString() ? `?${sp.toString()}` : '') ?? defaultTab;

  const [active, setActive] = useState<T>(urlTab);

  useEffect(() => {
    setActive(urlTab);
    onActiveChange?.(urlTab);
  }, [urlTab, onActiveChange]);

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
      onActiveChange?.(tab);
      window.scrollTo({ top: 0 });
    },
    [writeUrl, searchForTabSwitch, onActiveChange],
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
        const nextTab = resolveTab(url.search) ?? defaultTab;
        setActive(nextTab);
        onActiveChange?.(nextTab);
        window.scrollTo({ top: 0 });
      } catch {
        /* unparsable link — let the browser handle it */
      }
    },
    [writeUrl, hubPath, resolveTab, defaultTab, onActiveChange],
  );

  const body = renderTab(active);

  return (
    <section aria-label={sectionLabel} className="w-full text-start">
      <TabsBar
        value={active}
        onChange={select}
        options={tabs.map((tab) => {
          const { label, Icon } = meta[tab];
          return {
            value: tab,
            label,
            icon: <Icon className="h-4 w-4" aria-hidden="true" />,
            panelId: `${idPrefix}-panel-${tab}`,
          };
        })}
        ariaLabel={tabListLabel}
        variant="underline"
        idPrefix={idPrefix}
        listClassName="-mx-1 sticky top-16 z-30 mb-5 snap-x snap-mandatory border-border bg-background/95 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/85 [scrollbar-width:thin] sm:mb-6 lg:-mx-2 lg:px-2"
        itemClassName="snap-start px-3 py-2.5 text-sm-tight font-bold sm:px-3.5"
      />

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
