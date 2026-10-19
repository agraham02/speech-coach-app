import { useCallback, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { FadeOut } from "react-native-reanimated";
import { Card } from "../common/Card";
import { IconButton } from "../common/IconButton";
import { Txt } from "../common/Txt";
import { getUnseenPathChange, markPathChangesSeen, type StoredPathChange } from "../../services/db/pathRepo";
import { getUnit } from "../../content/lessons";
import { enter } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// When a new goal, event or skill check moved your path, Today says what
// moved and why — once. Moves that come from progress alone aren't shown.
export function PathChangeNotice({ refreshKey }: { refreshKey?: unknown }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [change, setChange] = useState<StoredPathChange | null>(null);

  useFocusEffect(
    useCallback(() => {
      getUnseenPathChange().then(setChange).catch(() => undefined);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]),
  );

  if (!change || change.changes.length === 0) return null;
  const lines = change.changes.slice(0, 2).map((c) => {
    const title = getUnit(c.unitId)?.title ?? "A unit";
    return c.reason ? `${title} moved up: ${c.reason.charAt(0).toLowerCase()}${c.reason.slice(1)}.` : `${title} moved up.`;
  });
  return (
    <Animated.View entering={enter(1)} exiting={FadeOut}>
      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceRaised }]}>
          <Ionicons name="git-branch-outline" size={17} color={colors.textPrimary} />
        </View>
        <View style={styles.flex}>
          <Txt variant="headline">Your path changed</Txt>
          {lines.map((l) => (
            <Txt key={l} variant="footnote" tone="secondary">
              {l}
            </Txt>
          ))}
        </View>
        <IconButton
          icon="close"
          size={34}
          onPress={() => {
            setChange(null);
            markPathChangesSeen().catch(() => undefined);
          }}
          accessibilityLabel="Dismiss"
        />
      </Card>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flexDirection: "row", alignItems: "flex-start", gap: t.space.sm + 4 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 2 },
}));
