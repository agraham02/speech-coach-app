import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveMetrics } from "../../hooks/useLiveMetrics";
import { isOverlayOn, metricsEnabled, subscribeOverlay } from "../../services/dev/deviceMetrics";
import { formatMemory, thermalLabel, thermalLevel } from "../../domain/dev/metrics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Mono } from "./Mono";

// A small readout pinned under the status bar on every screen, so a model's
// cost can be watched where it runs. Turned on from Dev → Metrics; never
// rendered in production builds, and it never takes touches.
export function MetricsOverlay() {
  const [on, setOn] = useState(isOverlayOn);
  useEffect(() => subscribeOverlay(setOn), []);
  if (!metricsEnabled || !on) return null;
  return <Readout />;
}

function Readout() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { latest } = useLiveMetrics();
  const n = latest?.native;
  const level = thermalLevel(n?.thermalState);
  const parts = [
    n ? formatMemory(n.appMemoryBytes) : "JS " + formatMemory(latest?.jsHeapBytes),
    latest?.cpuPercent != null ? Math.round(latest.cpuPercent) + "%" : "-",
  ];
  if (level != null && level > 0) parts.push(thermalLabel(n?.thermalState));
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 2 }]}>
      <View style={styles.pill}>
        <Mono variant="caption2" color={level != null && level >= 2 ? colors.danger : level === 1 ? colors.warning : colors.textPrimary}>
          {parts.join(" · ")}
        </Mono>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 9999, elevation: 9999 },
  pill: { paddingHorizontal: t.space.sm, paddingVertical: 2, borderRadius: 999, backgroundColor: t.colors.surfaceRaised, opacity: 0.92 },
}));
