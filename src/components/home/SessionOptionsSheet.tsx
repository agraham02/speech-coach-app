import { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LabeledSlider } from "../common/LabeledSlider";
import type { PrepPhaseSettings, RecordingDurationSettings } from "../../domain/recordingSettings";
import {
  CONCISE_DURATION_MAX_SECONDS,
  CONCISE_DURATION_MIN_SECONDS,
  CONCISE_DURATION_STEP_SECONDS,
  PREP_DURATION_MAX_SECONDS,
  PREP_DURATION_MIN_SECONDS,
  PREP_DURATION_STEP_SECONDS,
  RECORDING_DURATION_MAX_SECONDS,
  RECORDING_DURATION_MIN_SECONDS,
  RECORDING_DURATION_STEP_SECONDS,
} from "../../domain/recordingSettings";
import { radii, spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface SessionOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  warmUpEnabled: boolean;
  onWarmUpEnabledChange: (value: boolean) => void;
  prepSettings: PrepPhaseSettings;
  onPrepSettingsChange: (value: PrepPhaseSettings) => void;
  // Same "auto vs. explicit choice" distinction as durationManuallySet below,
  // for the Prep phase length/randomize controls.
  prepManuallySet: boolean;
  onResetPrepToAuto: () => void;
  durationSettings: RecordingDurationSettings;
  onDurationSettingsChange: (value: RecordingDurationSettings) => void;
  // Whether the length below is the curriculum's auto-computed value or a
  // choice the user explicitly made — see curriculum.ts's plan notes on
  // "auto duration" vs. "I picked my own" being mutually exclusive.
  durationManuallySet: boolean;
  onResetDurationToAuto: () => void;
  curriculumLevel: number;
  conciseModeSeconds: number;
  onConciseModeSecondsChange: (value: number) => void;
}

function minutesLabel(seconds: number): string {
  return `${seconds / 60} min`;
}

function secondsLabel(seconds: number): string {
  return `${seconds}s`;
}

