import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { loadActiveTakes, subscribeToReadyMarkers, type ActiveTake } from "../services/pipeline/activeTakes";
import { subscribeToAllSessions } from "../services/pipeline/processingEvents";

// The takes being worked on or waiting to be opened (Today's status card),
// refreshed whenever any take's step changes or a ready marker is set or
// cleared.
export function useActiveTakes(): ActiveTake[] {
  const [takes, setTakes] = useState<ActiveTake[]>([]);
  const reload = useCallback(() => {
    loadActiveTakes()
      .then(setTakes)
      .catch(() => undefined);
  }, []);
  useFocusEffect(reload);
  useEffect(() => {
    const a = subscribeToAllSessions(reload);
    const b = subscribeToReadyMarkers(reload);
    return () => {
      a();
      b();
    };
  }, [reload]);
  return takes;
}
