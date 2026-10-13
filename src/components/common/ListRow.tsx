import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { StyleSheet, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackground?: string;
  right?: ReactNode;
  // A short value shown before the chevron ("8 min", "On").
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
}

// A list row: icon tile, title + subtitle, a value or right slot, chevron.
// On its own it sits flush; inside a ListGroup the rows share one surface
// with hairlines between them.
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  iconBackground,
  right,
  value,
  onPress,
  chevron,
  destructive,
  accessibilityLabel,
}: ListRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: iconBackground ?? colors.accentMuted }]}>
          <Ionicons name={icon} size={18} color={iconColor ?? (destructive ? colors.danger : colors.textPrimary)} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Txt variant="headline" tone={destructive ? "danger" : "primary"}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="footnote" tone="secondary">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <Txt variant="subhead" tone="muted">
          {value}
        </Txt>
      ) : null}
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}>
      {content}
    </PressableScale>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  icon,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: colors.success, false: colors.switchTrackOff }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.switchTrackOff}
          accessibilityLabel={title}
        />
      }
    />
  );
}

// Rows grouped on one surface, hairlines between them (inset-grouped list).
export function ListGroup({ children, style, title }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string }) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.groupWrap}>
      {title ? (
        <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
          {title}
        </Txt>
      ) : null}
      <View style={[styles.group, style]}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <View style={styles.hairline} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md - 2, paddingVertical: t.space.sm + 2, minHeight: 48 },
  iconTile: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 1 },
  groupWrap: { gap: t.space.sm },
  groupTitle: { paddingHorizontal: 4 },
  group: { backgroundColor: t.colors.surface, borderRadius: t.radius.lg - 4, paddingHorizontal: t.space.md, paddingVertical: 2, ...t.shadow.card },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator, marginLeft: 48 },
}));
