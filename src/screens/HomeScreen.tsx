import { useCallback, useState } from "react";
import { Skeleton, SkeletonCard, SkeletonRows } from "../components/common/Skeleton";
import { GuideTip, TourTarget } from "../components/common/GuideTip";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { HeroCard } from "../components/common/HeroCard";
import { IconButton } from "../components/common/IconButton";
import { PressableScale } from "../components/common/PressableScale";
import { Badge } from "../components/common/Badge";
import { Banner } from "../components/common/Banner";
import { SessionOptionsSheet } from "../components/home/SessionOptionsSheet";
import { AVOID_REPEAT_LAST_N, pickRandomPrompt, pickTodaysPrompt } from "../domain/pickTodaysPrompt";
import { FREE_RECORD_PROMPT } from "../data/topics";
import type { StreakResult } from "../domain/streaks";
import { getDrillLevel, getStreakState } from "../services/db/progressRepo";
import { colorForCategory } from "../domain/categoryColor";
import type { PrepPhaseSettings, RecordingDurationSettings } from "../domain/recordingSettings";
import { DEFAULT_PREP_PHASE_SETTINGS, DEFAULT_RECORDING_DURATION_SETTINGS } from "../domain/recordingSettings";
import { filterPromptsByTier, takeDurationSeconds, takePrepSeconds, takeTier, tierLabel } from "../domain/difficulty/scale";
import { getAllPrompts } from "../services/db/promptsRepo";
import { getRecentlyUsedPromptIds, getTodaysSession } from "../services/db/sessionsRepo";
import { hasPracticeMarker } from "../services/db/practiceDaysRepo";
import { todayISODate } from "../utils/dateUtils";
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
import { taskLabel, taskOf } from "../domain/promptTask";
import { radii, spacing } from "../theme/theme";
import { Txt } from "../components/common/Txt";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const EMPTY_STREAK: StreakResult = { currentStreak: 0, longestStreak: 0 };

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
    <PressableScale onPress={onPress} style={styles.shelfCard} scaleTo={0.95} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.shelfIcon}>
        <Ionicons name={icon} size={19} color={colors.textPrimary} />
      </View>
      <Txt variant="caption1" weight="600" align="center">{label}</Txt>
    </PressableScale>
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
  // The take difficulty, 1 to 10 (domain/difficulty/scale.ts): today's prompt
  // tier, prep and length. Refreshed on every focus.
  const [takeLevel, setTakeLevelState] = useState(1);
  // Ephemeral, per-visit — unlike the settings above this isn't a standing
  // preference, it's "make my next recording concise", so it isn't persisted
  // and resets whenever Home regains focus.
  const [conciseModeOn, setConciseModeOn] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [prompts, excludeIds, level] = await Promise.all([getAllPrompts(), getRecentlyUsedPromptIds(AVOID_REPEAT_LAST_N), getDrillLevel("rep")]);
          setTakeLevelState(level);

          const tierPool = filterPromptsByTier(prompts, takeTier(level));
          setAllPrompts(tierPool);
          setRecentPromptIds(excludeIds);
          setPrompt(pickTodaysPrompt(tierPool, excludeIds));

          if (!getRecordingDurationManuallySet()) {
            setDurationSettings({ mode: "fixed", fixedSeconds: takeDurationSeconds(level) });
          }
          if (!getPrepSettingsManuallySet()) {
            setPrepSettings({ enabled: takePrepSeconds(level) > 0, mode: "fixed", fixedSeconds: Math.max(takePrepSeconds(level), 5) });
          }
        } catch {
          const prompts = await getAllPrompts();
          setAllPrompts(prompts);
          setPrompt(pickTodaysPrompt(prompts));
        }
      })();

      // A day whose take was deleted still counts as practiced (the marker).
      Promise.all([getTodaysSession(), hasPracticeMarker(todayISODate())])
        .then(([session, marker]) => setAlreadyPracticedToday(session?.status === "done" || marker))
        .catch(() => setAlreadyPracticedToday(false));

      getStreakState()
        .then(setStreak)
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
      return pickRandomPrompt(allPrompts, excludeIds, current?.category);
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
    setDurationSettings({ mode: "fixed", fixedSeconds: takeDurationSeconds(takeLevel) });
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
    setPrepSettings({ enabled: takePrepSeconds(takeLevel) > 0, mode: "fixed", fixedSeconds: Math.max(takePrepSeconds(takeLevel), 5) });
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
      <ScreenContainer style={styles.skeleton}>
        <Skeleton height={28} width="55%" />
        <SkeletonCard lines={3} />
        <SkeletonRows count={3} />
      </ScreenContainer>
    );
  }

  const primaryLabelBase = alreadyPracticedToday ? "Practice Again" : "Start Recording";
  const primaryLabel = conciseModeOn ? `${primaryLabelBase} · Concise ${conciseModeSeconds}s` : primaryLabelBase;

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerBar}>
          <IconButton icon="chevron-back" onPress={() => navigation.goBack()} accessibilityLabel="Back" size={38} />
        </View>
        <Txt variant="footnote" tone="secondary" weight="500">Practice anything</Txt>
        <Txt variant="largeTitle">Free practice</Txt>
        {streak.currentStreak > 0 ? (
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={14} color={colors.warning} />
            <Txt variant="footnote" tone="secondary" weight="600">
              {streak.currentStreak}-day streak{streak.currentStreak === streak.longestStreak ? " · personal best" : ""}
            </Txt>
          </View>
        ) : null}
      </View>

      <View style={styles.middle}>
        <TourTarget id="practice.start">
        <HeroCard
          contentStyle={styles.promptCard}
          accent={colorForCategory(prompt.category, colors).fg}
          accentSecondary={colors.violet}
        >
          <View style={styles.promptCardHeader}>
            <View style={styles.promptBadges}>
              <Badge label={prompt.category} {...colorForCategory(prompt.category, colors)} />
              {taskLabel(taskOf(prompt)) ? <Badge label={taskLabel(taskOf(prompt))!} /> : null}
            </View>
            <View style={styles.promptCardHeaderRight}>
              {/* The tier that's filtering the prompt pool above, from the take
                  difficulty. Says "prompts", not "level": your level is the
                  speaker level (LevelScreen). */}
              <View style={styles.levelChip} accessible accessibilityLabel={`${tierLabel(takeTier(takeLevel))} prompts, difficulty ${Math.floor(takeLevel)}`}>
                <Txt variant="caption1" tone="secondary" weight="600">{tierLabel(takeTier(takeLevel))} prompts</Txt>
              </View>
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
          <Txt variant="quote">{prompt.text}</Txt>

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
            <Txt variant="footnote" tone={conciseModeOn ? "onAccent" : "secondary"} weight="600">
              Concise · {conciseModeSeconds}s
            </Txt>
          </Pressable>
        </HeroCard>
        </TourTarget>

        {alreadyPracticedToday ? (
          <Banner
            tone="success"
            text="You've already practiced today — recording again just adds another session."
          />
        ) : (
          <Txt variant="callout" tone="muted" align="center">Take a breath, then respond in 1–5 minutes. There's no wrong answer.</Txt>
        )}
      </View>

      <View style={[styles.actions, { paddingBottom: tabBarInset }]}>
        <View style={styles.primaryRow}>
          <PrimaryButton label={primaryLabel} onPress={handlePrimaryPress} style={styles.primaryButton} />
          <IconButton icon="options-outline" onPress={() => setSheetVisible(true)} accessibilityLabel="Session options" size={56} />
        </View>

        <Pressable
          onPress={() => startPromptRecording(FREE_RECORD_PROMPT)}
          style={styles.freeLinkWrap}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Free record, no prompt"
        >
          <Txt variant="subhead" tone="secondary" weight="500">Or free record, no prompt</Txt>
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
        takeLevel={takeLevel}
        conciseModeSeconds={conciseModeSeconds}
        onConciseModeSecondsChange={updateConciseModeSeconds}
      />
      <GuideTip id="practice" />
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { justifyContent: "space-between" },
  actions: { gap: spacing.sm },
  skeleton: { gap: 16, paddingTop: 24 },
  header: { gap: 2 },
  headerBar: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  settingsButton: { padding: spacing.xs },
  promptCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  promptCardHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  promptBadges: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, flexShrink: 1, flexWrap: "wrap" },
  levelChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.subtleFill,
  },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  middle: { flex: 1, justifyContent: "center", gap: spacing.lg },
  promptCard: { gap: spacing.md },

  conciseChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.subtleFill,
  },
  conciseChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },

  primaryRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  primaryButton: { flex: 1 },

  freeLinkWrap: { alignSelf: "center", paddingVertical: spacing.xs },

  shelf: { flexDirection: "row", gap: spacing.sm },
  shelfCard: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.lg - 4,
    backgroundColor: colors.surface,
  },
  shelfIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentMuted },
}));
