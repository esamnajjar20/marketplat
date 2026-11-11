import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyServiceTypeProfiles, updateMyServiceTypeProfile, type ProviderServiceTypeField, type ProviderServiceTypeProfile } from '@/features/services/providers.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { fontSizes, spacing, fontWeights, radius } from '@/theme/tokens';

type AttributesByType = Record<string, Record<string, unknown>>;
type FieldErrors = Record<string, string>;

function optionsOf(field: ProviderServiceTypeField): Array<{ value: string; labelAr: string }> {
  return Array.isArray(field.options)
    ? field.options.filter((option): option is { value: string; labelAr: string } =>
        Boolean(option) && typeof option.value === 'string' && typeof option.labelAr === 'string')
    : [];
}

export default function ServiceTypesScreen() {
  const { colors } = useAppTheme();

  const { accessToken, getAccessToken, csrfToken, user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<ProviderServiceTypeProfile[]>([]);
  const [attributes, setAttributes] = useState<AttributesByType>({});
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!userId || !token) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const rows = await fetchMyServiceTypeProfiles(token);
      setItems(rows);
      setAttributes(Object.fromEntries(rows.map((row) => [row.serviceTypeId, { ...(row.attributes ?? {}) }])));
      setActive(Object.fromEntries(rows.map((row) => [row.serviceTypeId, row.isActive])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل أنواع الخدمات.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, userId]);

  useEffect(() => { void load(); }, [load]);

  const setAttribute = (serviceTypeId: string, key: string, value: unknown) => {
    setAttributes((current) => ({
      ...current,
      [serviceTypeId]: { ...(current[serviceTypeId] ?? {}), [key]: value },
    }));
    setError('');
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`${serviceTypeId}:${key}`];
      return next;
    });
  };

  const save = async (item: ProviderServiceTypeProfile) => {
    const token = getAccessToken();
    if (!token || busyId) return;
    const source = { ...(attributes[item.serviceTypeId] ?? {}) };
    const payload: Record<string, unknown> = {};
    const nextErrors: FieldErrors = {};

    for (const field of item.serviceType.fields ?? []) {
      const value = source[field.key];
      const type = field.type ?? 'TEXT';
      const empty = value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
      const label = field.labelAr || field.label || field.key;
      if (field.required && type === 'BOOLEAN' && typeof value !== 'boolean') {
        nextErrors[`${item.serviceTypeId}:${field.key}`] = `حدد قيمة حقل «${label}».`;
        continue;
      }
      if (field.required && empty && type !== 'BOOLEAN') {
        nextErrors[`${item.serviceTypeId}:${field.key}`] = `حقل «${label}» مطلوب.`;
        continue;
      }
      if (empty) continue;

      if (type === 'NUMBER') {
        const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(',', '.'));
        if (!Number.isFinite(numeric)) {
          nextErrors[`${item.serviceTypeId}:${field.key}`] = `أدخل رقمًا صحيحًا في «${label}».`;
          continue;
        }
        payload[field.key] = numeric;
      } else if (type === 'BOOLEAN') {
        payload[field.key] = Boolean(value);
      } else if (type === 'MULTI_SELECT') {
        if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
          nextErrors[`${item.serviceTypeId}:${field.key}`] = `اختر قيمًا صالحة لحقل «${label}».`;
          continue;
        }
        const allowed = new Set(optionsOf(field).map((option) => option.value));
        if (value.some((entry) => !allowed.has(entry as string))) {
          nextErrors[`${item.serviceTypeId}:${field.key}`] = `توجد قيمة غير متاحة في «${label}».`;
          continue;
        }
        payload[field.key] = value;
      } else if (type === 'SELECT') {
        const allowed = new Set(optionsOf(field).map((option) => option.value));
        if (typeof value !== 'string' || !allowed.has(value)) {
          nextErrors[`${item.serviceTypeId}:${field.key}`] = `اختر قيمة متاحة لحقل «${label}».`;
          continue;
        }
        payload[field.key] = value;
      } else if (typeof value === 'string') {
        payload[field.key] = value.trim();
      }
    }

    setFieldErrors((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${item.serviceTypeId}:`))), ...nextErrors }));
    if (Object.keys(nextErrors).length) {
      setError('راجع الحقول المحددة قبل الحفظ.');
      return;
    }

    setBusyId(item.serviceTypeId);
    setError('');
    setMessage('');
    try {
      const updated = await updateMyServiceTypeProfile(
        item.serviceTypeId,
        payload,
        active[item.serviceTypeId] ?? item.isActive,
        token,
        csrfToken,
      );
      // Update only this item: do not reload the whole screen and erase edits in other cards.
      setItems((current) => current.map((row) => row.serviceTypeId === item.serviceTypeId ? updated : row));
      setAttributes((current) => ({ ...current, [item.serviceTypeId]: { ...(updated.attributes ?? payload) } }));
      setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${item.serviceTypeId}:`))));
      setActive((current) => ({ ...current, [item.serviceTypeId]: updated.isActive }));
      setMessage(`تم حفظ «${item.serviceType.nameAr || item.serviceType.name}».`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ خصائص نوع الخدمة.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <PageShell title="أنواع الخدمات وخصائصها">
      {!accessToken ? <><Notice>سجّل الدخول لإدارة أنواع الخدمات.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} /></> : null}
      {accessToken && loading ? <Notice tone="muted">جارٍ تحميل الأنواع…</Notice> : null}
      {accessToken && !loading && items.length === 0 ? <Notice tone="muted">لا توجد أنواع خدمات مرتبطة بملفك بعد. أنشئ خدمة لكل نوع تريد إعداده أولًا.</Notice> : null}
      {accessToken && !loading ? items.map((item) => {
        const fields = item.serviceType.fields ?? [];
        const values = attributes[item.serviceTypeId] ?? {};
        return (
          <SectionCard key={item.serviceTypeId}>
            <Text tone="ink" strong size={16}>{item.serviceType.nameAr || item.serviceType.name}</Text>
            <Text tone="muted">أدخل تفاصيل ملفك وفق الحقول التي يحددها هذا النوع.</Text>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: active[item.serviceTypeId] ?? item.isActive }} onPress={() => setActive((current) => ({ ...current, [item.serviceTypeId]: !(current[item.serviceTypeId] ?? item.isActive) }))} style={{ alignSelf: 'flex-end', padding: 9, borderRadius: 9, backgroundColor: (active[item.serviceTypeId] ?? item.isActive) ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>{(active[item.serviceTypeId] ?? item.isActive) ? 'مفعّل — اضغط للتعطيل' : 'معطّل — اضغط للتفعيل'}</Text>
            </Pressable>
            {fields.length === 0 ? <Notice tone="muted">لا توجد خصائص إضافية قابلة للتحرير لهذا النوع حاليًا.</Notice> : fields.map((field) => {
              const label = field.labelAr || field.label || field.key;
              const type = field.type ?? 'TEXT';
              const value = values[field.key];
              const fieldError = fieldErrors[`${item.serviceTypeId}:${field.key}`];
              if (type === 'BOOLEAN') {
                const checked = typeof value === 'boolean' ? value : false;
                return <Pressable key={field.key} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setAttribute(item.serviceTypeId, field.key, !checked)} style={{ padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: checked ? colors.brand : colors.border, backgroundColor: checked ? colors.brandSoft : colors.surface, gap: 5 }}><Text tone="ink" strong>{label}</Text><Text tone="brand">{checked ? 'نعم' : 'لا'}</Text>{fieldError ? <Text tone="danger">{fieldError}</Text> : null}</Pressable>;
              }
              if (type === 'SELECT' || type === 'MULTI_SELECT') {
                const options = optionsOf(field);
                const selected = type === 'MULTI_SELECT' && Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
                return <View key={field.key} style={{ gap: spacing.sm }}><Text tone="ink" strong>{label}{field.required ? ' *' : ''}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{options.map((option) => {
                  const isSelected = type === 'SELECT' ? value === option.value : selected.includes(option.value);
                  return <Pressable key={option.value} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} onPress={() => {
                    if (type === 'SELECT') setAttribute(item.serviceTypeId, field.key, isSelected ? '' : option.value);
                    else setAttribute(item.serviceTypeId, field.key, isSelected ? selected.filter((entry) => entry !== option.value) : [...selected, option.value]);
                  }} style={{ paddingHorizontal: 11, paddingVertical: spacing.sm, borderRadius: 9, borderWidth: 1, borderColor: isSelected ? colors.brand : colors.border, backgroundColor: isSelected ? colors.brandSoft : colors.surface }}><Text style={{ color: colors.ink, fontSize: fontSizes[12], fontWeight: fontWeights.bold }}>{option.labelAr}</Text></Pressable>;
                })}</View>{fieldError ? <Text tone="danger">{fieldError}</Text> : null}</View>;
              }
              return <Field key={field.key} label={`${label}${field.required ? ' *' : ''}`} value={value == null ? '' : String(value)} onChangeText={(next) => setAttribute(item.serviceTypeId, field.key, type === 'NUMBER' ? next : next)} multiline={type === 'TEXTAREA'} keyboardType={type === 'NUMBER' ? 'decimal-pad' : 'default'} placeholder={`أدخل ${label}`} error={fieldError} />;
            })}
            <PrimaryButton label="حفظ الخصائص" busy={busyId === item.serviceTypeId} disabled={Boolean(busyId && busyId !== item.serviceTypeId)} onPress={() => void save(item)} />
          </SectionCard>
        );
      }) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
    </PageShell>
  );
}
