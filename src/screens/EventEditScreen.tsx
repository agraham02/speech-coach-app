import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Notifications from "expo-notifications";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Field } from "../components/conversation/Field";
import { DatePicker, formatEventDate } from "../components/common/DatePicker";
import { showGlobalToast } from "../components/common/ToastProvider";
import { EVENT_OPTIONS, EVENT_WHEN } from "../content/onboarding";
import type { EventKind } from "../domain/profile";
import { createEvent, deleteEvent, getEvent, syncEvents, updateEvent } from "../services/db/eventsRepo";
import { requestNotificationPermission } from "../services/notifications/reminderScheduler";
import { isoDateFromDate, todayISODate } from "../utils/dateUtils";
import { logger } from "../utils/logger";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "EventEdit">;

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDateFromDate(d);
}

// Add or change one event: what it is, when, and what you call it.
export function EventEditScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const eventId = route.params?.eventId ?? null;
  const [kind, setKind] = useState<EventKind | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    getEvent(eventId)
      .then((e) => {
        if (!e) return;
        setKind(e.kind);
        setDate(e.date);
        setTitle(e.title ?? "");
      })
      .catch(() => undefined);
  }, [eventId]);

  const quick = EVENT_WHEN.find((w) => inDays(w.days) === date);

  async function save() {
    if (!kind || !date || saving) return;
    setSaving(true);
    try {
      const input = { kind, title: title.trim() || null, date };
      if (eventId) {
        await updateEvent(eventId, input);
      } else {
        await createEvent(input);
        // The check-in nudges need notifications; ask once, the first time.
        const permission = await Notifications.getPermissionsAsync();
        if (!permission.granted && permission.canAskAgain && permission.status === "undetermined") {
          if (await requestNotificationPermission()) await syncEvents();
        }
      }
      navigation.goBack();
    } catch (error) {
      logger.error(`[events] save failed — ${(error as Error).message}`);
      showGlobalToast("Couldn't save that.", "error");
      setSaving(false);
    }
  }

  async function remove() {
    if (!eventId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteEvent(eventId);
      navigation.goBack();
    } catch (error) {
      logger.error(`[events] delete failed — ${(error as Error).message}`);
      showGlobalToast("Couldn't delete that.", "error");
    }
  }

  return (
    <Screen
      title={eventId ? "Edit event" : "Add an event"}
      onBack={() => navigation.goBack()}
      backIcon="close"
      keyboardShouldPersistTaps="handled"
      footer={<PrimaryButton label="Save" onPress={save} loading={saving} disabled={!kind || !date} />}
    >
      <View style={styles.section}>
        <Txt variant="headline">What is it?</Txt>
        <View style={styles.chips}>
          {EVENT_OPTIONS.map((o) => (
            <Chip key={o.key} label={o.label} selected={kind === o.key} onPress={() => setKind(o.key)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Txt variant="headline">When?</Txt>
        <View style={styles.chips}>
          {EVENT_WHEN.map((w) => (
            <Chip key={w.days} label={w.label} selected={quick?.days === w.days} onPress={() => setDate(inDays(w.days))} />
          ))}
          <Chip label={date && !quick ? formatEventDate(date) : "Pick a date"} selected={!!date && !quick} onPress={() => setPicking(true)} />
        </View>
        {date && quick ? (
          <Txt variant="footnote" tone="secondary">
            {formatEventDate(date)}
          </Txt>
        ) : null}
      </View>
      <DatePicker visible={picking} value={date} title="When is it?" onPick={setDate} onClose={() => setPicking(false)} minimumDate={date && date < todayISODate() ? date : undefined} />

      <Field label="Call it something (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Quarterly review" maxLength={60} />

      {eventId ? (
        <View style={styles.delete}>
          <PrimaryButton label={confirmDelete ? "Tap again to delete" : "Delete event"} variant={confirmDelete ? "danger" : "ghost"} onPress={remove} />
        </View>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  delete: { marginTop: t.space.lg },
}));
