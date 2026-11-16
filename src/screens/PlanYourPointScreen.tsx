import { useState } from "react";
import { planPointScore } from "../domain/personal/personalScores";
import { recordPersonalOutcome } from "../services/practice/personalOutcome";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { ACTIVITY_IDS } from "../content/activities";
import { TextInput, View } from "react-native";
import { KeyboardForm } from "../components/common/KeyboardForm";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { radii, spacing } from "../theme/theme";
import { typeScale } from "../theme/tokens";
import { Txt } from "../components/common/Txt";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "PlanYourPoint">;

// PREP framework: Point -> Reason -> Example -> Point. All three fields are
// optional — "Start recording" always proceeds, empty fields just mean the
// speaker chose to skip planning rather than an incomplete form.
export function PlanYourPointScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { prompt } = route.params;
  const [point, setPoint] = useState("");
  const [reason, setReason] = useState("");
  const [example, setExample] = useState("");

  function handleStart() {
    const scored = planPointScore({ point, reason, example });
    completePracticeStep(ACTIVITY_IDS.planPoint, undefined, scored.score).catch(() => undefined);
    recordPersonalOutcome({ activityId: ACTIVITY_IDS.planPoint, label: "Plan your point", scored }).catch(() => undefined);
    navigation.navigate("Recording", {
      kind: "prompt",
      prompt,
      planText: { point, reason, example },
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header title="Plan your point" onBack={() => navigation.goBack()} backIcon="close"
      />

      <KeyboardForm
        contentContainerStyle={styles.scroll}
        footer={
            <PrimaryButton label="Start Recording" onPress={handleStart} />
        }
      >
        <Txt variant="callout" tone="secondary">
          Quickly sketch your PREP before you record — Point, Reason, Example, Point again. Skip any of it and start
          recording whenever you're ready.
        </Txt>

        <View style={styles.promptPreview}>
          <Txt variant="quote" numberOfLines={2}>
            {prompt.text}
          </Txt>
        </View>

        <View style={styles.field}>
          <Txt variant="footnote" tone="secondary" weight="600">Point</Txt>
          <Txt variant="footnote" tone="muted">The one thing you want them to remember.</Txt>
          <TextInput maxLength={280}
            style={styles.textArea}
            value={point}
            onChangeText={setPoint}
            placeholder="What's the main point?"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Point"
          />
        </View>

        <View style={styles.field}>
          <Txt variant="footnote" tone="secondary" weight="600">Reason</Txt>
          <Txt variant="footnote" tone="muted">Why does that point matter?</Txt>
          <TextInput maxLength={280}
            style={styles.textArea}
            value={reason}
            onChangeText={setReason}
            placeholder="Why does it matter?"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Reason"
          />
        </View>

        <View style={styles.field}>
          <Txt variant="footnote" tone="secondary" weight="600">Example</Txt>
          <Txt variant="footnote" tone="muted">A concrete example or story that backs it up.</Txt>
          <TextInput maxLength={280}
            style={styles.textArea}
            value={example}
            onChangeText={setExample}
            placeholder="What's a specific example?"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Example"
          />
        </View>
      </KeyboardForm>
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 24 },
  promptPreview: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  field: { gap: spacing.xs },
  textArea: {
    ...typeScale.callout,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    minHeight: 56,
  },
  scroll: { gap: spacing.md, paddingBottom: spacing.md },
}));
