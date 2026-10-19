import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { ZoomIn } from "react-native-reanimated";
import { Card } from "../common/Card";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import type { Lesson } from "../../content/lessons";
import { duration, enter } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface LessonCompleteCardProps {
  lesson: Lesson;
  nextReviewAt: string | null;
  // What comes next: the next lesson in this unit, or the next on your path.
  next: { lessonId: string; title: string; label: string } | null;
  onNext: (lessonId: string) => void;
}

// The end of a lesson: a check, the one move to keep, when it comes back,
// and the way on.
export function LessonCompleteCard({ lesson, nextReviewAt, next, onNext }: LessonCompleteCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const review = nextReviewAt ? new Date(nextReviewAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : null;
  return (
    <Animated.View entering={enter(0)}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <Animated.View entering={ZoomIn.duration(duration.slow).delay(150)} style={[styles.check, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={24} color={colors.background} />
          </Animated.View>
          <View style={styles.flex}>
            <Txt variant="title3">Lesson done</Txt>
            {review ? (
              <Txt variant="footnote" tone="secondary">
                It comes back for a quick review on {review}.
              </Txt>
            ) : null}
          </View>
        </View>
        <View style={[styles.keep, { backgroundColor: colors.skill[lesson.skill].bg }]}>
          <Txt variant="caption1" weight="600" color={colors.skill[lesson.skill].fg}>
            The move to keep
          </Txt>
          <Txt variant="callout">{lesson.teach.how[0]}</Txt>
        </View>
        {next ? <PrimaryButton label={`${next.label}: ${next.title}`} iconRight="arrow-forward" onPress={() => onNext(next.lessonId)} /> : null}
      </Card>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  top: { flexDirection: "row", alignItems: "center", gap: t.space.md - 2 },
  check: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 2 },
  keep: { gap: t.space.xs, padding: t.space.md - 2, borderRadius: t.radius.md },
}));
