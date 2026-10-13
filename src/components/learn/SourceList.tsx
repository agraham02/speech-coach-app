import { Fragment } from "react";
import { Linking, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { SOURCE_GROUPS, type Source } from "../../content/sources";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// "*Title.* Rest" → the title in italics.
function Citation({ text }: { text: string }) {
  return (
    <Txt variant="subhead">
      {text.split("*").map((part, i) => (
        <Fragment key={i}>{i % 2 === 1 ? <Txt variant="subhead" italic>{part}</Txt> : part}</Fragment>
      ))}
    </Txt>
  );
}

function SourceRow({ source }: { source: Source }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const body = (
    <>
      <View style={styles.flex}>
        <Citation text={source.citation} />
        <Txt variant="footnote" tone="secondary">
          {source.usedFor}
        </Txt>
      </View>
      {source.url ? <Ionicons name="open-outline" size={16} color={colors.textMuted} style={styles.linkIcon} /> : null}
    </>
  );
  if (!source.url) return <View style={styles.sourceRow}>{body}</View>;
  const url = source.url;
  return (
    <PressableScale
      onPress={() => Linking.openURL(url).catch(() => undefined)}
      scaleTo={0.99}
      style={styles.sourceRow}
      accessibilityRole="link"
      accessibilityHint="Opens in your browser"
    >
      {body}
    </PressableScale>
  );
}

// Every source behind the curriculum, grouped (books, research, coaches…).
// Rows with a link open in the browser.
export function SourceList() {
  const styles = useStyles();
  return (
    <>
      {SOURCE_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
            {group.title}
          </Txt>
          <Card style={styles.groupCard}>
            {group.sources.map((source, i) => (
              <Fragment key={source.citation}>
                {i > 0 ? <View style={styles.hairline} /> : null}
                <SourceRow source={source} />
              </Fragment>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, gap: 3 },
  group: { gap: t.space.sm },
  groupTitle: { paddingHorizontal: 4 },
  groupCard: { paddingVertical: 4 },
  sourceRow: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md, paddingVertical: t.space.sm + 4 },
  linkIcon: { marginTop: 3 },
  hairline: { height: 1, backgroundColor: t.colors.separator },
}));
