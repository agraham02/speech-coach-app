import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import {
  DEFAULT_CURRICULUM_LEVEL,
  difficultyTierLabel,
  explainCurriculumChange,
  levelToDifficultyTier,
  type CurriculumLevel,
} from "../domain/curriculum";
import { getCurriculumHistory, recomputeCurriculumLevel, resetCurriculumProgress } from "../services/db/curriculumRepo";
import { getCurriculumOverride, setCurriculumOverride } from "../services/prefs/prefsStore";
import type { CurriculumStateEntry } from "../domain/sessionTypes";
import { radii, spacing, typography, font } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Colors } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Curriculum">;

const LEVELS: CurriculumLevel[] = [1, 2, 3, 4, 5];

const COMPONENT_LABEL: Record<string, string> = {
  overall: "overall scores",
  delivery: "delivery scores",
  coherence: "coherence",
  drill: "tongue-twister accuracy",
};

function directionIcon(direction: string): keyof typeof Ionicons.glyphMap {
  if (direction === "up") return "arrow-up";
  if (direction === "down") return "arrow-down";
  return "flag-outline";
}

function directionColor(direction: string, colors: Colors): string {
  if (direction === "up") return colors.success;
  if (direction === "down") return colors.warning;
  return colors.textMuted;
}

function formatChangeDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function historyReasonLabel(entry: CurriculumStateEntry): string {
  if (entry.direction === "initial") return "Started here — the default level.";
  const label = COMPONENT_LABEL[entry.reasonCode] ?? "recent performance";
  return entry.direction === "up" ? `Moved up — strong ${label}.` : `Eased back — ${label} dipped.`;
}

// The full "why" behind today's level, plus history and the manual
// override — pushed from both Home's level chip and Trends' curriculum
// card. Auto-adjustment is deliberately gradual (see curriculum.ts's
// header note) — this screen is where that's made visible and explained,
// not just asserted.
export function CurriculumScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [level, setLevel] = useState<CurriculumLevel>(DEFAULT_CURRICULUM_LEVEL);
  const [override, setOverrideState] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("");
  const [history, setHistory] = useState<CurriculumStateEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const currentOverride = getCurriculumOverride();
    setOverrideState(currentOverride);

    const [decision, historyRows] = await Promise.all([recomputeCurriculumLevel(), getCurriculumHistory(20)]);
    const effectiveLevel = (currentOverride ?? decision.level) as CurriculumLevel;
    setLevel(effectiveLevel);
    setExplanation(
      explainCurriculumChange({
        direction: decision.direction,
        component: decision.component,
        componentScore: decision.componentScore,
        reason: decision.reason,
        level: effectiveLevel,
        overrideActive: currentOverride !== null,
      }),
    );
    setHistory(historyRows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function handleSelectOverride(next: number | null) {
    setCurriculumOverride(next);
    refresh();
  }

  // Confirmed, since it wipes level history — but never touches recorded
  // sessions/scores, so the confirmation copy says so explicitly rather than
  // reading like a full data wipe.
  function handleResetProgress() {
    Alert.alert(
      "Reset progress?",
      `This clears your curriculum level and history, and starts back at Level ${DEFAULT_CURRICULUM_LEVEL} (Auto). Your recorded sessions and scores aren't affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetCurriculumProgress();
            refresh();
          },
        },
      ],
    );
  }

  const tier = levelToDifficultyTier(level);

  return (
    <ScreenContainer style={styles.container}>
      <Header title="Your level" onBack={() => navigation.goBack()} backIcon="chevron-back"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.levelCard}>
          <Text style={styles.levelNumber}>Level {level}</Text>
          <Text style={styles.levelTier}>{difficultyTierLabel(tier)} difficulty</Text>
          <Text style={styles.explanation}>{explanation}</Text>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Set level</Text>
          <Text style={styles.sectionSubtitle}>
            Auto moves gradually, at most one level at a time, only after a stretch of consistent sessions — this is
            meant to track months of practice, not a single good or bad day. Pin a level to take over manually; auto
            keeps computing quietly in the background, so switching back to Auto picks up right where it would've
            been.
          </Text>
          <View style={styles.chipRow}>
            <Pressable onPress={() => handleSelectOverride(null)} style={[styles.chip, override === null && styles.chipActive]}>
              <Text style={[styles.chipText, override === null && styles.chipTextActive]}>Auto</Text>
            </Pressable>
            {LEVELS.map((l) => (
              <Pressable key={l} onPress={() => handleSelectOverride(l)} style={[styles.chip, override === l && styles.chipActive]}>
                <Text style={[styles.chipText, override === l && styles.chipTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>History</Text>
          {!loading && history.length === 0 ? (
            <Text style={styles.sectionSubtitle}>No changes yet — this fills in as your level adjusts over time.</Text>
          ) : (
            history.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <Ionicons name={directionIcon(entry.direction)} size={16} color={directionColor(entry.direction, colors)} />
                <View style={styles.historyText}>
                  <Text style={styles.historyLevel}>Level {entry.level}</Text>
                  <Text style={styles.historyReason}>{historyReasonLabel(entry)}</Text>
                </View>
                <Text style={styles.historyDate}>{formatChangeDate(entry.changedAt)}</Text>
              </View>
            ))
          )}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Reset progress</Text>
          <Text style={styles.sectionSubtitle}>
            Clears your curriculum level and history, and starts back at Level {DEFAULT_CURRICULUM_LEVEL} (Auto).
            Doesn't touch your recorded sessions or scores.
          </Text>
          <Pressable
            onPress={handleResetProgress}
            style={styles.resetButton}
            accessibilityRole="button"
            accessibilityLabel="Reset curriculum progress"
          >
            <Ionicons name="refresh" size={16} color={colors.danger} />
            <Text style={styles.resetButtonText}>Reset to Level {DEFAULT_CURRICULUM_LEVEL}</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 26 },
  title: { color: colors.textPrimary, fontSize: typography.title, ...font("700") },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  levelCard: { alignItems: "center", gap: spacing.xs },
  levelNumber: { color: colors.textPrimary, fontSize: typography.headline, ...font("800") },
  levelTier: { color: colors.accent, fontSize: typography.body, ...font("700") },
  explanation: { ...font("400"), color: colors.textSecondary, fontSize: typography.body, textAlign: "center", marginTop: spacing.xs, lineHeight: 21 },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, ...font("700") },
  sectionSubtitle: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: typography.body, ...font("700") },
  chipTextActive: { color: colors.onAccent },
  historyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  historyText: { flex: 1, gap: 2 },
  historyLevel: { color: colors.textPrimary, fontSize: typography.body, ...font("700") },
  historyReason: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption },
  historyDate: { ...font("400"), color: colors.textMuted, fontSize: typography.caption },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  resetButtonText: { color: colors.danger, fontSize: typography.body, ...font("700") },
}));
