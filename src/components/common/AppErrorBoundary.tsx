import { Component, type ReactNode } from "react";
import { Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatLogsForSharing } from "../../services/logs/logStore";
import { logger } from "../../utils/logger";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PrimaryButton } from "./PrimaryButton";
import { Txt } from "./Txt";

// Last line of defense: a render error anywhere below shows a calm "that
// went wrong" screen with a way back, instead of a blank or crashed app.
// The error goes to the app's log, which "Share details" sends on.
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logger.error(`[crash] ${error.message}\n${(error.stack ?? "").slice(0, 1500)}\n${(info.componentStack ?? "").slice(0, 1500)}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen onRetry={() => this.setState({ error: null })} />;
  }
}

function CrashScreen({ onRetry }: { onRetry: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.root} accessibilityRole="alert">
      <View style={styles.body}>
        <View style={styles.icon}>
          <Ionicons name="bandage-outline" size={28} color={colors.textPrimary} />
        </View>
        <Txt variant="title1" align="center">
          Something went wrong
        </Txt>
        <Txt variant="callout" tone="secondary" align="center">
          That part of Tono hit an error. Your recordings and progress are safe on this phone. Try again — and if it keeps happening, share the details so it can be fixed.
        </Txt>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Try again" onPress={onRetry} />
        <PrimaryButton
          label="Share details"
          variant="ghost"
          onPress={() => Share.share({ message: formatLogsForSharing() }).catch(() => undefined)}
        />
      </View>
    </View>
  );
}

// Logs uncaught JS errors (and whether they were fatal) before the default
// handler runs, so a crash leaves a trace in the shareable log.
export function installGlobalErrorLogging(): void {
  const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: Error, fatal?: boolean) => void; setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void } }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      logger.error(`[uncaught${isFatal ? ", fatal" : ""}] ${error?.message}\n${(error?.stack ?? "").slice(0, 1500)}`);
    } catch {
      // Logging must never be what breaks.
    }
    previous(error, isFatal);
  });
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background, padding: t.layout.gutter, justifyContent: "space-between", paddingTop: 120, paddingBottom: 48 },
  body: { gap: t.space.md, alignItems: "center" },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.surfaceRaised, alignItems: "center", justifyContent: "center", marginBottom: t.space.sm },
  actions: { gap: t.space.sm },
}));
