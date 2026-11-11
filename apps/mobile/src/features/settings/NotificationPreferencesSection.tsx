import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { Switch, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { Field, LoadingState, Notice, PrimaryButton, SecondaryButton, SectionCard } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createSettingsStyles } from './settings.styles';
import { DEFAULT_QUIET_TIME_ZONE, PREFERENCE_GROUPS, type Preferences } from './preferences';

type Props = {
  prefs: Preferences;
  setPrefs: Dispatch<SetStateAction<Preferences>>;
  toggle: (key: string, value: boolean) => void;
  loadingPreferences: boolean;
  preferencesLoaded: boolean;
  busy: boolean;
  pushEnabled: boolean;
  pushBusy: boolean;
  deviceTimeZone: string | null;
  enableDevicePush: () => void | Promise<void>;
  disableDevicePush: () => void | Promise<void>;
  save: () => void | Promise<void>;
};

function ToggleRow({
  label,
  desc,
  value,
  disabled,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.brand, false: colors.borderStrong }}
      />
      <View style={styles.rowText}>
        <Text tone="ink" strong>{label}</Text>
        <Text tone="muted" size={12}>{desc}</Text>
      </View>
    </View>
  );
}

/** تفضيلات الإشعارات: إشعارات الجهاز، المجموعات، البريد الاحتياطي، وساعات الهدوء. */
export function NotificationPreferencesSection({
  prefs,
  setPrefs,
  toggle,
  loadingPreferences,
  preferencesLoaded,
  busy,
  pushEnabled,
  pushBusy,
  deviceTimeZone,
  enableDevicePush,
  disableDevicePush,
  save,
}: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);
  const locked = loadingPreferences || !preferencesLoaded || busy;
  const quietEnabled = prefs.quietHoursEnabled === true;
  const quietZone = typeof prefs.quietHoursTimeZone === 'string' && prefs.quietHoursTimeZone
    ? prefs.quietHoursTimeZone
    : DEFAULT_QUIET_TIME_ZONE;

  const toggleQuiet = (next: boolean) => {
    setPrefs((current) => {
      // نثبّت منطقة الجهاز عند أول تفعيل كي لا تُحسب النافذة بتوقيت الخادم الافتراضي.
      const pin = next && !current.quietHoursTimeZone && deviceTimeZone;
      return pin
        ? { ...current, quietHoursEnabled: next, quietHoursTimeZone: deviceTimeZone }
        : { ...current, quietHoursEnabled: next };
    });
  };

  return (
    <View style={styles.group}>
      <SectionCard>
        <View style={styles.groupHeader}>
          <Text tone="ink" strong>إشعارات هذا الجهاز</Text>
          <Text tone="muted" size={12}>
            {pushEnabled ? 'مفعّلة لهذا الحساب على هذا الجهاز' : 'غير مفعّلة على هذا الجهاز'}
          </Text>
        </View>
        {pushEnabled ? (
          <SecondaryButton label="إيقاف إشعارات الجهاز" onPress={() => void disableDevicePush()} busy={pushBusy} />
        ) : (
          <PrimaryButton label="تفعيل إشعارات الجهاز" onPress={() => void enableDevicePush()} busy={pushBusy} />
        )}
      </SectionCard>

      {loadingPreferences ? <LoadingState /> : null}
      {!loadingPreferences && !preferencesLoaded ? (
        <Notice>تعذر تحميل التفضيلات. أغلق هذا القسم وافتحه مجددًا للمحاولة قبل الحفظ.</Notice>
      ) : null}

      {PREFERENCE_GROUPS.map((group) => (
        <SectionCard key={group.title}>
          <View style={styles.groupHeader}>
            <Text tone="ink" strong>{group.title}</Text>
            <Text tone="muted" size={12}>{group.description}</Text>
          </View>
          {group.items.map((item, index) => (
            <View key={item.key}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <ToggleRow
                label={item.label}
                desc={item.desc}
                value={prefs[item.key] === true}
                disabled={locked}
                onChange={(next) => toggle(item.key, next)}
              />
            </View>
          ))}
        </SectionCard>
      ))}

      <SectionCard>
        <ToggleRow
          label="بريد احتياطي"
          desc="رسالة واحدة عندما تبقى الإشعارات المباشرة غير مقروءة"
          value={prefs.emailFallback === true}
          disabled={locked}
          onChange={(next) => toggle('emailFallback', next)}
        />
        <View style={styles.divider} />
        <ToggleRow
          label="ساعات الهدوء"
          desc="إيقاف إشعارات الجهاز خلال فترة محددة"
          value={quietEnabled}
          disabled={locked}
          onChange={toggleQuiet}
        />
        {quietEnabled ? (
          <>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Field
                  label="من (24 ساعة)"
                  value={String(prefs.quietHoursStart ?? '')}
                  onChangeText={(value) => setPrefs((current) => ({ ...current, quietHoursStart: value }))}
                  placeholder="22:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  editable={!locked}
                />
              </View>
              <View style={styles.timeField}>
                <Field
                  label="إلى (24 ساعة)"
                  value={String(prefs.quietHoursEnd ?? '')}
                  onChangeText={(value) => setPrefs((current) => ({ ...current, quietHoursEnd: value }))}
                  placeholder="08:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  editable={!locked}
                />
              </View>
            </View>
            <ToggleRow
              label="السماح بالرسائل العاجلة"
              desc="تصل إشعارات الرسائل الجديدة حتى أثناء ساعات الهدوء"
              value={prefs.quietHoursAllowUrgent !== false}
              disabled={locked}
              onChange={(next) => toggle('quietHoursAllowUrgent', next)}
            />
            <Text tone="muted" size={12}>المنطقة الزمنية: {quietZone}</Text>
          </>
        ) : null}
      </SectionCard>

      <PrimaryButton
        label="حفظ تفضيلات الإشعارات"
        onPress={() => void save()}
        busy={busy}
        disabled={locked}
      />
    </View>
  );
}
