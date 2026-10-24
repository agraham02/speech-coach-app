import { useState } from "react";
import { TextInput, View } from "react-native";
import { Card } from "../common/Card";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { useAccount } from "../../services/account/accountStore";
import { askToSignIn } from "../../services/account/signInGate";
import { describeOverrideError, overrideOn, turnOverrideOff, turnOverrideOn } from "../../services/dev/devAccess";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The developer's password, and the Tono AI limits override it switches on
// (services/dev/devAccess.ts). `locked`: the Dev tab itself is closed until
// this succeeds, so the words say "unlock".
export function DevOverrideCard({ locked }: { locked?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const account = useAccount();
  const on = overrideOn(account);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    if (busy || !password) return;
    setBusy(true);
    try {
      if (account.status !== "signedIn" && !(await askToSignIn("settings"))) return;
      await turnOverrideOn(password);
      setPassword("");
      showToast(locked ? "Dev tools unlocked" : "Limits override is on", "success");
    } catch (error) {
      showToast(describeOverrideError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    try {
      await turnOverrideOff();
      showToast("Back to the normal limits", "success");
    } catch (error) {
      showToast(describeOverrideError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.card}>
      <Txt variant="headline">{locked ? "Dev tools" : "Tono AI limits"}</Txt>
      <Txt variant="footnote" tone="secondary">
        {on
          ? "Override on: this account goes past every Tono AI limit (judged takes, text calls, conversation minutes, caps) for a few hours. It switches itself off."
          : locked
            ? "Enter the developer password to open these tools. It also lifts the Tono AI limits for this account while you test."
            : "Normal limits apply. Enter the developer password to lift them for this account while you test."}
      </Txt>
      {on ? (
        <PrimaryButton label="Back to normal limits" variant="secondary" size="md" loading={busy} onPress={turnOff} />
      ) : (
        <View style={styles.form}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Developer password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={turnOn}
            style={styles.input}
            accessibilityLabel="Developer password"
          />
          <PrimaryButton label={locked ? "Unlock" : "Lift the limits"} size="md" loading={busy} disabled={!password} onPress={turnOn} />
        </View>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  form: { gap: t.space.sm },
  input: {
    height: 46,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
    color: t.colors.textPrimary,
    fontSize: 16,
  },
}));