// A hand-rolled slide-up sheet — same Modal + Reanimated pattern as
// FilterSheet.tsx (proven on this exact Expo/Reanimated stack; @gorhom/
// bottom-sheet failed to open in a different project on this same stack, see
// gorhom-bottom-sheet-expo-issue memory). Holds the four session-level
// settings that used to live buried in the general Settings screen — Warm-up,
// Prep phase, Recording length, and Concise mode length — moved here, next
// to the action they actually affect, per the design memo.
export function SessionOptionsSheet({
  visible,
  onClose,
  warmUpEnabled,
  onWarmUpEnabledChange,
  prepSettings,
  onPrepSettingsChange,
  prepManuallySet,
  onResetPrepToAuto,
  durationSettings,
  onDurationSettingsChange,
  durationManuallySet,
  onResetDurationToAuto,
  curriculumLevel,
  conciseModeSeconds,
  onConciseModeSecondsChange,
}: SessionOptionsSheetProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 220 });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 320 }] }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close session options"
        />
      </Animated.View>

      <Animated.View style={[styles.panel, { maxHeight: "80%" }, panelStyle]}>
        <View style={styles.handle} />
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Session options</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg, gap: spacing.lg }}
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Warm-up</Text>
              <Text style={styles.rowSubtitle}>Breathing + easy onset before you start</Text>
            </View>
            <Switch
              value={warmUpEnabled}
              onValueChange={onWarmUpEnabledChange}
              trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
            />
          </View>

          <View style={[styles.row, styles.divider]}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Prep phase</Text>
              <Text style={styles.rowSubtitle}>Countdown to brainstorm before recording</Text>
            </View>
            <Switch
              value={prepSettings.enabled}
              onValueChange={(enabled) => onPrepSettingsChange({ ...prepSettings, enabled })}
              trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
            />
          </View>
          {prepSettings.enabled ? (
            <View style={styles.subSection}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Prep time</Text>
                {!prepManuallySet ? (
                  <View style={styles.autoBadge}>
                    <Text style={styles.autoBadgeText}>Auto · Level {curriculumLevel}</Text>
                  </View>
                ) : null}
              </View>
              <LabeledSlider
                label="Length"
                value={prepSettings.fixedSeconds}
                minimumValue={PREP_DURATION_MIN_SECONDS}
                maximumValue={PREP_DURATION_MAX_SECONDS}
                step={PREP_DURATION_STEP_SECONDS}
                formatValue={secondsLabel}
                disabled={prepSettings.mode === "random"}
                onChange={(fixedSeconds) => onPrepSettingsChange({ ...prepSettings, mode: "fixed", fixedSeconds })}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Randomize each session</Text>
                <Switch
                  value={prepSettings.mode === "random"}
                  onValueChange={(isRandom) =>
                    onPrepSettingsChange({ ...prepSettings, mode: isRandom ? "random" : "fixed" })
                  }
                  trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
                />
              </View>
              {prepManuallySet ? (
                <Pressable onPress={onResetPrepToAuto} hitSlop={8}>
                  <Text style={styles.linkText}>Reset to auto (matches your curriculum level)</Text>
                </Pressable>
              ) : (
                <Text style={styles.rowSubtitle}>
                  Matches your current curriculum level — shrinks and randomizes as you level up. Adjusting below
                  sets your own prep time instead.
                </Text>
              )}
            </View>
          ) : null}

          <View style={[styles.subSection, styles.divider]}>
            <View style={styles.row}>
              <Text style={styles.rowTitle}>Recording length</Text>
              {!durationManuallySet ? (
                <View style={styles.autoBadge}>
                  <Text style={styles.autoBadgeText}>Auto · Level {curriculumLevel}</Text>
                </View>
              ) : null}
            </View>
            <LabeledSlider
              label="Length"
              value={durationSettings.fixedSeconds}
              minimumValue={RECORDING_DURATION_MIN_SECONDS}
              maximumValue={RECORDING_DURATION_MAX_SECONDS}
              step={RECORDING_DURATION_STEP_SECONDS}
              formatValue={minutesLabel}
              disabled={durationSettings.mode === "random"}
              onChange={(fixedSeconds) => onDurationSettingsChange({ mode: "fixed", fixedSeconds })}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Randomize each session</Text>
              <Switch
                value={durationSettings.mode === "random"}
                onValueChange={(isRandom) =>
                  onDurationSettingsChange({ ...durationSettings, mode: isRandom ? "random" : "fixed" })
                }
                trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
              />
            </View>
            {durationManuallySet ? (
              <Pressable onPress={onResetDurationToAuto} hitSlop={8}>
                <Text style={styles.linkText}>Reset to auto (matches your curriculum level)</Text>
              </Pressable>
            ) : (
              <Text style={styles.rowSubtitle}>
                Matches your current curriculum level — adjusting below sets your own length instead.
              </Text>
            )}
          </View>

          <View style={[styles.subSection, styles.divider]}>
            <Text style={styles.rowTitle}>Concise mode length</Text>
            <Text style={styles.rowSubtitle}>How long the Concise chip on Home gives you to make one point.</Text>
            <LabeledSlider
              label="Length"
              value={conciseModeSeconds}
              minimumValue={CONCISE_DURATION_MIN_SECONDS}
              maximumValue={CONCISE_DURATION_MAX_SECONDS}
              step={CONCISE_DURATION_STEP_SECONDS}
              formatValue={secondsLabel}
              onChange={onConciseModeSecondsChange}
            />
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlayScrim },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.xs },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  panelTitle: { color: colors.textPrimary, fontSize: typography.title, ...font("700") },
  doneText: { color: colors.accent, fontSize: typography.body, ...font("600") },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, ...font("700") },
  rowSubtitle: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  subSection: { gap: spacing.sm },
  divider: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { ...font("400"), color: colors.textSecondary, fontSize: typography.body },
  autoBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
  },
  autoBadgeText: { color: colors.accent, fontSize: typography.caption - 1, ...font("700") },
  linkText: { color: colors.accent, fontSize: typography.caption, ...font("600") },
}));
