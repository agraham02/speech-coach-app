import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { IconButton } from "../components/common/IconButton";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { EmptyState } from "../components/common/EmptyState";
import { formatEventDate } from "../components/common/DatePicker";
import { countdownLabel, daysAway, eventName, eventPhase, sortEvents, type SpeakingEvent } from "../domain/events";
import { listEvents } from "../services/db/eventsRepo";
import { todayISODate } from "../utils/dateUtils";

type Props = NativeStackScreenProps<RootStackParamList, "Events">;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Everything you're speaking at: what's ahead (with a countdown and whether
// you've checked in), and what's behind you (with how it went).
export function EventsScreen({ navigation }: Props) {
  const [events, setEvents] = useState<SpeakingEvent[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listEvents()
        .then(setEvents)
        .catch(() => setEvents([]));
    }, []),
  );

  const today = todayISODate();
  const { upcoming, past } = sortEvents(events ?? [], today);
  const add = () => navigation.navigate("EventEdit", {});

  function upcomingStatus(e: SpeakingEvent): string {
    const when = `${capitalize(countdownLabel(daysAway(e.date, today)))} · ${formatEventDate(e.date)}`;
    return e.before ? `${when} · Checked in` : when;
  }

  function pastStatus(e: SpeakingEvent): string {
    const phase = eventPhase(e, today);
    const told = e.after ? "Told how it went" : phase === "debrief" ? "How did it go?" : "No check-in";
    return `${formatEventDate(e.date)} · ${told}`;
  }

  // Ahead (or today): change it. Behind: say how it went.
  function open(e: SpeakingEvent) {
    if (e.date >= today) navigation.navigate("EventEdit", { eventId: e.id });
    else navigation.navigate("EventCheckIn", { eventId: e.id, phase: "after" });
  }

  return (
    <Screen
      title="Your events"
      onBack={() => navigation.goBack()}
      right={<IconButton icon="add" onPress={add} accessibilityLabel="Add an event" size={38} />}
    >
      {events && events.length === 0 ? (
        <EmptyState
          icon="calendar-clear-outline"
          title="Nothing coming up"
          body="Add an interview, a talk or a toast. Your plan builds toward it, and you can check in before and after."
          actionLabel="Add an event"
          onAction={add}
        />
      ) : null}
      {upcoming.length ? (
        <ListGroup title="Coming up">
          {upcoming.map((e) => (
            <ListRow key={e.id} title={capitalize(eventName(e))} subtitle={upcomingStatus(e)} icon="calendar-clear-outline" onPress={() => open(e)} chevron />
          ))}
        </ListGroup>
      ) : null}
      {past.length ? (
        <ListGroup title="Done">
          {past.map((e) => (
            <ListRow key={e.id} title={capitalize(eventName(e))} subtitle={pastStatus(e)} icon={e.after ? "checkmark-circle-outline" : "time-outline"} onPress={() => open(e)} chevron />
          ))}
        </ListGroup>
      ) : null}
    </Screen>
  );
}
