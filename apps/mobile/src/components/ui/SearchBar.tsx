import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { TextInput, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useUIStyles } from './styles';

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onClear,
  placeholder = 'ابحث…',
  accessibilityLabel = 'بحث',
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  onClear?: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  const s = useUIStyles();
  const { colors } = useAppTheme();
  return (
    <View style={s.searchBar}>
      <Text style={s.searchIcon}>⌕</Text>
      <TextInput allowFontScaling maxFontSizeMultiplier={1.3}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        style={s.searchInput}
        textAlign="right"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="مسح البحث"
          onPress={() => { onChangeText(''); onClear?.(); }}
          style={s.searchClearButton}
        >
          <Text style={s.searchClear}>×</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="تنفيذ البحث" onPress={onSubmit} style={s.searchBtn}>
        <Text style={s.searchBtnText}>بحث</Text>
      </Pressable>
    </View>
  );
}
