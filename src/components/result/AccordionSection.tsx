import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radii, spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface AccordionSectionProps {
  title: string;
  // A quick at-a-glance number for the collapsed header (e.g. "5.5/10") —
  // optional since not every category has one obvious summary score.
  scoreLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

// Collapsible wrapper for one Scores-tab category (Structure/Content/
// Delivery/Presence/…) — replaces the old always-expanded stack of
// ScoreBars, which read as a genuine wall of paragraph text once a session
// was graded (confirmed live). Deliberately not animated: a Reanimated
// FadeIn body inside a LinearTransition container left later-opened
// sections blank on iOS (only the one open on mount rendered).
export function AccordionSection({ title, scoreLabel, defaultOpen = false, children }: AccordionSectionProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title} category${scoreLabel ? `, ${scoreLabel}` : ""}, ${open ? "expanded" : "collapsed"}`}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{title}</Text>
          {scoreLabel ? <Text style={styles.score}>{scoreLabel}</Text> : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <View style={styles.body}>{children}</View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: typography.body, ...font("700") },
  score: { color: colors.accent, fontSize: typography.caption, ...font("800") },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
}));
