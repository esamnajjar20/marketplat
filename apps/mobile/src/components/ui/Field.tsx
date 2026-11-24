import { useState, type Ref, type ComponentRef } from 'react';
import { TextInput, View, type TextInputProps, type TextStyle, type ViewStyle, type StyleProp } from 'react-native';
import { AppText as Text } from './AppText';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useUIStyles } from './styles';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';

/** Shared TextInput ref handle for cross-component input chaining. */
export type TextInputHandle = ComponentRef<typeof TextInput>;

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
  inputStyle,
  labelStyle,
  containerStyle,
  hint,
  showCharacterCount = false,
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
  inputRef?: Ref<TextInputHandle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  hint?: string;
  showCharacterCount?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const s = useUIStyles();
  const { colors } = useAppTheme();
  return (
    <View style={[s.field, containerStyle]}>
      <Text style={[s.label, labelStyle]}>{label}</Text>
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
        style={[s.input, inputStyle, multiline && s.textarea, focused && s.inputFocused, !editable && s.inputDisabled, error && s.inputError]}
      />
      {hint || showCharacterCount ? (
        <Text style={s.fieldHint}>
          {hint ? `${hint}${showCharacterCount ? ' · ' : ''}` : ''}
          {showCharacterCount && maxLength ? `${value.length}/${maxLength}` : ''}
        </Text>
      ) : null}
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}
