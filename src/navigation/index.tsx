import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { NavigationContainer, type NavigatorScreenParams } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import { Ionicons } from "@expo/vector-icons";
import { HomeScreen } from "../screens/HomeScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { TrendsScreen } from "../screens/TrendsScreen";
import { DevScreen } from "../screens/DevScreen";
import { RecordingScreen } from "../screens/RecordingScreen";
import { PreviewScreen } from "../screens/PreviewScreen";
import { ProcessingScreen } from "../screens/ProcessingScreen";
import { ResultScreen } from "../screens/ResultScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TipsScreen } from "../screens/TipsScreen";
import { ScriptLibraryScreen } from "../screens/ScriptLibraryScreen";
import { PromptLibraryScreen } from "../screens/PromptLibraryScreen";
import { AddPromptScreen } from "../screens/AddPromptScreen";
import { PlanYourPointScreen } from "../screens/PlanYourPointScreen";
import { navigationRef } from "./navigationRef";
import { syncDailyReminder } from "../services/notifications/reminderScheduler";
import { logger } from "../utils/logger";
import type { Prompt, RecordingSubject } from "../domain/sessionTypes";
import { colors } from "../theme/theme";

export { navigationRef };

export type TabParamList = {
  Home: undefined;
  History: undefined;
  Trends: undefined;
  Tips: undefined;
  Dev: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Settings: undefined;
  ScriptLibrary: undefined;
  PromptLibrary: undefined;
  AddPrompt: undefined;
  PlanYourPoint: { prompt: Prompt };
  Recording: RecordingSubject;
  Preview: RecordingSubject & { videoUri: string; durationSecondsLocal: number };
  Processing: RecordingSubject & {
    sessionId: string;
    videoUri: string;
    durationSecondsLocal: number;
    wantsGrading: boolean;
    wantsNotionSync: boolean;
  };
  Result: { sessionId: string };
};

const JSTab = createBottomTabNavigator<TabParamList>();
const NativeTab = createNativeBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Android keeps the existing JS tab bar — this library's value for us is
// specifically the real native UITabBarController on iOS (which is what
// automatically picks up iOS 26's Liquid Glass styling, since that's an
// OS-level effect on Apple's own control, not something a library renders
// itself). Android's Material bottom nav doesn't gain anything from the
// native swap, so there's no reason to take on the icon-asset rework
// (native tab icons need real image/SF Symbol sources, not vector-icon
// components) for a platform where nothing actually changes.
function JSTabs() {
  return (
    <JSTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <JSTab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => <Ionicons name="mic-outline" size={size} color={color} />,
        }}
      />
      <JSTab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <JSTab.Screen
        name="Trends"
        component={TrendsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <JSTab.Screen
        name="Tips"
        component={TipsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="bulb-outline" size={size} color={color} />,
        }}
      />
      {__DEV__ ? (
        <JSTab.Screen
          name="Dev"
          component={DevScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Ionicons name="bug-outline" size={size} color={color} />,
          }}
        />
      ) : null}
    </JSTab.Navigator>
  );
}

function NativeTabs() {
  return (
    <NativeTab.Navigator
      // iOS 26's UITabBarController uses a *separate* appearance
      // (scrollEdgeAppearance) for when its associated scroll view is at
      // rest/edge, distinct from the floating "standard" appearance used
      // once you've scrolled. scrollEdgeAppearance is confirmed broken on
      // iOS 26+ in the installed version of this library — it has no effect
      // at all (github.com/callstack/react-native-bottom-tabs/issues/532) —
      // so it's kept here in case a future patch starts respecting it, but
      // don't expect it to do anything yet. minimizeBehavior="never" is the
      // actual experimental lever: it's a different feature (disables the
      // pill-minimize-on-scroll animation), but shares the same underlying
      // "observe descendant scroll view" plumbing, so there's a chance it
      // also short-circuits the buggy edge-appearance switch as a side
      // effect. Unconfirmed — remove if it doesn't help.
      minimizeBehavior="never"
      scrollEdgeAppearance="opaque"
      tabBarStyle={{ backgroundColor: colors.surface }}
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        // Without this, the native wrapper immediately behind each screen's
        // content has no background of its own and falls back to the system
        // default (white) wherever our own content doesn't paint over it —
        // most visibly in the padding added to clear the floating tab bar on
        // scrollable screens.
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <NativeTab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Today",
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "mic.fill" : "mic" }),
        }}
      />
      <NativeTab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "clock.fill" : "clock" }),
        }}
      />
      <NativeTab.Screen
        name="Trends"
        component={TrendsScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "chart.bar.fill" : "chart.bar" }),
        }}
      />
      <NativeTab.Screen
        name="Tips"
        component={TipsScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "lightbulb.fill" : "lightbulb" }),
        }}
      />
      {__DEV__ ? (
        <NativeTab.Screen
          name="Dev"
          component={DevScreen}
          options={{
            tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "ladybug.fill" : "ladybug" }),
          }}
        />
      ) : null}
    </NativeTab.Navigator>
  );
}

function Tabs() {
  return Platform.OS === "ios" ? <NativeTabs /> : <JSTabs />;
}

export function AppNavigator() {
  // Tapping the "session complete" notification (sessionCompleteNotifier.ts)
  // navigates to that session's Result screen, same tap-to-navigate pattern
  // as the in-app toast (see sessionProcessor.ts's goToResult).
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const sessionId = response.notification.request.content.data?.sessionId;
      if (typeof sessionId === "string" && navigationRef.isReady()) {
        navigationRef.navigate("Result", { sessionId });
      }
    });
    return () => subscription.remove();
  }, []);

  // A one-shot reminder (see reminderScheduler.syncDailyReminder) only covers
  // the single moment it was armed for — re-syncing on every launch is what
  // re-arms it after it fires, or after a day passed with the app never open.
  useEffect(() => {
    syncDailyReminder().catch((err) => logger.error(`[reminders] launch resync failed — ${(err as Error).message}`));
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="ScriptLibrary" component={ScriptLibraryScreen} />
        <Stack.Screen name="PromptLibrary" component={PromptLibraryScreen} />
        <Stack.Screen name="AddPrompt" component={AddPromptScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="PlanYourPoint" component={PlanYourPointScreen} />
        <Stack.Screen name="Recording" component={RecordingScreen} />
        <Stack.Screen name="Preview" component={PreviewScreen} />
        <Stack.Screen name="Processing" component={ProcessingScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
