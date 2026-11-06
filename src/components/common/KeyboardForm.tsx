import { useState, type ReactNode } from "react";
import { type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The gap ScreenContainer leaves under its content, which the pinned footer
// keeps when it rides up above the keyboard.
const FOOTER_GAP = 16;

interface KeyboardFormProps {
  children: ReactNode;
  // The action pinned under the form (a button, or a row of them).
  footer: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

// A form on a ScreenContainer screen: the content scrolls, and the field being
// typed in is brought into view above the keyboard; the footer rides up on top
// of the keyboard instead of hiding behind it, and the field is kept clear of
// it. Put it where the scroll view would go, under the Header.
//
// Use this instead of KeyboardAvoidingView around a KeyboardAwareScrollView:
// that counts the keyboard twice.
export function KeyboardForm({ children, footer, contentContainerStyle }: KeyboardFormProps) {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  // What the footer covers above the keyboard.
  const clearance = footerHeight + FOOTER_GAP;
  return (
    <>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        bottomOffset={24 + clearance}
        extraKeyboardSpace={clearance}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
      {/* The screen's own bottom inset is hidden by the keyboard, so cancel it. */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} onLayout={(e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height)}>
        {footer}
      </KeyboardStickyView>
    </>
  );
}
