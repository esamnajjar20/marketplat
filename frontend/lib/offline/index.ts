/**
 * OFFLINE-BARREL-01 — واجهة استيراد موحّدة لنظام الأوفلاين.
 *
 * الهدف: تقليل سطح الاستيراد للمستهلكين الجدد دون كسر المسارات القديمة
 * (كل ملف offline*.ts ما زال موجودًا ويعمل كما هو — لا regressions).
 *
 * الاستخدام المفضّل للكود الجديد:
 *   import { getQueuedRequestCounts, offlineFreshnessLabel, makeOfflineError } from '@/lib/offline';
 */

export { makeOfflineError, isDeviceOffline } from '@/lib/offlineError';
export { newOfflineOperationId, OFFLINE_OP_ID_HEADER } from '@/lib/offlineOperationId';

export {
  isOfflineStale,
  formatOfflineSavedAt,
  offlineFreshnessLabel,
  OFFLINE_STALE_AFTER_MS,
  type OfflineFreshnessKind,
} from '@/lib/offlineFreshness';

export {
  classifyHttpConflict,
  conflictFromUnknown,
  type ConflictInfo,
  type ConflictKind,
} from '@/lib/conflictResolver';

export {
  getQueuedRequestCount,
  getQueuedRequestCounts,
  listFailedRequests,
  retryFailedRequest,
  discardFailedRequest,
  requestQueueReplay,
  clearOfflineQueue,
  isConflictFailure,
  describeQueueFailure,
  queueFailureAction,
  listQueuedOperationIds,
  listQueuedOperationsWithAge,
  type QueuedRequestSummary,
  type QueuedRequestStatus,
} from '@/lib/offlineQueue';

export {
  saveOfflineJson,
  getOfflineJson,
  clearOfflineJson,
  clearAllOfflineJson,
  OFFLINE_JSON_KEYS,
  type OfflineJsonEnvelope,
} from '@/lib/offlineJsonCache';

export {
  saveOfflineList,
  getOfflineList,
  clearOfflineList,
  clearAllOfflineLists,
  OFFLINE_LIST_KEYS,
  type OfflineListEnvelope,
} from '@/lib/offlineListCache';

export {
  isUnfilteredFirstPage,
  OFFLINE_DATA_LIMITS,
  SW_CACHE_LIMITS,
} from '@/lib/offlineCachePolicy';

export {
  listQueuedMessages,
  retryQueuedMessage,
  discardQueuedMessage,
  type QueuedMessageEntry,
  type QueuedMessageStatus,
} from '@/lib/offlineMessagesQueue';
