import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { HeroCard } from "../components/common/HeroCard";
import { Badge } from "../components/common/Badge";
import { Banner } from "../components/common/Banner";
import { SessionOptionsSheet } from "../components/home/SessionOptionsSheet";
import { AVOID_REPEAT_LAST_N, pickRandomPrompt, pickTodaysPrompt } from "../domain/pickTodaysPrompt";
import { FREE_RECORD_PROMPT } from "../data/topics";
import { computeStreaks, type StreakResult } from "../domain/streaks";
import { colorForCategory } from "../domain/categoryColor";
import type { PrepPhaseSettings, RecordingDurationSettings } from "../domain/recordingSettings";
import { DEFAULT_PREP_PHASE_SETTINGS, DEFAULT_RECORDING_DURATION_SETTINGS } from "../domain/recordingSettings";
import {
  curriculumLevelToDurationSeconds,
  curriculumLevelToPrepMode,
  curriculumLevelToPrepSeconds,
  DEFAULT_CURRICULUM_LEVEL,
  difficultyTierLabel,
  filterPromptsByTier,
  levelToDifficultyTier,
  type CurriculumLevel,
} from "../domain/curriculum";
import { getAllPrompts } from "../services/db/promptsRepo";
import { getRecentlyUsedPromptIds, getTodaysSession } from "../services/db/sessionsRepo";
import { getCompletedSessionDates } from "../services/db/statsRepo";
import { getEffectiveCurriculumLevel, recomputeCurriculumLevel } from "../services/db/curriculumRepo";
import {
  getConciseModeSeconds,
  getPlanYourPointEnabled,
  getPrepPhaseSettings,
  getPrepSettingsManuallySet,
  getRecordingDurationManuallySet,
  getRecordingDurationSettings,
  getWarmUpEnabled,
  setConciseModeSeconds,
  setPrepPhaseSettings,
  setPrepSettingsManuallySet,
  setRecordingDurationManuallySet,
  setRecordingDurationSettings,
  setWarmUpEnabled,
} from "../services/prefs/prefsStore";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import type { Prompt } from "../domain/sessionTypes";
import { fontDisplay, radii, spacing, typography } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const EMPTY_STREAK: StreakResult = { currentStreak: 0, longestStreak: 0 };

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface ShelfCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

// Home's browsable-modes row — Script Practice / Prompt Library / Drills,
// demoted below the one primary action instead of competing with it as
// equal-weight buttons (see the old six-button stack this replaced).
function ShelfCard({ icon, label, onPress }: ShelfCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shelfCard, pressed && styles.shelfCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      <Text style={styles.shelfCardLabel}>{label}</Text>
    </Pressable>
  );
}

