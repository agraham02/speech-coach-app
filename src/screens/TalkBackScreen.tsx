import { useCallback, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { Chip } from "../components/common/Chip";
import { PressableScale } from "../components/common/PressableScale";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { showGlobalToast } from "../components/common/ToastProvider";
import { Field } from "../components/conversation/Field";
import { PRESET_THOUGHTS } from "../domain/innerVoice/thoughts";
import { addThought, archiveThought, latestChallenges, listThoughts, restoreThought, type Challenge, type Thought } from "../services/db/selfTalkRepo";
import { tick } from "../utils/haptics";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const dayLabel = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Talk back: the things your inner critic says about speaking, each one
// weighed up fairly — what makes it feel true, what doesn't fit, and a more
// accurate version to say to yourself. The aim is accuracy, not positivity.
export function TalkBackScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [thoughts, setThoughts] = useState<Thought[] | null>(null);
  const [latest, setLatest] = useState<Record<string, Challenge>>({});
  const [text, setText] = useState("");

  const load = useCallback(() => {
    listThoughts().then(setThoughts);
    latestChallenges().then(setLatest);
  }, []);
  useFocusEffect(load);

  async function add(raw: string, presetId?: string) {
    const thought = await addThought({ text: raw, presetId, source: "added" });
    if (!thought) return;
    setText("");
    load();
  }

  function remove(thought: Thought) {
    tick();
    setThoughts((current) => (current ?? []).filter((t) => t.id !== thought.id));
    archiveThought(thought.id).catch(() => undefined);
    showGlobalToast("Removed — tap to undo", "info", () => {
      restoreThought(thought.id)
        .then(load)
        .catch(() => undefined);
    });
  }

  const unused = PRESET_THOUGHTS.filter((p) => !(thoughts ?? []).some((t) => t.presetId === p.id));

  return (
    <Screen title="Talk back" onBack={() => navigation.goBack()} contentStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Txt variant="callout" tone="secondary">
        The things your inner critic says about speaking. Pick one and look at it fairly — what makes it feel true, what doesn't fit, and a more accurate way to say it. The aim is accuracy, not forced positivity.
      </Txt>

      {thoughts && thoughts.length === 0 ? (
        <Txt variant="subhead" tone="muted" align="center" style={styles.empty}>
          Nothing here yet. Add what your inner critic says below.
        </Txt>
      ) : null}

      {(thoughts ?? []).map((thought) => {
        const last = latest[thought.id];
        return (
          <Card key={thought.id} onPress={() => navigation.navigate("ThoughtChallenge", { thoughtId: thought.id })} style={styles.thought} accessibilityLabel={thought.text}>
            <View style={styles.thoughtTop}>
              <Txt variant="headline" style={styles.flex}>
                {thought.text}
              </Txt>
              <PressableScale onPress={() => remove(thought)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove "${thought.text}"`} style={styles.remove}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </PressableScale>
            </View>
            <Txt variant="footnote" tone="secondary">
              {last ? (last.beliefAfter != null ? `Felt ${last.beliefBefore}/5, then ${last.beliefAfter}/5 · ${dayLabel(last.createdAt)}` : `Looked at on ${dayLabel(last.createdAt)}`) : "Not looked at yet"}
            </Txt>
          </Card>
        );
      })}

      <Card style={styles.add}>
        <Txt variant="headline">Add one</Txt>
        {unused.length > 0 ? (
          <View style={styles.chips}>
            {unused.map((p) => (
              <Chip key={p.id} label={p.text} onPress={() => add(p.text, p.id)} />
            ))}
          </View>
        ) : null}
        <Field value={text} onChangeText={setText} placeholder="Or in your own words — what does it say?" maxLength={120} />
        <PrimaryButton label="Add" icon="add" variant="secondary" onPress={() => add(text)} disabled={!text.trim()} />
      </Card>

      <Txt variant="footnote" tone="muted" style={styles.note}>
        This is practice, not therapy. If these thoughts feel heavy or constant, a therapist can help — and it's a good thing to ask for.
      </Txt>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  empty: { paddingVertical: t.space.lg },
  thought: { gap: t.space.xs + 2 },
  thoughtTop: { flexDirection: "row", alignItems: "flex-start", gap: t.space.sm },
  flex: { flex: 1 },
  remove: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginTop: -2 },
  add: { gap: t.space.sm + 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  note: { paddingHorizontal: 4 },
}));
