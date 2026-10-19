import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { darkColors as colors, radii, spacing, font } from "../../theme/theme";

interface NotesTeleprompterOverlayProps {
  notes: string;
  isRecording: boolean;
  elapsedSeconds: number;
  targetSeconds: number;
  // Below the close and preview buttons.
  top: number;
}

const FONT_SIZE = 22;
const LINE_HEIGHT = 34;
// A long set of notes scrolls so you reach the end near the end of the take.
const FINISH_AT = 0.85;

// Your research notes over the camera like a teleprompter: large light text
// on a semi-transparent dark panel, high on the screen so reading them keeps
// your eyes near the lens. It sits over the live preview, or over the blank
// screen when the preview is hidden. Tap it to fold it away and back; a
// long note scrolls on its own, and your own scrolling takes over.
export function NotesTeleprompterOverlay({ notes, isRecording, elapsedSeconds, targetSeconds, top }: NotesTeleprompterOverlayProps) {
  const [folded, setFolded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sizes = useRef({ content: 0, view: 0 });
  const takenOver = useRef(false);

  useEffect(() => {
    if (!isRecording) takenOver.current = false;
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording || folded || takenOver.current) return;
    const overflow = sizes.current.content - sizes.current.view;
    if (overflow <= 0 || targetSeconds <= 0) return;
    const progress = Math.min(1, elapsedSeconds / (targetSeconds * FINISH_AT));
    scrollRef.current?.scrollTo({ y: overflow * progress, animated: true });
  }, [elapsedSeconds, isRecording, folded, targetSeconds]);

  if (!notes.trim()) return null;
  if (folded) {
    return (
      <Pressable onPress={() => setFolded(false)} style={[styles.pill, { top }]} accessibilityRole="button" accessibilityLabel="Show notes">
        <Ionicons name="reader-outline" size={16} color={colors.textPrimary} />
        <Text style={styles.pillText}>Notes</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.panel, { top }]}>
      <Pressable onPress={() => setFolded(true)} style={styles.fold} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide notes">
        <Ionicons name="chevron-up" size={18} color={colors.textSecondary} />
      </Pressable>
      <ScrollView
        ref={scrollRef}
        onLayout={(e) => {
          sizes.current.view = e.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_, h) => {
          sizes.current.content = h;
        }}
        onScrollBeginDrag={() => {
          takenOver.current = true;
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.text}>{notes.trim()}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    maxHeight: "34%",
    borderRadius: radii.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(10,10,8,0.62)",
  },
  fold: { alignSelf: "center", paddingBottom: 2 },
  text: { color: colors.textPrimary, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, ...font("500") },
  pill: {
    position: "absolute",
    left: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: "rgba(10,10,8,0.62)",
  },
  pillText: { color: colors.textPrimary, fontSize: 14, ...font("600") },
});
