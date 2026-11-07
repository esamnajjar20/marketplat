'use client';

import NextLink from 'next/link';
import { forwardRef, useState } from 'react';
import type { ComponentProps } from 'react';

type NextLinkProps = ComponentProps<typeof NextLink>;
type LinkHref = NextLinkProps['href'];

/**
 * Preserve Next.js Link's normal behavior, but defer links explicitly opted out of automatic prefetching until the user shows intent (hover or keyboard focus).
 *
 * This avoids viewport-wide RSC requests from dense navigation and result
 * lists while still warming a destination before deliberate desktop/keyboard
 * navigation. Href identity is tracked so a recycled list row cannot inherit
 * intent for a different destination.
 */
const IntentPrefetchLink = forwardRef<HTMLAnchorElement, NextLinkProps>(
  function IntentPrefetchLink(
    {
      href,
      prefetch,
      target,
      download,
      onMouseEnter,
      onFocus,
      ...props
    },
    ref,
  ) {
    const [intentHref, setIntentHref] = useState<LinkHref | null>(null);
    const isOptedOut = prefetch === false;
    const canPrefetchOnIntent =
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
