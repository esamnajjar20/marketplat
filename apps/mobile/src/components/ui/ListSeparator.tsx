import { memo } from 'react';
import { View } from 'react-native';
import { spacing } from '@/theme/tokens';

/**
 * فواصل قوائم ثابتة الهوية (مكوّن معرَّف خارج الشاشة) حتى لا يُعاد إنشاؤها مع كل render.
 * FlashList لا يدعم `gap` في contentContainerStyle، فهذه الفواصل هي البديل.
 */
export const ListGapSm = memo(function ListGapSm() {
  return <View style={{ height: spacing.sm }} />;
});

export const ListGapMd = memo(function ListGapMd() {
  return <View style={{ height: spacing.md }} />;
});

export const ListGapLg = memo(function ListGapLg() {
  return <View style={{ height: spacing.lg }} />;
});

export const ListGapXl = memo(function ListGapXl() {
  return <View style={{ height: spacing.xl }} />;
});
