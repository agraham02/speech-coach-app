import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { DarkTheme, DefaultTheme, NavigationContainer, type NavigatorScreenParams } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import { Ionicons } from "@expo/vector-icons";
import { HomeScreen } from "../screens/HomeScreen";
import { TodayScreen } from "../screens/TodayScreen";
import { LearnScreen } from "../screens/LearnScreen";
import { ProgressScreen } from "../screens/ProgressScreen";
import { LessonScreen } from "../screens/LessonScreen";
import { DailySessionScreen } from "../screens/DailySessionScreen";
import { DrillRunnerScreen } from "../screens/DrillRunnerScreen";
import { GuidedScreen } from "../screens/GuidedScreen";
import { ConversationRunnerScreen } from "../screens/ConversationRunnerScreen";
import { PrimeScreen } from "../screens/PrimeScreen";
import { DebriefScreen } from "../screens/DebriefScreen";
import { ConversationLogScreen } from "../screens/ConversationLogScreen";
import { AsrLabScreen } from "../screens/AsrLabScreen";
import { reconcileOnLaunch } from "../services/pipeline/reconcile";
import type { PracticeContext } from "../domain/practice";
import type { ConversationDrillType, DrillType } from "../domain/drills/drillSpecs";
import { HistoryScreen } from "../screens/HistoryScreen";
import { TrendsScreen } from "../screens/TrendsScreen";
import { DevScreen } from "../screens/DevScreen";
import { SHOW_DEV_TOOLS } from "../config/devTools";
import { RecordingScreen } from "../screens/RecordingScreen";
import { PreviewScreen } from "../screens/PreviewScreen";
import { ProcessingScreen } from "../screens/ProcessingScreen";
import { ResultScreen } from "../screens/ResultScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TipsScreen } from "../screens/TipsScreen";
import { MarkItUpScreen } from "../screens/MarkItUpScreen";
import { LineRepScreen } from "../screens/LineRepScreen";
import { AddTextScreen } from "../screens/AddTextScreen";
import { MarkEditScreen } from "../screens/MarkEditScreen";
import { SpeechStudyScreen } from "../screens/SpeechStudyScreen";
import { RehearseScreen } from "../screens/RehearseScreen";
import { PromptLibraryScreen } from "../screens/PromptLibraryScreen";
import { AddPromptScreen } from "../screens/AddPromptScreen";
import { PlanYourPointScreen } from "../screens/PlanYourPointScreen";
import { DrillsScreen } from "../screens/DrillsScreen";
import { DrillSessionScreen } from "../screens/DrillSessionScreen";
import { CurriculumScreen } from "../screens/CurriculumScreen";
import { navigationRef } from "./navigationRef";
import { syncDailyReminder } from "../services/notifications/reminderScheduler";
import { logger } from "../utils/logger";
import type { Prompt, RecordingSubject } from "../domain/sessionTypes";
import type { LineCategory } from "../content/lines";
import type { MarkLevel } from "../domain/cadence/marks";
import { useTheme } from "../theme/ThemeProvider";

export { navigationRef };

