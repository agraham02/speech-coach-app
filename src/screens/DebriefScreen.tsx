import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Field } from "../components/conversation/Field";
import { ScaleSlider } from "../components/common/ScaleSlider";
import { getOpenEvents, saveDebrief, type SocialEvent } from "../services/db/socialRepo";
import { showGlobalToast } from "../components/common/ToastProvider";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Debrief">;

const MAX_BLANKS = 3;

function eventLabel(e: SocialEvent): string {
  if (e.label) return e.label;
  const d = new Date(e.createdAt);
  return `Primed ${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// After a conversation: three short prompts and an honest rating — not a
// replay of everything that went wrong. Kept deliberately small, because
// going over and over a conversation afterwards keeps social anxiety going.
// Moments you blanked on become replay practice.
export function DebriefScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(route.params?.eventId ?? null);
  const [label, setLabel] = useState("");
  const [wentOkay, setWentOkay] = useState("");
  const [tryNext, setTryNext] = useState("");
  const [positiveSign, setPositiveSign] = useState("");
  const [actual, setActual] = useState<number | null>(null);
  const [blanks, setBlanks] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOpenEvents()
      .then((open) => {
        setEvents(open);
        if (!route.params?.eventId && open.length > 0) setEventId(open[0].id);
      })
      .catch(() => setEvents([]));
  }, [route.params?.eventId]);

  const primed = events.find((e) => e.id === eventId) ?? null;

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const blankMoments = blanks.filter((b) => b.trim());
      await saveDebrief({
        eventId: primed?.id ?? null,
        label,
        debrief: { wentOkay: wentOkay.trim(), tryNext: tryNext.trim(), positiveSign: positiveSign.trim() },
        actualAwkward: actual,
        blankMoments,
      });
      let message = "Debrief saved.";
      if (primed?.predictedAwkward != null && actual != null) {
        const gap = primed.predictedAwkward - actual;
        message = gap > 0 ? `You predicted ${primed.predictedAwkward}, it was ${actual}. Better than the forecast.` : `Saved — predicted ${primed.predictedAwkward}, actual ${actual}.`;
      }
      if (blankMoments.length) message += " Your blank moments are ready to replay.";
      showGlobalToast(message, "success");
      navigation.goBack();
    } catch (error) {
      logger.error(`[debrief] save failed — ${(error as Error).message}`);
      showGlobalToast("Couldn't save that.", "error");
      setSaving(false);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="After · about three minutes" title="Debrief" onBack={() => navigation.goBack()} backIcon="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {events.length > 0 ? (
            <View style={styles.chips}>
              {events.map((e) => (
                <Chip key={e.id} label={eventLabel(e)} selected={eventId === e.id} onPress={() => setEventId(e.id)} />
              ))}
              <Chip label="Something else" selected={eventId == null} onPress={() => setEventId(null)} />
            </View>
          ) : null}
          {!primed ? <Field label="What was it?" value={label} onChangeText={setLabel} placeholder="e.g. Lunch with the new team" /> : null}
          {primed?.outwardGoal ? (
            <Txt variant="footnote" tone="secondary">
              Your goal was: {primed.outwardGoal}
            </Txt>
          ) : null}

          <Card style={styles.card}>
            <Field label="What went okay?" value={wentOkay} onChangeText={setWentOkay} placeholder="Even something small counts" multiline />
            <Field label="One thing to try next time" value={tryNext} onChangeText={setTryNext} placeholder="Just one" multiline />
            <Field label="One sign someone enjoyed it" value={positiveSign} onChangeText={setPositiveSign} placeholder="A laugh, a question back, they stayed…" multiline />
          </Card>

          <Card style={styles.card}>
            <Txt variant="headline">How awkward was it, really?</Txt>
            {primed?.predictedAwkward != null ? (
              <Txt variant="footnote" tone="secondary">
                You predicted {primed.predictedAwkward}.
              </Txt>
            ) : null}
            <ScaleSlider value={actual} onChange={setActual} lowLabel="Easy" highLabel="Very awkward" accessibilityLabel="Actual awkwardness, 0 to 10" />
          </Card>

          <Card style={styles.card}>
            <Txt variant="headline">A moment you blanked (optional)</Txt>
            <Txt variant="footnote" tone="secondary">
              Write what they said. You'll get to practice a reply to it.
            </Txt>
            {blanks.map((b, i) => (
              <Field key={i} value={b} onChangeText={(v) => setBlanks(blanks.map((x, j) => (j === i ? v : x)))} placeholder="“We're switching everyone to the new system…”" multiline />
            ))}
            {blanks.length < MAX_BLANKS ? (
              <Pressable onPress={() => setBlanks([...blanks, ""])} style={styles.addRow} accessibilityRole="button" accessibilityLabel="Add another moment">
                <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                <Txt variant="subhead" tone="accent">
                  Add another
                </Txt>
              </Pressable>
            ) : null}
          </Card>

          <Txt variant="caption1" tone="muted">
            That's all — no need to replay the whole thing. Going over a conversation again and again tends to make the next one feel harder, not easier.
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
      <PrimaryButton label="Save" onPress={save} loading={saving} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  flex: { flex: 1 },
  scroll: { gap: t.space.md, paddingBottom: t.space.xl },
  card: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  addRow: { flexDirection: "row", alignItems: "center", gap: t.space.xs, minHeight: 44 },
}));
