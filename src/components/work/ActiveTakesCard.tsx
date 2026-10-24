import { ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { ListGroup, ListRow } from "../common/ListRow";
import { useActiveTakes } from "../../hooks/useActiveTakes";
import { reviewLine, workHeadline } from "../../domain/analysis/workCopy";
import type { ActiveTake } from "../../services/pipeline/activeTakes";
import { useTheme } from "../../theme/ThemeProvider";

// Today: the takes being worked on, ones that didn't finish, and ones that
// finished while you were elsewhere and haven't been opened. Nothing to watch
// and nothing blocked: tap a row to open the take.
export function ActiveTakesCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const takes = useActiveTakes();
  if (takes.length === 0) return null;

  const subtitle = (t: ActiveTake): string => {
    if (t.kind === "ready") return "Ready. Tap to see what stood out.";
    if (t.work.reviewWaitsForConnection && t.work.onDevice === "done") return "Your numbers are in. The review sends itself when you're online.";
    if (t.kind === "stuck") return `${workHeadline(t.work)}. Tap to try again.`;
    return t.work.onDevice === "done" && reviewLine(t.work) ? `Your numbers are in. ${reviewLine(t.work)}` : workHeadline(t.work);
  };

  return (
    <ListGroup title="Your takes">
      {takes.map((t) => (
        <ListRow
          key={t.session.id}
          icon={t.kind === "ready" ? "checkmark-circle-outline" : t.kind === "stuck" ? "alert-circle-outline" : "hourglass-outline"}
          iconColor={t.kind === "ready" ? colors.success : t.kind === "stuck" ? colors.danger : undefined}
          title={t.title}
          subtitle={subtitle(t)}
          right={t.kind === "working" ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
          chevron={t.kind !== "working"}
          onPress={() => navigation.navigate("Result", { sessionId: t.session.id })}
          accessibilityLabel={`${t.title}. ${subtitle(t)}`}
        />
      ))}
    </ListGroup>
  );
}
