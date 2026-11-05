'use client';

/**
 * PERF: CreateSheet / ExploreSheet (+ the Radix Dialog they pull in) are only
 * visible after a tap, yet were statically imported by PublicHeader and
 * BottomNav, so they shipped in the first-load JS of every public route.
 *
 * These wrappers keep the exact same props, render nothing until the sheet is
 * opened for the first time, and then keep it mounted (so close animations and
 * focus restore behave as before). The chunk is also warmed during browser idle
 * time so the first tap is not delayed and it lands in the SW/HTTP cache for
 * offline use — without counting toward the initial render.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState, type ComponentProps } from 'react';
import type { CreateSheet as CreateSheetType } from '@/components/layout/CreateSheet';
import type { ExploreSheet as ExploreSheetType } from '@/components/layout/ExploreSheet';

const loadCreate = () => import('@/components/layout/CreateSheet').then((m) => m.CreateSheet);
const loadExplore = () => import('@/components/layout/ExploreSheet').then((m) => m.ExploreSheet);

const CreateSheetImpl = dynamic(loadCreate, { ssr: false, loading: () => null });
const ExploreSheetImpl = dynamic(loadExplore, { ssr: false, loading: () => null });

function useMountOnceOpened(open: boolean, preload: () => Promise<unknown>) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (open) setArmed(true);
  }, [open]);

  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => { void preload().catch(() => undefined); }, { timeout: 6000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => { void preload().catch(() => undefined); }, 4000);
    return () => window.clearTimeout(t);
  }, [preload]);

  return open || armed;
}

export function LazyCreateSheet(props: ComponentProps<typeof CreateSheetType>) {
  const mount = useMountOnceOpened(Boolean(props.open), loadCreate);
  return mount ? <CreateSheetImpl {...props} /> : null;
}

export function LazyExploreSheet(props: ComponentProps<typeof ExploreSheetType>) {
  const mount = useMountOnceOpened(Boolean(props.open), loadExplore);
  return mount ? <ExploreSheetImpl {...props} /> : null;
}