export type TabParamList = {
  Today: undefined;
  Learn: undefined;
  Progress: undefined;
  Library: undefined;
  Dev: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Settings: undefined;
  MarkItUp: { shelf?: "lines" | "mine" | "speeches" } | undefined;
  LineRep: { lineIds?: string[]; mineIds?: string[]; category?: LineCategory; mode?: "rep" | "lineOfDay"; practice?: PracticeContext } | undefined;
  AddText: undefined;
  MarkEdit: { id: string };
  SpeechStudy: { speechId: string };
  Rehearse: { speechId: string; markLevel?: MarkLevel };
  PromptLibrary: undefined;
  AddPrompt: undefined;
  PlanYourPoint: { prompt: Prompt };
  Drills: undefined;
  DrillSession: { twisterId?: string; practice?: PracticeContext };
  Drill: { drill: DrillType; contentId?: string; practice?: PracticeContext };
  Guided: { guidedId?: string; warmupId?: string; practice?: PracticeContext };
  Conversation: { drill: ConversationDrillType; contentId?: string; practice?: PracticeContext; blankMomentId?: string };
  Prime: undefined;
  Debrief: { eventId?: string } | undefined;
  ConversationLog: undefined;
  Lesson: { lessonId: string };
  DailySession: undefined;
  Practice: undefined;
  Frameworks: undefined;
  Trends: undefined;
  Curriculum: undefined;
  Recording: RecordingSubject;
  Preview: RecordingSubject & { videoUri: string; durationSecondsLocal: number };
  // Kept only as a redirect to Result, so older notification/deep links
  // still land somewhere sensible.
  Processing: { sessionId: string };
  Result: { sessionId: string; practice?: PracticeContext };
  AsrLab: undefined;
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
  const { colors } = useTheme();
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
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" size={size} color={color} />,
        }}
      />
      <JSTab.Screen
        name="Learn"
        component={LearnScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="school-outline" size={size} color={color} />,
        }}
      />
      <JSTab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <JSTab.Screen
        name="Library"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" size={size} color={color} />,
        }}
      />
      {SHOW_DEV_TOOLS ? (
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
  const { colors } = useTheme();
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
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "sun.max.fill" : "sun.max" }),
        }}
      />
      <NativeTab.Screen
        name="Learn"
        component={LearnScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "graduationcap.fill" : "graduationcap" }),
        }}
      />
      <NativeTab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "chart.bar.fill" : "chart.bar" }),
        }}
      />
      <NativeTab.Screen
        name="Library"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "square.stack.fill" : "square.stack" }),
        }}
      />
      {SHOW_DEV_TOOLS ? (
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
  const { scheme, colors } = useTheme();
  // Keeps React Navigation's own backgrounds (screen transitions, modals)
  // in step with the app's palette instead of its default light theme.
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.danger,
    },
  };
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
  // Resume analysis the app was killed in the middle of, and clean up
  // abandoned video files (see pipeline/reconcile.ts).
  useEffect(() => {
    reconcileOnLaunch();
  }, []);

  useEffect(() => {
    syncDailyReminder().catch((err) => logger.error(`[reminders] launch resync failed — ${(err as Error).message}`));
  }, []);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="AsrLab" component={AsrLabScreen} />
        <Stack.Screen name="Practice" component={HomeScreen} />
        <Stack.Screen name="Frameworks" component={TipsScreen} />
        <Stack.Screen name="Trends" component={TrendsScreen} />
        <Stack.Screen name="Drill" component={DrillRunnerScreen} />
        <Stack.Screen name="Guided" component={GuidedScreen} />
        <Stack.Screen name="Conversation" component={ConversationRunnerScreen} />
        <Stack.Screen name="Prime" component={PrimeScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="Debrief" component={DebriefScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="ConversationLog" component={ConversationLogScreen} />
        <Stack.Screen name="Lesson" component={LessonScreen} />
        <Stack.Screen name="DailySession" component={DailySessionScreen} />
        <Stack.Screen name="MarkItUp" component={MarkItUpScreen} />
        <Stack.Screen name="LineRep" component={LineRepScreen} />
        <Stack.Screen name="AddText" component={AddTextScreen} />
        <Stack.Screen name="MarkEdit" component={MarkEditScreen} />
        <Stack.Screen name="SpeechStudy" component={SpeechStudyScreen} />
        <Stack.Screen name="Rehearse" component={RehearseScreen} />
        <Stack.Screen name="PromptLibrary" component={PromptLibraryScreen} />
        <Stack.Screen name="AddPrompt" component={AddPromptScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="PlanYourPoint" component={PlanYourPointScreen} />
        <Stack.Screen name="Drills" component={DrillsScreen} />
        <Stack.Screen name="DrillSession" component={DrillSessionScreen} />
        <Stack.Screen name="Curriculum" component={CurriculumScreen} />
        <Stack.Screen name="Recording" component={RecordingScreen} />
        <Stack.Screen name="Preview" component={PreviewScreen} />
        <Stack.Screen name="Processing" component={ProcessingScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
