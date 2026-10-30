import { Pressable, Text, TextInput, View } from 'react-native';
import { colors } from '@/theme/tokens';
import { uiStyles as s } from './styles';

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'ابحث…',
  accessibilityLabel = 'بحث',
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View style={s.searchBar}>
      <Text style={s.searchIcon}>⌕</Text>
      <TextInput
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
          onPress={() => onChangeText('')}
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