export function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  // Cached once per focus so rerollPrompt (called from a setState updater,
  // which can't await) has a ready-to-use pool instead of re-fetching.
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([]);
  const [recentPromptIds, setRecentPromptIds] = useState<string[]>([]);
  const [alreadyPracticedToday, setAlreadyPracticedToday] = useState(false);
  const [streak, setStreak] = useState<StreakResult>(EMPTY_STREAK);

  // Session options — moved here from the general Settings screen (still
  // persisted through the same prefsStore) since they only ever matter right
  // before starting a recording, not as general app configuration.
  const [sheetVisible, setSheetVisible] = useState(false);
  const [durationSettings, setDurationSettings] = useState<RecordingDurationSettings>(DEFAULT_RECORDING_DURATION_SETTINGS);
  const [durationManuallySet, setDurationManuallySet] = useState(false);
  const [prepSettings, setPrepSettings] = useState<PrepPhaseSettings>(DEFAULT_PREP_PHASE_SETTINGS);
  const [prepManuallySet, setPrepManuallySet] = useState(false);
  const [warmUpEnabled, setWarmUpEnabledState] = useState(false);
  const [conciseModeSeconds, setConciseModeSecondsState] = useState(45);
  // Adaptive Curriculum Engine (Phase 5) — the level driving today's prompt
  // pool/recording length; refreshed on every focus by recomputeCurriculumLevel()
  // below. Badge near the prompt card links to CurriculumScreen for the
  // full "why" + manual override.
  const [curriculumLevel, setCurriculumLevel] = useState<CurriculumLevel>(DEFAULT_CURRICULUM_LEVEL);
  // Ephemeral, per-visit — unlike the settings above this isn't a standing
  // preference, it's "make my next recording concise", so it isn't persisted
  // and resets whenever Home regains focus.
  const [conciseModeOn, setConciseModeOn] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Kicked off once per focus, shared by both the prompt-pool filter
      // below and the curriculum-driven duration default — avoids running
      // the (small but non-free) recompute query twice per focus.
      const curriculumPromise = recomputeCurriculumLevel();

      (async () => {
        try {
          const [prompts, excludeIds] = await Promise.all([
            getAllPrompts(),
            getRecentlyUsedPromptIds(AVOID_REPEAT_LAST_N),
            curriculumPromise, // awaited for its cache-refresh side effect — see getEffectiveCurriculumLevel() below
          ]);
          // Reads through the single accessor (not curriculumResult.level
          // directly) so a manual override is respected here exactly like
          // every other consumer — recomputeCurriculumLevel() only keeps
          // the *auto* value fresh, it never decides what's effective.
          const level = getEffectiveCurriculumLevel().level;
          setCurriculumLevel(level);

          const tierPool = filterPromptsByTier(prompts, levelToDifficultyTier(level));
          setAllPrompts(tierPool);
          setRecentPromptIds(excludeIds);
          setPrompt(pickTodaysPrompt(tierPool, excludeIds));

          if (!getRecordingDurationManuallySet()) {
            setDurationSettings({ mode: "fixed", fixedSeconds: curriculumLevelToDurationSeconds(level) });
          }
          if (!getPrepSettingsManuallySet()) {
            setPrepSettings({
              enabled: true,
              mode: curriculumLevelToPrepMode(level),
              fixedSeconds: curriculumLevelToPrepSeconds(level),
            });
          }
        } catch {
          const prompts = await getAllPrompts();
          setAllPrompts(prompts);
          setPrompt(pickTodaysPrompt(prompts));
        }
      })();

      getTodaysSession()
        .then((session) => setAlreadyPracticedToday(session?.status === "done"))
        .catch(() => setAlreadyPracticedToday(false));

      getCompletedSessionDates()
        .then((dates) => setStreak(computeStreaks(dates)))
        .catch(() => setStreak(EMPTY_STREAK));

      const manuallySet = getRecordingDurationManuallySet();
      setDurationManuallySet(manuallySet);
      // If not manually set, the curriculum block above fills this in once
      // the level is known — avoids briefly showing the stale default.
      if (manuallySet) {
        setDurationSettings(getRecordingDurationSettings());
      }
      const prepManually = getPrepSettingsManuallySet();
      setPrepManuallySet(prepManually);
      // Same "avoid the stale default" precedent as duration above — left
      // unset here when not manual so the curriculum block fills it in.
      if (prepManually) {
        setPrepSettings(getPrepPhaseSettings());
      }
      setWarmUpEnabledState(getWarmUpEnabled());
      setConciseModeSecondsState(getConciseModeSeconds());
      setConciseModeOn(false);
    }, []),
  );

  // Rerolls to a different prompt, avoiding both the same recently-used
  // window as the daily pick AND whatever's currently on screen, so pressing
  // the dice always changes something instead of occasionally no-opping.
  function rerollPrompt() {
    setPrompt((current) => {
      const excludeIds = current ? [...recentPromptIds, current.id] : recentPromptIds;
      return pickRandomPrompt(allPrompts, excludeIds);
    });
  }

  function updateDurationSettings(next: RecordingDurationSettings) {
    setDurationSettings(next);
    setRecordingDurationSettings(next);
    setRecordingDurationManuallySet(true);
    setDurationManuallySet(true);
  }

  // Hands the recording-length lever back to the curriculum — clears the
  // manual flag (does NOT touch the stored manual settings themselves, so
  // manually setting again later doesn't resurrect this old value as a
  // surprise default) and immediately reflects what "auto" currently means.
  function resetDurationToAuto() {
    setRecordingDurationManuallySet(false);
    setDurationManuallySet(false);
    setDurationSettings({ mode: "fixed", fixedSeconds: curriculumLevelToDurationSeconds(curriculumLevel) });
  }

  function updatePrepSettings(next: PrepPhaseSettings) {
    setPrepSettings(next);
    setPrepPhaseSettings(next);
    setPrepSettingsManuallySet(true);
    setPrepManuallySet(true);
  }

  // Hands the prep lever back to the curriculum — same "clear the manual
  // flag, immediately reflect what auto currently means" shape as
  // resetDurationToAuto above.
  function resetPrepToAuto() {
    setPrepSettingsManuallySet(false);
    setPrepManuallySet(false);
    setPrepSettings({
      enabled: true,
      mode: curriculumLevelToPrepMode(curriculumLevel),
      fixedSeconds: curriculumLevelToPrepSeconds(curriculumLevel),
    });
  }

  function updateWarmUpEnabled(next: boolean) {
    setWarmUpEnabledState(next);
    setWarmUpEnabled(next);
  }

  function updateConciseModeSeconds(next: number) {
    setConciseModeSecondsState(next);
    setConciseModeSeconds(next);
  }

  // Both "Start Recording" and "Free Record" go through this — when Plan
  // Your Point is enabled in Settings, detour through the planning screen
  // first; otherwise go straight to Recording as before.
  function startPromptRecording(promptToUse: Prompt) {
    if (getPlanYourPointEnabled()) {
      navigation.navigate("PlanYourPoint", { prompt: promptToUse });
    } else {
      navigation.navigate("Recording", { kind: "prompt", prompt: promptToUse });
    }
  }

  // The Concise chip bypasses Plan Your Point entirely, same as the old
  // standalone "Concise Mode" button did — a quick constrained drill, not
  // the kind of response worth planning first.
  function handlePrimaryPress() {
    if (!prompt) return;
    if (conciseModeOn) {
      navigation.navigate("Recording", { kind: "prompt", prompt, conciseSeconds: conciseModeSeconds });
    } else {
      startPromptRecording(prompt);
    }
  }

  if (!prompt) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
      </ScreenContainer>
    );
  }

  const primaryLabelBase = alreadyPracticedToday ? "Practice Again" : "Start Recording";
  const primaryLabel = conciseModeOn ? `${primaryLabelBase} · Concise ${conciseModeSeconds}s` : primaryLabelBase;

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.eyebrow}>Practice anything</Text>
          <Text style={styles.appName}>Free practice</Text>
          {streak.currentStreak > 0 ? (
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={14} color={colors.warning} />
              <Text style={styles.streakNumber}>{streak.currentStreak}</Text>
              <Text style={styles.streakText}>
                day streak{streak.currentStreak === streak.longestStreak ? " · personal best" : ""}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          hitSlop={12}
          style={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.middle}>
        <HeroCard
          contentStyle={styles.promptCard}
          accent={colorForCategory(prompt.category, colors).fg}
          accentSecondary={colors.violet}
        >
          <View style={styles.promptCardHeader}>
            <Badge label={prompt.category} {...colorForCategory(prompt.category, colors)} />
            <View style={styles.promptCardHeaderRight}>
              {/* Small tappable chip — opens the full "why" + manual
                  override on CurriculumScreen. Reflects the tier that's
                  already filtering the prompt pool above, not just a
                  decoration. */}
              <Pressable
                onPress={() => navigation.navigate("Curriculum")}
                style={styles.levelChip}
                accessibilityRole="button"
                accessibilityLabel={`Curriculum level ${curriculumLevel}, ${difficultyTierLabel(levelToDifficultyTier(curriculumLevel))}. View details`}
              >
                <Text style={styles.levelChipText}>
                  Level {curriculumLevel} · {difficultyTierLabel(levelToDifficultyTier(curriculumLevel))}
                </Text>
              </Pressable>
              <Pressable
                onPress={rerollPrompt}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Get a different prompt"
              >
                <Ionicons name="dice-outline" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.promptText}>{prompt.text}</Text>

          {/* Folds the old standalone "Concise Mode" button into the hero
              card as a toggle chip — flips what the primary button below
              does instead of competing with it for attention. */}
          <Pressable
            onPress={() => setConciseModeOn((on) => !on)}
            style={[styles.conciseChip, conciseModeOn && styles.conciseChipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: conciseModeOn }}
            accessibilityLabel={`Concise mode, ${conciseModeSeconds} seconds, ${conciseModeOn ? "on" : "off"}`}
          >
            <Ionicons name="timer-outline" size={14} color={conciseModeOn ? colors.onAccent : colors.textSecondary} />
            <Text style={[styles.conciseChipText, conciseModeOn && styles.conciseChipTextOn]}>
              Concise · {conciseModeSeconds}s
            </Text>
          </Pressable>
        </HeroCard>

        {alreadyPracticedToday ? (
          <Banner
            tone="success"
            text="You've already practiced today — recording again just adds another session."
          />
        ) : (
          <Text style={styles.hint}>Take a breath, then respond in 1–5 minutes. There's no wrong answer.</Text>
        )}
      </View>

      <View style={[styles.actions, { paddingBottom: tabBarInset }]}>
        <View style={styles.primaryRow}>
          <PrimaryButton label={primaryLabel} onPress={handlePrimaryPress} style={styles.primaryButton} />
          <Pressable
            onPress={() => setSheetVisible(true)}
            style={styles.sessionOptionsButton}
            accessibilityRole="button"
            accessibilityLabel="Session options"
          >
            <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => startPromptRecording(FREE_RECORD_PROMPT)}
          style={styles.freeLinkWrap}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Free record, no prompt"
        >
          <Text style={styles.freeLinkText}>Free Record instead →</Text>
        </Pressable>

        <View style={styles.shelf}>
          <ShelfCard icon="document-text-outline" label="Mark it up" onPress={() => navigation.navigate("MarkItUp")} />
          <ShelfCard icon="library-outline" label="Prompt Library" onPress={() => navigation.navigate("PromptLibrary")} />
          <ShelfCard icon="flash-outline" label="Tongue-Twister Drills" onPress={() => navigation.navigate("Drills")} />
        </View>
      </View>

      <SessionOptionsSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        warmUpEnabled={warmUpEnabled}
        onWarmUpEnabledChange={updateWarmUpEnabled}
        prepSettings={prepSettings}
        onPrepSettingsChange={updatePrepSettings}
        prepManuallySet={prepManuallySet}
        onResetPrepToAuto={resetPrepToAuto}
        durationSettings={durationSettings}
        onDurationSettingsChange={updateDurationSettings}
        durationManuallySet={durationManuallySet}
        onResetDurationToAuto={resetDurationToAuto}
        curriculumLevel={curriculumLevel}
        conciseModeSeconds={conciseModeSeconds}
        onConciseModeSecondsChange={updateConciseModeSeconds}
      />
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { justifyContent: "space-between" },
  actions: { gap: spacing.sm },
  centered: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  settingsButton: { padding: spacing.xs },
  promptCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  promptCardHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  levelChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleFill,
  },
  levelChipText: { color: colors.textSecondary, fontSize: typography.caption - 1, fontWeight: "700" },
  eyebrow: { color: colors.textSecondary, fontSize: typography.body },
  appName: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  back: { marginLeft: -6, marginBottom: spacing.xs },
  streakRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs, marginTop: spacing.xs },
  streakNumber: { color: colors.warning, fontSize: typography.body, fontFamily: fontDisplay.bold },
  streakText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  middle: { flex: 1, justifyContent: "center", gap: spacing.lg },
  promptCard: { gap: spacing.md },
  promptText: { color: colors.textPrimary, fontSize: typography.headline, fontWeight: "600", lineHeight: 36 },
  hint: { color: colors.textMuted, fontSize: typography.body, textAlign: "center" },

  conciseChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleFill,
  },
  conciseChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  conciseChipText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "700" },
  conciseChipTextOn: { color: colors.onAccent },

  primaryRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  primaryButton: { flex: 1 },
  sessionOptionsButton: {
    width: 54,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  freeLinkWrap: { alignSelf: "center", paddingVertical: spacing.xs },
  freeLinkText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600", textDecorationLine: "underline" },

  shelf: { flexDirection: "row", gap: spacing.sm },
  shelfCard: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shelfCardPressed: { opacity: 0.7 },
  shelfCardLabel: { color: colors.textPrimary, fontSize: typography.caption - 1, fontWeight: "700", textAlign: "center", lineHeight: 15 },
}));
