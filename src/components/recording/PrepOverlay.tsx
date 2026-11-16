import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Txt } from "../common/Txt";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { mmss } from "../../domain/prepTimer";
import { darkColors as colors, radii, spacing } from "../../theme/theme";
import { typeScale } from "../../theme/tokens";

interface PrepOverlayProps {
  promptText: string;
  // What the prompt asks for ("Closing only"), shown above it.
  taskLabel?: string | null;
  // Questions to think through during prep (hidden once recording starts).
  notes?: string[];
  remainingSeconds: number;
  // "short": a brief countdown that starts recording by itself. "research":
  // minutes, with notes and a web search, that waits for you.
  mode: "short" | "research";
  timeUp: boolean;
  researchNotes: string;
  onChangeNotes: (text: string) => void;
  notesOnScreen: boolean;
  onToggleNotesOnScreen: (value: boolean) => void;
  // Shown on topics where looking something up first helps.
  researchSuggested?: boolean;
  onSearch: () => void;
  onAddTime: () => void;
  onResearch: () => void;
  onStart: () => void;
  // Turn prep off and go back to the ready screen.
  onNoPrep: () => void;
  onClose: () => void;
  topInset: number;
  bottomInset: number;
}

// Shown while preparing, before recording. Sits above the live camera
// preview, which keeps running underneath. In its short form it counts down
// and starts recording; in research form it's a notepad with a clock, and
// recording starts when you say so.
export function PrepOverlay(props: PrepOverlayProps) {
  const { mode, topInset, bottomInset, onClose } = props;
  return (
    <View style={styles.container} pointerEvents="box-none">
      {mode === "research" ? <View style={styles.researchBackdrop} pointerEvents="none" /> : null}
      <Pressable onPress={onClose} style={[styles.closeButton, { top: topInset }]} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
        <Ionicons name="close" size={22} color={colors.textPrimary} />
      </Pressable>
      {mode === "research" ? <ResearchBody {...props} /> : <ShortBody {...props} bottomInset={bottomInset} />}
    </View>
  );
}

