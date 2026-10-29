/**
 * إعدادات FlatList خفيفة لتحسين السكرول بدون مكتبات Native ثقيلة.
 * استخدمها في القوائم الطويلة (إعلانات، محادثات، نشاط، مبيعات...).
 */
import type { FlatListProps } from 'react-native';

/** إعدادات افتراضية مناسبة لشاشات السوق على أجهزة متوسطة */
export const marketListPerf = {
  windowSize: 7,
  maxToRenderPerBatch: 8,
  initialNumToRender: 8,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: true,
  /** على Android يحسّن الذاكرة مع القوائم الطويلة */
} as const satisfies Partial<FlatListProps<unknown>>;

/** قوائم كثيفة (محادثات / نشاط) — نافذة أصغر */
export const denseListPerf = {
  windowSize: 5,
  maxToRenderPerBatch: 6,
  initialNumToRender: 6,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: true,
} as const satisfies Partial<FlatListProps<unknown>>;
