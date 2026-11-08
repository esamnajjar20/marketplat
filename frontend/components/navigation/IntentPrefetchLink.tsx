'use client';

import NextLink from 'next/link';
import { forwardRef, useState } from 'react';
import type { ComponentProps } from 'react';

type NextLinkProps = ComponentProps<typeof NextLink>;
type LinkHref = NextLinkProps['href'];

interface IntentPrefetchLinkProps extends NextLinkProps {
  /** Opt in only where a partial route prefetch is known to be useful. */
  prefetchOnIntent?: boolean;
}

/**
 * Preserve Next.js Link's normal behavior. An explicit `prefetch={false}` is
 * honored strictly by default: hovering or focusing does not silently turn it
 * back on. This matters for dynamic App Router routes, where an intent prefetch
 * can fetch only the shared loading shell and the click then fetches the full
 * route as a second RSC request.
 *
 * `prefetchOnIntent` is a deliberate opt-in for a route where that partial
 * prefetch has been measured to improve navigation. Href identity prevents a
 * recycled list row from inheriting intent for another destination.
 */
const IntentPrefetchLink = forwardRef<HTMLAnchorElement, IntentPrefetchLinkProps>(
  function IntentPrefetchLink(
    {
      href,
      prefetch,
      prefetchOnIntent = false,
      target,
      download,
      onMouseEnter,
      onFocus,
      ...props
    }: IntentPrefetchLinkProps,
    ref,
  ) {
    const [intentHref, setIntentHref] = useState<LinkHref | null>(null);
    const isOptedOut = prefetch === false;
    const canPrefetchOnIntent =
      prefetchOnIntent &&
      isOptedOut &&
      (target == null || target === '_self') &&
      download === undefined &&
      !(typeof href === 'string' && /^(?:#|mailto:|tel:|sms:)/i.test(href));

    // A changed href starts cold, even if React reuses the same list-row instance.
    const resolvedPrefetch =
      canPrefetchOnIntent && intentHref === href ? null : prefetch;

    return (
      <NextLink
        {...props}
        ref={ref}
        href={href}
        target={target}
        download={download}
        prefetch={resolvedPrefetch}
        onMouseEnter={
          canPrefetchOnIntent
            ? (event) => {
                onMouseEnter?.(event);
                setIntentHref(href);
              }
            : onMouseEnter
        }
        onFocus={
          canPrefetchOnIntent
            ? (event) => {
                onFocus?.(event);
                setIntentHref(href);
              }
            : onFocus
        }
      />
    );
  },
);

IntentPrefetchLink.displayName = 'IntentPrefetchLink';

export default IntentPrefetchLink;
