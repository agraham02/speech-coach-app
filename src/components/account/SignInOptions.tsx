import { useState } from "react";
import { Platform, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { PrimaryButton } from "../common/PrimaryButton";
import { useToast } from "../common/ToastProvider";
import { signInWithApple, signInWithGoogle, SignInError, type SignInResult } from "../../services/account/signIn";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Sign in with Apple first, as Apple's rules want it as prominent as any other
// option, then Google. Used by onboarding and Settings. `onSignedIn` runs after
// a successful sign-in (not after the person closes the sheet).
export function SignInOptions({ onSignedIn }: { onSignedIn?: () => void | Promise<void> }) {
  const styles = useStyles();
  const { scheme, radius } = useTheme();
  const showToast = useToast();
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);

  async function run(which: "apple" | "google", signIn: () => Promise<SignInResult>) {
    if (busy) return;
    setBusy(which);
    try {
      if ((await signIn()) === "signedIn") await onSignedIn?.();
    } catch (error) {
      showToast(error instanceof SignInError ? error.message : "Couldn't sign in. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap}>
      {Platform.OS === "ios" ? (
        <View style={busy ? styles.dimmed : undefined} pointerEvents={busy ? "none" : "auto"}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={scheme === "dark" ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.md + 2}
            style={styles.apple}
            onPress={() => run("apple", signInWithApple)}
          />
        </View>
      ) : null}
      <PrimaryButton label="Continue with Google" variant="secondary" icon="logo-google" loading={busy === "google"} disabled={!!busy} onPress={() => run("google", signInWithGoogle)} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.sm + 2 },
  apple: { height: 56, width: "100%" },
  dimmed: { opacity: 0.5 },
}));
