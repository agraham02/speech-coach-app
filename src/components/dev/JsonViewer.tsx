import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { Mono } from "./Mono";
import { describeJson, isContainer, sliceJsonText, topLevelEntries } from "../../domain/dev/jsonView";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const FIRST_CHUNK = 6000;
const MORE_CHUNK = 20000;

// Pretty-printed JSON, cut at a line boundary, with a button for more.
export function JsonText({ value, initial = FIRST_CHUNK }: { value: unknown; initial?: number }) {
  const styles = useStyles();
  const [limit, setLimit] = useState(initial);
  const { text, total, truncated } = sliceJsonText(value, limit);
  return (
    <View style={styles.block}>
      <Mono selectable>{text}</Mono>
      {truncated ? (
        <PressableScale onPress={() => setLimit((l) => l + MORE_CHUNK)} accessibilityLabel="Show more" style={styles.more}>
          <Txt variant="footnote" weight="600">
            {"Show more (" + Math.round((text.length / total) * 100) + "% shown)"}
          </Txt>
        </PressableScale>
      ) : null}
    </View>
  );
}

// The first level of a value as collapsible rows (a container's contents
// load only when you open it).
export function JsonTree({ value }: { value: unknown }) {
  const styles = useStyles();
  const { entries, hidden } = topLevelEntries(value);
  if (!isContainer(value)) return <JsonText value={value} />;
  return (
    <View style={styles.tree}>
      {entries.map((entry) => (
        <JsonRow key={entry.key} name={entry.key} value={entry.value} />
      ))}
      {hidden > 0 ? (
        <Mono tone="muted">{"… " + hidden.toLocaleString("en-US") + " more items (see Raw)"}</Mono>
      ) : null}
    </View>
  );
}

function JsonRow({ name, value }: { name: string; value: unknown }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const container = isContainer(value);
  return (
    <View>
      <PressableScale
        onPress={container ? () => setOpen((o) => !o) : undefined}
        scaleTo={0.99}
        accessibilityLabel={name}
        style={styles.row}
      >
        <View style={styles.rowHead}>
          {container ? <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={colors.textMuted} /> : <View style={styles.spacer} />}
          <Mono>{name}</Mono>
          <Mono tone="muted" style={styles.flex}>
            {container || typeof value === "string" && value.length > 60 ? describeJson(value) : ""}
          </Mono>
        </View>
        {!container ? (
          <Mono tone="secondary" selectable style={styles.leaf}>
            {typeof value === "string" ? '"' + value + '"' : String(value)}
          </Mono>
        ) : null}
      </PressableScale>
      {open && container ? (
        <View style={styles.children}>
          <JsonText value={value} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  more: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: t.space.md, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceRaised },
  tree: { gap: 2 },
  row: { paddingVertical: 6, gap: 2 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  spacer: { width: 14 },
  flex: { flex: 1 },
  leaf: { paddingLeft: 20 },
  children: { paddingLeft: 20, paddingBottom: t.space.sm },
}));
