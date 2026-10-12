import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { splitSentences } from "../domain/cadence/sentences";
import { autoMarkText } from "../services/onDeviceLlm/autoMarkText";
import { saveMarkedText } from "../services/db/markedTextsRepo";
import { showGlobalToast } from "../components/common/ToastProvider";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "AddText">;

const MAX_PICK = 2;

// "From your own text": paste a paragraph (or scan a page with the
// keyboard's Scan Text), pick one or two sentences in a row, and the app
// marks them for you to check and practice.
export function AddTextScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [source, setSource] = useState("");
  const [step, setStep] = useState<"paste" | "pick">("paste");
  const [picked, setPicked] = useState<number[]>([]);
  const [working, setWorking] = useState(false);
  const sentences = useMemo(() => splitSentences(source), [source]);

  // Tapping extends the pick to a neighbour (up to two in a row), or starts over.
  function toggle(i: number) {
    setPicked((current) => {
      if (current.includes(i)) return current.filter((x) => x !== i);
      if (current.length < MAX_PICK && current.some((x) => Math.abs(x - i) === 1)) return [...current, i].sort((a, b) => a - b);
      return [i];
    });
  }

  async function markIt() {
    if (!picked.length || working) return;
    setWorking(true);
    try {
      const text = picked.map((i) => sentences[i]).join(" ");
      const { marked, by } = await autoMarkText(text);
      const words = marked.text.split(/\s+/);
      const id = await saveMarkedText({
        title: words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : ""),
        shelf: "line",
        text: marked.text,
        marks: marked.marks,
        autoMarked: true,
      });
      showGlobalToast(by === "model" ? "Marked by the on-device model — check it over." : "Marked — check it over and change anything.", "info");
      navigation.replace("MarkEdit", { id });
    } catch (error) {
      showGlobalToast(`Couldn't mark that: ${(error as Error).message}`, "error");
      setWorking(false);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Mark it up" title={step === "paste" ? "Your own text" : "Pick a sentence or two"} onBack={() => (step === "pick" ? setStep("paste") : navigation.goBack())} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {step === "paste" ? (
          <View style={styles.flex}>
            <Txt variant="subhead" tone="secondary">
              Paste a paragraph from a book, article or anything you like. On iPhone, tap the box and use the keyboard's Scan Text to grab a printed page with the camera.
            </Txt>
            <TextInput
              value={source}
              onChangeText={setSource}
              multiline
              placeholder="Paste or scan your text here…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              textAlignVertical="top"
            />
            <PrimaryButton label={sentences.length ? `Next · ${sentences.length} sentence${sentences.length === 1 ? "" : "s"}` : "Next"} disabled={!sentences.length} onPress={() => {
              setPicked(sentences.length === 1 ? [0] : []);
              setStep("pick");
            }} />
          </View>
        ) : (
          <View style={styles.flex}>
            <Txt variant="subhead" tone="secondary">
              One or two sentences in a row — short is the point. Tap a neighbour to add it.
            </Txt>
            <ScrollView contentContainerStyle={styles.list}>
              {sentences.map((s, i) => {
                const on = picked.includes(i);
                return (
                  <Pressable key={i} onPress={() => toggle(i)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Card style={[styles.sentence, on && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}>
                      <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={20} color={on ? colors.accent : colors.textMuted} />
                      <Txt variant="callout" style={styles.flex}>
                        {s}
                      </Txt>
                    </Card>
                  </Pressable>
                );
              })}
            </ScrollView>
            <PrimaryButton label="Mark it" onPress={markIt} disabled={!picked.length} loading={working} />
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  flex: { flex: 1, gap: t.space.md },
  input: {
    flex: 1,
    minHeight: 180,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    color: t.colors.textPrimary,
    padding: t.space.md,
    fontSize: 17,
    lineHeight: 24,
  },
  list: { gap: t.space.sm, paddingBottom: t.space.md },
  sentence: { flexDirection: "row", gap: t.space.md, alignItems: "flex-start", padding: t.space.md },
}));
