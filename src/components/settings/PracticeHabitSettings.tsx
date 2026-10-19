import { useState } from "react";
import { View } from "react-native";
import { Card } from "../common/Card";
import { Chip } from "../common/Chip";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { ANCHOR_OPTIONS } from "../../content/onboarding";
import { anchorFits, anchorHour, anchorOption } from "../../domain/notificationCopy";
import { formatReminderHour } from "../../domain/reminderSettings";
import { getPracticeAnchor, getPracticeAnchorHour, setPracticeAnchor } from "../../services/prefs/prefsStore";
import { makeStyles } from "../../theme/ThemeProvider";

// Settings → the habit your practice is tied to, and your first reminder. The
// two go together: "after your morning coffee" is a morning, so picking it
// moves the reminder to 8 AM, and a reminder moved to the evening tells you
// the habit no longer fits and offers a one-tap fix. Without that, the
// reminder would say "after your morning coffee" at 7 PM.
export function PracticeHabitSettings({ firstHour, onMoveReminder }: { firstHour: number; onMoveReminder: (hour: number) => void }) {
  const styles = useStyles();
  const showToast = useToast();
  const [anchor, setAnchor] = useState(getPracticeAnchor());
  const [savedHour, setSavedHour] = useState(getPracticeAnchorHour());

  const known = anchorOption(anchor);
  const habitHour = anchorHour(anchor, savedHour);
  const fitsNow = !anchor || anchorFits(anchor, new Date(2000, 0, 1, firstHour), savedHour);

  function choose(option: (typeof ANCHOR_OPTIONS)[number] | null) {
    setPracticeAnchor(option?.anchor ?? null, option?.hour ?? null);
    setAnchor(option?.anchor ?? null);
    setSavedHour(option?.hour ?? null);
    if (option && option.hour !== firstHour) {
      onMoveReminder(option.hour);
      showToast(`Reminder moved to ${formatReminderHour(option.hour)}, to match.`, "success");
    }
  }

  // A habit the person wrote: kept, and tied to the reminder's current hour.
  const custom = anchor && !known;

  return (
    <Card style={styles.section}>
      <View style={styles.text}>
        <Txt variant="headline">Your habit</Txt>
        <Txt variant="footnote" tone="secondary">
          Practice sticks when it follows something you already do. Reminders will name it, at a time that fits.
        </Txt>
      </View>
      <View style={styles.chips}>
        <Chip label="None" selected={!anchor} onPress={() => choose(null)} />
        {ANCHOR_OPTIONS.map((o) => (
          <Chip key={o.key} label={o.label} selected={known?.key === o.key} onPress={() => choose(o)} />
        ))}
        {custom ? <Chip label={anchor} selected /> : null}
      </View>
      {anchor && !fitsNow && habitHour != null ? (
        <View style={styles.text}>
          <Txt variant="footnote" tone="secondary">
            Your first reminder is at {formatReminderHour(firstHour)}, which isn't when this habit happens, so reminders use plain wording instead.
          </Txt>
          <PrimaryButton
            label={`Move reminder to ${formatReminderHour(habitHour)}`}
            variant="secondary"
            size="sm"
            onPress={() => {
              onMoveReminder(habitHour);
              showToast(`Reminder moved to ${formatReminderHour(habitHour)}.`, "success");
            }}
            style={styles.button}
          />
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.md },
  text: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  button: { alignSelf: "flex-start" },
}));
