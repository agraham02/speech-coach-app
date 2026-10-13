import { Linking, View } from "react-native";
import Constants from "expo-constants";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const SITE = "https://www.ahmadgraham.me/";

// The foot of Settings: which version this is, and who made it.
export function AppFooter() {
  const styles = useStyles();
  const { colors } = useTheme();
  const version = Constants.expoConfig?.version;
  return (
    <View style={styles.wrap}>
      <Txt variant="footnote" tone="muted" align="center">
        Tono{version ? ` ${version}` : ""}
      </Txt>
      <Txt variant="footnote" tone="muted" align="center">
        Made by{" "}
        <Txt
          variant="footnote"
          weight="600"
          color={colors.textPrimary}
          style={styles.link}
          onPress={() => Linking.openURL(SITE).catch(() => undefined)}
          accessibilityRole="link"
          accessibilityHint="Opens Ahmad Graham's website"
        >
          Ahmad Graham
        </Txt>
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 2, paddingTop: t.space.md, paddingBottom: t.space.lg },
  link: { textDecorationLine: "underline" },
}));
