import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { radii, spacing, typography, font, fontDisplay } from "../theme/theme";
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

      <Text style={styles.subtitle}>
        Quickly sketch your PREP before you record — Point, Reason, Example, Point again. Skip any of it and start
        recording whenever you're ready.
      </Text>

      <View style={styles.promptPreview}>
        <Text style={styles.promptPreviewText} numberOfLines={2}>
          {prompt.text}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Point</Text>
        <Text style={styles.hint}>The one thing you want them to remember.</Text>
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
        <Text style={styles.label}>Reason</Text>
        <Text style={styles.hint}>Why does that point matter?</Text>
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
        <Text style={styles.label}>Example</Text>
        <Text style={styles.hint}>A concrete example or story that backs it up.</Text>
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

      <View style={styles.spacer} />
      <PrimaryButton label="Start Recording" onPress={handleStart} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 24 },
  title: { color: colors.textPrimary, fontSize: typography.title, ...font("700") },
  subtitle: { ...font("400"), color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
  promptPreview: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  promptPreviewText: { fontFamily: fontDisplay.spoken, color: colors.textPrimary, fontSize: 19, lineHeight: 26, letterSpacing: -0.2 },
  field: { gap: spacing.xs },
  label: { color: colors.textSecondary, fontSize: 13, ...font("600") },
  hint: { ...font("400"), color: colors.textMuted, fontSize: typography.caption },
  textArea: {
    ...font("400"),
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: typography.body,
    minHeight: 56,
  },
  spacer: { flex: 1 },
}));
