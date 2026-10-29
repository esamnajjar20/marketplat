import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '@/theme/tokens';
import { uiStyles as s } from './styles';

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry,
  maxLength,
  editable = true,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  autoFocus,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  secureTextEntry?: boolean;
  maxLength?: number;
  editable?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  autoFocus?: boolean;
  error?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        editable={editable}
        accessibilityLabel={label}
        selectionColor={colors.brand}
        textAlign="right"
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize={
          keyboardType === 'email-address' ||
          secureTextEntry ||
          keyboardType === 'numeric' ||
          keyboardType === 'phone-pad' ||
          keyboardType === 'number-pad' ||
          keyboardType === 'decimal-pad'
            ? 'none'
            : 'sentences'
        }
        autoCorrect={keyboardType === 'email-address' || secureTextEntry ? false : undefined}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        style={[s.input, multiline && s.textarea, !editable && s.inputDisabled, error && s.inputError]}
      />
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}
