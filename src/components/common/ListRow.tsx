import type { ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackground?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
}

// A tappable settings/list row: icon tile, title + subtitle, right slot.
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  iconBackground,
  right,
  onPress,
  chevron,
  accessibilityLabel,
}: ListRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: iconBackground ?? colors.accentMuted }]}>
          <Ionicons name={icon} size={18} color={iconColor ?? colors.accent} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Txt variant="headline">{title}</Txt>
        {subtitle ? (
          <Txt variant="footnote" tone="secondary">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      {content}
    </Pressable>
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
          trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
          accessibilityLabel={title}
        />
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md, paddingVertical: t.space.sm, minHeight: 44 },
  iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
}));
