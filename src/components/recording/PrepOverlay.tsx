import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { mmss } from "../../domain/prepTimer";
import { darkColors as colors, fontDisplay, radii, spacing, typography, font } from "../../theme/theme";

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
      <Text style={styles.label}>{label}</Text>
      {taskLabel ? <Text style={styles.task}>{taskLabel}</Text> : null}
      <Text style={styles.promptText}>{promptText}</Text>
      {notes?.length ? (
        <View style={styles.notes}>
          {notes.map((n) => (
            <Text key={n} style={styles.noteText}>
              · {n}
            </Text>
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
        <Text style={styles.countdown}>{remainingSeconds}</Text>
      </View>

      <View style={[styles.shortControls, { paddingBottom: bottomInset }]}>
        {researchSuggested ? <Text style={styles.suggest}>New topic? Research helps.</Text> : null}
        <View style={styles.row}>
          <Chip label="+30 s" icon="add" onPress={onAddTime} />
          <Chip label="Research" icon="search" onPress={onResearch} emphasized={researchSuggested} />
          <Chip label="No prep" onPress={onNoPrep} />
        </View>
        <Pressable onPress={onStart} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>Start now</Text>
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
    <KeyboardAvoidingView style={styles.researchWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.researchContent, { paddingTop: topInset + 56, paddingBottom: bottomInset + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PromptCard promptText={promptText} taskLabel={taskLabel} label="Research" />

        <View style={styles.clockRow}>
          <Text style={[styles.clock, timeUp && styles.clockUp]} accessibilityLabel={timeUp ? "Time is up" : `${mmss(remainingSeconds)} left`}>
            {timeUp ? "Time's up" : mmss(remainingSeconds)}
          </Text>
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
          <Text style={styles.searchText}>Search the web</Text>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </Pressable>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Show my notes while I record</Text>
            <Text style={styles.toggleSub}>Like a teleprompter, over the camera. Off by default: real speaking doesn't have one.</Text>
          </View>
          <Switch value={notesOnScreen} onValueChange={onToggleNotesOnScreen} trackColor={{ true: colors.success, false: colors.switchTrackOff }} thumbColor={colors.textPrimary} />
        </View>

        <Pressable onPress={onStart} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>{timeUp ? "Start recording" : "I'm ready — record"}</Text>
        </Pressable>
        <Pressable onPress={onNoPrep} style={styles.ghost} accessibilityRole="button">
          <Text style={styles.ghostText}>No prep</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, icon, onPress, emphasized }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; emphasized?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, emphasized && styles.chipEmphasized]} accessibilityRole="button" accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={16} color={colors.textPrimary} /> : null}
      <Text style={styles.chipText}>{label}</Text>
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
  label: { color: colors.textSecondary, fontSize: 13, ...font("600") },
  task: { color: colors.textSecondary, fontSize: 13, ...font("500") },
  promptText: { color: colors.textPrimary, fontFamily: fontDisplay.spoken, fontSize: 24, lineHeight: 31, letterSpacing: -0.3, textAlign: "center" },
  notes: { marginTop: spacing.xs, gap: 4, alignSelf: "stretch" },
  noteText: { ...font("400"), color: colors.textPrimary, fontSize: typography.body, lineHeight: 21 },
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
  countdown: { color: colors.textPrimary, fontFamily: fontDisplay.title, fontSize: 60, lineHeight: 68, letterSpacing: -2, fontVariant: ["tabular-nums"] },
  shortControls: { alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg },
  suggest: { color: colors.textSecondary, fontSize: 13, ...font("500") },
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
  chipText: { color: colors.textPrimary, fontSize: 14, ...font("600") },
  primary: {
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.pill,
  },
  primaryText: { color: colors.onAccent, fontSize: 16, ...font("600") },
  ghost: { alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  ghostText: { color: colors.textSecondary, fontSize: 15, ...font("500") },
  researchWrap: { alignSelf: "stretch", flex: 1 },
  researchContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
  clockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clock: { color: colors.textPrimary, fontFamily: fontDisplay.title, fontSize: 44, lineHeight: 50, letterSpacing: -1.5, fontVariant: ["tabular-nums"] },
  clockUp: { color: colors.warning },
  notesInput: {
    minHeight: 150,
    maxHeight: 260,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.textPrimary,
    fontSize: 17,
    lineHeight: 24,
    ...font("400"),
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
  searchText: { color: colors.textPrimary, fontSize: 16, ...font("600") },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { color: colors.textPrimary, fontSize: 15, ...font("600") },
  toggleSub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, ...font("400") },
});
