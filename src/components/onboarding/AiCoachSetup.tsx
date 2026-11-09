import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { whatGetsSent, whatGetsSentShort } from "../../services/cloud/disclosure";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Onboarding's Tono AI step: what it adds, what it costs, and what is sent
// (one line, with the full list a tap away), right above the "Allow Tono AI"
// button (OnboardingScreen) that is the person's permission (App Review 5.1.2(i)).
// Using it needs a sign-in with Apple or Google, asked for the first time it is used.
export function AiCoachSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.block}>
      <View style={styles.points}>
        <Point icon="sparkles-outline" text="Was it clear, on point and convincing? You get one thing to try next." />
        <Point icon="gift-outline" text="One judged take a month is free. Tono Plus gives you 60." />
      </View>
      <View style={styles.disclosure}>
        <Txt variant="footnote" tone="secondary">
          {whatGetsSentShort()}
        </Txt>
        <PressableScale onPress={() => setOpen((o) => !o)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.more}>
          <Txt variant="footnote" weight="600">
            {open ? "Hide the details" : "See exactly what's sent"}
          </Txt>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textPrimary} />
        </PressableScale>
        {open ? (
          <Txt variant="footnote" tone="secondary">
            {whatGetsSent()} Turn it off any time in Settings, or for one take on its save screen.
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Txt variant="subhead" tone="secondary" style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.lg },
  points: { gap: t.space.md },
  point: { flexDirection: "row", gap: t.space.md - 4, alignItems: "flex-start" },
  disclosure: { gap: t.space.sm },
  more: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  flex: { flex: 1 },
}));
