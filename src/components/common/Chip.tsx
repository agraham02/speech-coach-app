import { Pressable, ScrollView, View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  background?: string;
}

export function Chip({ label, selected, onPress, color, background }: ChipProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fg = selected ? colors.onAccent : color ?? colors.textSecondary;
  const bg = selected ? colors.accent : background ?? colors.surfaceRaised;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, { backgroundColor: bg }]}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected }}
    >
      <Txt variant="footnote" weight="600" color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  scroll?: boolean;
}) {
  const styles = useStyles();
  const chips = options.map((o) => (
    <Chip key={o.key} label={o.label} selected={o.key === value} onPress={() => onChange(o.key)} />
  ));
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.group}>
        {chips}
      </ScrollView>
    );
  }
  return <View style={[styles.group, styles.wrap]}>{chips}</View>;
}

const useStyles = makeStyles((t) => ({
  chip: { paddingHorizontal: t.space.md, paddingVertical: 7, borderRadius: t.radius.pill },
  group: { flexDirection: "row", gap: t.space.sm },
  // Keeps a horizontal row from shrinking to a sliver inside a flex column.
  scroller: { flexGrow: 0, flexShrink: 0 },
  wrap: { flexWrap: "wrap" },
}));
