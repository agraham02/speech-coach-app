import { View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { tick } from "../../utils/haptics";

export interface OptionCard<T extends string = string> {
  key: T;
  title: string;
  detail?: string;
  // A big number at the start ("5", "10"): the minutes, the count.
  lead?: string | number;
}

interface OptionCardsProps<T extends string> {
  options: readonly OptionCard<T>[];
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

// "Choose with the detail visible": one card per option with its title and a
// line of detail, a radio at the end. The chosen card gets a dark outline.
export function OptionCards<T extends string>({ options, value, onChange, accessibilityLabel }: OptionCardsProps<T>) {
  const styles = useStyles();
  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <PressableScale
            key={option.key}
            onPress={() => {
              if (!selected) tick();
              onChange(option.key);
            }}
            scaleTo={0.98}
            style={[styles.card, selected && styles.cardOn]}
            accessibilityRole="radio"
            accessibilityLabel={[option.lead, option.title, option.detail].filter((p) => p != null && p !== "").join(", ")}
            accessibilityState={{ checked: selected }}
          >
            {selected ? <View pointerEvents="none" style={styles.ring} /> : null}
            {option.lead != null ? (
              <Txt variant="title1" tabular style={styles.lead}>
                {option.lead}
              </Txt>
            ) : null}
            <View style={styles.text}>
              <Txt variant="headline">{option.title}</Txt>
              {option.detail ? (
                <Txt variant="footnote" tone="secondary">
                  {option.detail}
                </Txt>
              ) : null}
            </View>
            <View style={[styles.radio, selected && styles.radioOn]} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  cardOn: { borderColor: t.colors.textPrimary },
  // The canvas's inset 1px ring, drawn just inside the border.
  ring: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14.5, borderWidth: 1, borderColor: t.colors.textPrimary },
  lead: { minWidth: 38, lineHeight: 28, fontSize: 24 },
  text: { flex: 1, gap: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.colors.textMuted, backgroundColor: t.colors.surface },
  radioOn: { borderWidth: 7, borderColor: t.colors.textPrimary },
}));
