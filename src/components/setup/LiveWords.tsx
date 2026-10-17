import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Txt } from "../common/Txt";
import { makeStyles } from "../../theme/ThemeProvider";

interface LiveWordsProps {
  // What the recognizer has heard so far.
  text: string;
  // Shown, muted, until the first word arrives.
  placeholder: string;
}

// The words as they are recognized: each one fades in as it lands, large and
// plain, so seeing the app hear you is the whole point of the screen. Only
// the newest words animate; earlier ones keep their keys and stay put.
export function LiveWords({ text, placeholder }: LiveWordsProps) {
  const styles = useStyles();
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return (
      <View style={styles.box}>
        <Txt variant="title3" tone="muted" weight="500">
          {placeholder}
        </Txt>
      </View>
    );
  }
  return (
    <View style={[styles.box, styles.wrap]} accessibilityLiveRegion="polite" accessibilityLabel={`Heard: ${tokens.join(" ")}`}>
      {tokens.map((word, i) => (
        <Animated.View key={i} entering={FadeIn.duration(180)}>
          <Txt variant="title2" weight="500">
            {word}
          </Txt>
        </Animated.View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  box: { minHeight: 76, justifyContent: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: t.space.sm, rowGap: 2 },
}));
