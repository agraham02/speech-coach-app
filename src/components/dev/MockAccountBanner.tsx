import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { describeMock } from "../../domain/dev/mockAccount";
import { useMockAccountConfig } from "../../services/dev/mockAccount";
import { SHOW_DEV_TOOLS } from "../../config/devTools";
import { makeStyles } from "../../theme/ThemeProvider";
import { Txt } from "../common/Txt";

// A small label pinned under the status bar on every screen while a mock
// account is set (Dev, App tools, Mock account), so a tester never forgets the
// app is not showing the real account. Never rendered in production builds, and
// it never takes touches.
export function MockAccountBanner() {
  if (!SHOW_DEV_TOOLS) return null;
  return <Label />;
}

function Label() {
  const styles = useStyles();
  const config = useMockAccountConfig();
  const insets = useSafeAreaInsets();
  if (!config) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 2 }]} testID="dev-mock-banner" accessibilityLabel={`Dev mock account: ${describeMock(config)}`}>
      <View style={styles.pill}>
        <Txt variant="caption2" weight="600" color={styles.text.color} numberOfLines={1}>
          {`Mock account · ${describeMock(config)}`}
        </Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: "absolute", left: 8, right: 64, alignItems: "flex-start", zIndex: 9998, elevation: 9998 },
  pill: { maxWidth: "100%", paddingHorizontal: t.space.sm, paddingVertical: 2, borderRadius: 999, backgroundColor: t.colors.warning, opacity: 0.95 },
  text: { color: "#1A1400" },
}));
