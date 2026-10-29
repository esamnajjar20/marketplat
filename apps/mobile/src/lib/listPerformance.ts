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
} as const satisfies Partial<FlatListProps<unknown>>;

/** قوائم كثيفة (محادثات / نشاط) — نافذة أصغر */
export const denseListPerf = {
  windowSize: 5,
  maxToRenderPerBatch: 6,
  initialNumToRender: 6,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: true,
} as const satisfies Partial<FlatListProps<unknown>>;

/**
 * يبني getItemLayout لارتفاع ثابت — يسرّع التمرير والقياس.
 * مثال: ارتفاع بطاقة إعلان أفقية ≈ 120 + فجوة 12
 */
export function fixedItemLayout(itemHeight: number, separatorHeight = 0) {
  const length = itemHeight + separatorHeight;
  return (_data: unknown, index: number) => ({
    length,
    offset: length * index,
    index,
  });
}

/** ارتفاعات تقريبية موحّدة لبطاقات المشروع */
export const listItemHeights = {
  /** AdCard أفقية */
  adCard: 120,
  /** CatalogCard */
  catalogCard: 84 + 24, // صورة + حشوة تقريبية
  /** صف قائمة بسيط */
  listRow: 72,
  /** فقاعة رسالة محادثة */
  chatBubble: 64,
} as const;

/**
 * خصائص FlatList جاهزة لشبكة إعلانات أفقية.
 * الاستخدام:
 *   <FlatList {...adListProps} data={ads} renderItem={...} keyExtractor={...} />
 */
export const adListProps = {
  ...marketListPerf,
  getItemLayout: fixedItemLayout(listItemHeights.adCard, 12),
} as const;

export const chatListProps = {
  ...denseListPerf,
} as const;