function PromptCard({ promptText, taskLabel, notes, label }: Pick<PrepOverlayProps, "promptText" | "taskLabel" | "notes"> & { label: string }) {
  return (
    <View style={styles.top}>
      <Txt variant="footnote" weight="600" style={styles.label}>{label}</Txt>
      {taskLabel ? <Txt variant="footnote" weight="500" style={styles.task}>{taskLabel}</Txt> : null}
      <Txt variant="quote" style={styles.promptText}>{promptText}</Txt>
      {notes?.length ? (
        <View style={styles.notes}>
          {notes.map((n) => (
            <Txt variant="callout" key={n} style={styles.noteText}>
              · {n}
            </Txt>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ShortBody({ promptText, taskLabel, notes, remainingSeconds, researchSuggested, onAddTime, onResearch, onStart, onNoPrep, bottomInset }: PrepOverlayProps) {
  return (
    <>
      <PromptCard promptText={promptText} taskLabel={taskLabel} notes={notes} label="Get ready" />

      <View style={styles.countdownWrap} pointerEvents="none">
        <Txt variant="display" tabular style={styles.countdown}>{remainingSeconds}</Txt>
      </View>

      <View style={[styles.shortControls, { paddingBottom: bottomInset }]}>
        {researchSuggested ? <Txt variant="footnote" weight="500" style={styles.suggest}>New topic? Research helps.</Txt> : null}
        <View style={styles.row}>
          <Chip label="+30 s" icon="add" onPress={onAddTime} />
          <Chip label="Research" icon="search" onPress={onResearch} emphasized={researchSuggested} />
          <Chip label="No prep" onPress={onNoPrep} />
        </View>
        <Pressable onPress={onStart} style={styles.primary} accessibilityRole="button">
          <Txt variant="headline" style={styles.primaryText}>Start now</Txt>
        </Pressable>
      </View>
    </>
  );
}

function ResearchBody({
  promptText,
  taskLabel,
  remainingSeconds,
  timeUp,
  researchNotes,
  onChangeNotes,
  notesOnScreen,
  onToggleNotesOnScreen,
  onSearch,
  onAddTime,
  onStart,
  onNoPrep,
  topInset,
  bottomInset,
}: PrepOverlayProps) {
  return (
    <View style={styles.researchWrap}>
      <KeyboardAwareScrollView bottomOffset={24}
        contentContainerStyle={[styles.researchContent, { paddingTop: topInset + 56, paddingBottom: bottomInset + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PromptCard promptText={promptText} taskLabel={taskLabel} label="Research" />

        <View style={styles.clockRow}>
          <Txt variant="display" tabular style={[styles.clock, timeUp && styles.clockUp]} accessibilityLabel={timeUp ? "Time is up" : `${mmss(remainingSeconds)} left`}>
            {timeUp ? "Time's up" : mmss(remainingSeconds)}
          </Txt>
          <Chip label="+30 s" icon="add" onPress={onAddTime} />
        </View>

        <TextInput
          value={researchNotes}
          onChangeText={onChangeNotes}
          placeholder="Your notes: a point, two reasons, one example…"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          style={styles.notesInput}
          accessibilityLabel="Your notes"
        />

        <Pressable onPress={onSearch} style={styles.searchButton} accessibilityRole="button" accessibilityHint="Opens a web search for this topic in your browser">
          <Ionicons name="search" size={18} color={colors.textPrimary} />
          <Txt variant="headline" style={styles.searchText}>Search the web</Txt>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </Pressable>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Txt variant="callout" weight="600" style={styles.toggleTitle}>Show my notes while I record</Txt>
            <Txt variant="footnote" style={styles.toggleSub}>Like a teleprompter, over the camera. Off by default: real speaking doesn't have one.</Txt>
          </View>
          <Switch value={notesOnScreen} onValueChange={onToggleNotesOnScreen} trackColor={{ true: colors.success, false: colors.switchTrackOff }} thumbColor={colors.textPrimary} />
        </View>

        <Pressable onPress={onStart} style={styles.primary} accessibilityRole="button">
          <Txt variant="headline" style={styles.primaryText}>{timeUp ? "Start recording" : "I'm ready — record"}</Txt>
        </Pressable>
        <Pressable onPress={onNoPrep} style={styles.ghost} accessibilityRole="button">
          <Txt variant="callout" weight="500" style={styles.ghostText}>No prep</Txt>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Chip({ label, icon, onPress, emphasized }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; emphasized?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, emphasized && styles.chipEmphasized]} accessibilityRole="button" accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={16} color={colors.textPrimary} /> : null}
      <Txt variant="subhead" weight="600" style={styles.chipText}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.xxl,
  },
  researchBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,10,8,0.9)" },
  closeButton: {
    position: "absolute",
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(10,10,8,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  // A dark backdrop keeps the prompt readable over a bright room.
  top: {
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl + spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
    borderRadius: radii.lg,
    backgroundColor: "rgba(10,10,8,0.62)",
  },
  label: { color: colors.textSecondary },
  task: { color: colors.textSecondary },
  promptText: { color: colors.textPrimary, textAlign: "center" },
  notes: { marginTop: spacing.xs, gap: 4, alignSelf: "stretch" },
  noteText: { color: colors.textPrimary },
  countdownWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,8,0.45)",
  },
  // A big digit sized to fill the ring, so size and line height are set here on top of the display variant.
  countdown: { color: colors.textPrimary, fontSize: 60, lineHeight: 68 },
  shortControls: { alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg },
  suggest: { color: colors.textSecondary },
  row: { flexDirection: "row", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: "rgba(10,10,8,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  chipEmphasized: { borderColor: "rgba(255,255,255,0.7)" },
  chipText: { color: colors.textPrimary },
  primary: {
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.pill,
  },
  primaryText: { color: colors.onAccent },
  ghost: { alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  ghostText: { color: colors.textSecondary },
  researchWrap: { alignSelf: "stretch", flex: 1 },
  researchContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
  clockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // A big digit sized to the row, so size and line height are set here on top of the display variant.
  clock: { color: colors.textPrimary, fontSize: 44, lineHeight: 50 },
  clockUp: { color: colors.warning },
  notesInput: {
    minHeight: 150,
    maxHeight: 260,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.textPrimary,
    ...typeScale.body,
  },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  searchText: { color: colors.textPrimary },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { color: colors.textPrimary },
  toggleSub: { color: colors.textSecondary },
});
