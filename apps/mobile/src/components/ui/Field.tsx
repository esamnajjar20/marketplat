import { useState, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '@/theme/tokens';
import { uiStyles as s } from './styles';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';

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
  accessibilityHint,
  autoCapitalize,
  autoCorrect,
  textContentType,
  textAlign,
  inputRef,
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
  accessibilityHint?: string;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: TextInputProps['autoCorrect'];
  textContentType?: TextInputProps['textContentType'];
  textAlign?: TextInputProps['textAlign'];
  inputRef?: Ref<TextInput>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput allowFontScaling maxFontSizeMultiplier={1.3}
        ref={inputRef}
        value={value}
        onChangeText={(nextValue) => {
          const numericKeyboard = keyboardType === 'numeric' || keyboardType === 'number-pad' || keyboardType === 'decimal-pad' || keyboardType === 'phone-pad';
          onChangeText(numericKeyboard ? normalizeNumericInput(nextValue) : nextValue);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        allowFontScaling
        maxFontSizeMultiplier={1.3}
        editable={editable}
        accessibilityLabel={label}
        accessibilityHint={error ? `${accessibilityHint ? `${accessibilityHint}. ` : ''}${error}` : accessibilityHint}
        accessibilityState={{ disabled: !editable }}
        selectionColor={colors.brand}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        textAlign={textAlign ?? (keyboardType === 'email-address' || keyboardType === 'phone-pad' ? 'left' : 'right')}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' || secureTextEntry || keyboardType === 'numeric' || keyboardType === 'phone-pad' || keyboardType === 'number-pad' || keyboardType === 'decimal-pad' ? 'none' : 'sentences')}
        autoCorrect={autoCorrect ?? (keyboardType === 'email-address' || secureTextEntry || keyboardType === 'phone-pad' ? false : undefined)}
        textContentType={textContentType}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        style={[s.input, multiline && s.textarea, focused && s.inputFocused, !editable && s.inputDisabled, error && s.inputError]}
      />
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}
