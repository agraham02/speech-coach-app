import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { getAllScripts } from "../services/db/scriptsRepo";
import { colorForCategory } from "../domain/categoryColor";
import type { Script } from "../domain/scriptTypes";
import { formatDuration } from "../utils/dateUtils";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ScriptLibrary">;

const SCRIPTS = getAllScripts();

export function ScriptLibraryScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<Script | null>(null);
  const [cuesEnabled, setCuesEnabled] = useState(true);

  function handleStart() {
    if (!selected) return;
    navigation.navigate("Recording", { kind: "script", script: selected, cuesEnabled });
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Script Practice</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={styles.subtitle}>
        Read a fixed script aloud with on-screen delivery cues — where to pause, project, or land the emphasis.
      </Text>

      <FlatList
        data={SCRIPTS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isSelected = selected?.id === item.id;
          return (
            <Pressable onPress={() => setSelected(item)}>
              <Card style={[styles.scriptCard, isSelected ? styles.scriptCardSelected : null]}>
                <View style={styles.scriptCardHeader}>
                  <Badge label={item.category} {...colorForCategory(item.category)} />
                  <Text style={styles.duration}>{formatDuration(item.targetDurationSeconds)}</Text>
                </View>
                <Text style={styles.scriptTitle}>{item.title}</Text>
                <Text style={styles.scriptExcerpt} numberOfLines={2}>
                  {item.text}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />

      {selected ? (
        <Card style={styles.footer}>
          <View style={styles.footerRow}>
            <View style={styles.footerText}>
              <Text style={styles.footerTitle}>Show delivery cues</Text>
              <Text style={styles.footerSubtitle}>Pitch, volume, pause, and emphasis prompts while you read.</Text>
            </View>
            <Switch
              value={cuesEnabled}
              onValueChange={setCuesEnabled}
              trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
            />
          </View>
          <PrimaryButton label={`Start "${selected.title}"`} onPress={handleStart} />
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 24 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  scriptCard: { gap: spacing.xs },
  scriptCardSelected: { borderColor: colors.accent },
  scriptCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  duration: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "600" },
  scriptTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "700" },
  scriptExcerpt: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  footer: { gap: spacing.md },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  footerText: { flex: 1, gap: spacing.xs },
  footerTitle: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  footerSubtitle: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
});
