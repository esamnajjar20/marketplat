import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Field = { id?: string; key: string; label?: string | null; labelAr?: string | null; pageLabelAr?: string | null; type?: string; scope?: string; isActive?: boolean; options?: { value?: unknown; label?: string; labelAr?: string }[] | null };
function format(value: unknown, field?: Field): string {
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (value == null || value === '') return '';
  if (field?.type === 'SELECT' && Array.isArray(field.options)) {
    const found = field.options.find((option) => String(option.value) === String(value));
    if (found) return found.labelAr || found.label || String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
export function ProductAttributeList({ fields, attributes }: { fields?: Field[] | null; attributes?: Record<string, unknown> | null }) {
  const activeFields = (fields ?? []).filter((field) => field.isActive !== false && field.scope !== 'STORE' && attributes?.[field.key] !== undefined && format(attributes[field.key], field) !== '');
  const rows = activeFields.length ? activeFields.map((field) => ({ key: field.key, label: field.pageLabelAr || field.labelAr || field.label || field.key, value: format(attributes?.[field.key], field) })) : Object.entries(attributes ?? {}).filter(([, value]) => value != null && value !== '').map(([key, value]) => ({ key, label: key, value: format(value) }));
  if (!rows.length) return null;
  return <View style={styles.container}><Text style={styles.title}>مواصفات المنتج</Text><View style={styles.grid}>{rows.map((row) => <View key={row.key} style={styles.row}><Text style={styles.label}>{row.label}</Text><Text style={styles.value}>{row.value}</Text></View>)}</View></View>;
}
const styles = StyleSheet.create({ container: { gap: spacing.md }, title: { ...typography.subtitle, color: colors.ink, textAlign: 'right' }, grid: { gap: spacing.sm }, row: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, gap: 4 }, label: { ...typography.caption, color: colors.muted, textAlign: 'right' }, value: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' } });
