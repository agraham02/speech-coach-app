import { View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { Txt } from "../common/Txt";
import { compareSentence, MARKER_LABELS, markerPosition, placeMarkers, type CompareValues, type MarkerKey } from "./inputLogic";

interface CompareTrackProps extends CompareValues {
  max?: number;
}

const SIDE = 32;
const LABEL_WIDTH = 64;
const BAND = 28;
const LABEL_ROW = 18;

// "Your guess against the measure": read-only. A line with a dot at each of
// 1 to 5, and up to three markers whose shapes differ so colour is never the
// only clue: a ring for how it felt, a filled dot for after watching, a
// tilted square for the measured score. It reads out as one sentence.
export function CompareTrack({ felt, after, measured, max = 5 }: CompareTrackProps) {
  const styles = useStyles();
  const markers = placeMarkers({ felt, after, measured }, 1, max);
  const anyBelow = markers.some((m) => m.side === "below");
  const stops = Array.from({ length: max }, (_, i) => i + 1);

  const height = LABEL_ROW + BAND + (anyBelow ? LABEL_ROW : 0);

  return (
    <View style={{ height }} accessible accessibilityRole="image" accessibilityLabel={compareSentence({ felt, after, measured }, max)}>
      <View style={styles.inner}>
        <View style={styles.line} />
        {stops.map((n) => (
          <View key={n} style={[styles.stopDot, { left: `${markerPosition(n, 1, max) * 100}%` }]} />
        ))}
        {markers.map((m) => (
          <View key={m.key} style={[styles.at, { left: `${m.position * 100}%` }]}>
            <Marker kind={m.key} />
            <View style={[styles.label, m.side === "above" ? styles.labelAbove : styles.labelBelow]}>
              <Txt variant="caption2" tone="secondary" align="center" numberOfLines={1}>
                {MARKER_LABELS[m.key]}
              </Txt>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Marker({ kind }: { kind: MarkerKey }) {
  const styles = useStyles();
  if (kind === "felt") return <View style={styles.felt} />;
  if (kind === "after") return <View style={styles.after} />;
  return <View style={styles.measured} />;
}

const useStyles = makeStyles((t) => ({
  // The marker band: room each side for a marker and its label at the ends.
  inner: { position: "absolute", top: LABEL_ROW, height: BAND, left: SIDE, right: SIDE },
  line: { position: "absolute", top: BAND / 2 - 2, left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: t.colors.switchTrackOff },
  stopDot: { position: "absolute", top: BAND / 2 - 3, width: 6, height: 6, marginLeft: -3, borderRadius: 3, backgroundColor: t.colors.textMuted },
  // Each marker is centred on its spot; its label hangs off it.
  at: { position: "absolute", top: 0, width: 0, height: BAND, alignItems: "center", justifyContent: "center" },
  label: { position: "absolute", left: -LABEL_WIDTH / 2, width: LABEL_WIDTH, alignItems: "center" },
  labelAbove: { bottom: BAND },
  labelBelow: { top: BAND },
  felt: { width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: t.colors.textPrimary, backgroundColor: t.colors.surface },
  after: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.colors.textPrimary },
  measured: { width: 22, height: 22, borderRadius: 5, backgroundColor: t.colors.success, transform: [{ rotate: "45deg" }] },
}));
