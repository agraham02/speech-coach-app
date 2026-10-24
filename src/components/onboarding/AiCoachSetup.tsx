import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "../common/Txt";
import { whatGetsSent } from "../../services/cloud/disclosure";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Onboarding's Tono AI step: what it adds, what it costs (nothing to start),
// and exactly what is sent, right above the "Allow Tono AI" button
// (OnboardingScreen) that is the person's permission (App Review 5.1.2(i)).
// No sign-in and no key: an account is made behind the scenes when needed.
export function AiCoachSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      <View style={styles.points}>
        <Point icon="sparkles-outline" text="Judges each take like a coach would: did your answer have a shape, stay on the point and land with conviction, and what to change next." />
        <Point icon="phone-portrait-outline" text="Your phone still measures pace, pauses, fillers and eye contact on its own, free. Tono AI adds the judgement calls a phone can't make." />
        <Point icon="gift-outline" text="One judged take a month is free, with no account to make. Tono Plus gives you 60 a month, and you can try it free for 14 days." />
      </View>
      <View style={styles.disclosure}>
        <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
        <Txt variant="footnote" tone="secondary" style={styles.flex}>
          {whatGetsSent()} Turn it off any time in Settings, or for one take on its save screen.
        </Txt>
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
  disclosure: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  flex: { flex: 1 },
}));
