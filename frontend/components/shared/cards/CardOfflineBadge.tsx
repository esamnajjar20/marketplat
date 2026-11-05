'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { CardOfflineBadgeView } from './cardDisplayParts';

/** The only client behavior needed by an otherwise static card shell. */
export function CardOfflineBadge() {
  return <CardOfflineBadgeView isOnline={useOnlineStatus()} />;
}
