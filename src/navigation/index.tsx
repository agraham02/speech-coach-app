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
import { SummaryRunnerScreen } from "../screens/SummaryRunnerScreen";
import { PrimeScreen } from "../screens/PrimeScreen";
import { DebriefScreen } from "../screens/DebriefScreen";
import { ConversationLogScreen } from "../screens/ConversationLogScreen";
import { AsrLabScreen } from "../screens/dev/AsrLabScreen";
import { LogsScreen } from "../screens/dev/LogsScreen";
import { PipelineScreen } from "../screens/dev/PipelineScreen";
import { SessionDetailScreen } from "../screens/dev/SessionDetailScreen";
import { ArtifactScreen } from "../screens/dev/ArtifactScreen";
import { FaceLabScreen } from "../screens/dev/FaceLabScreen";
import { ToolsScreen } from "../screens/dev/ToolsScreen";
import type { ArtifactKind } from "../services/db/artifactsRepo";
import type { LogLevelFilter } from "../domain/dev/logFilter";
import { reconcileOnLaunch } from "../services/pipeline/reconcile";
import { autoCleanupVideos } from "../services/data/videoKeepsakes";
import type { PracticeContext } from "../domain/practice";
import type { ConversationDrillType, DrillType, SummaryDrillType } from "../domain/drills/drillSpecs";
import { HistoryScreen } from "../screens/HistoryScreen";
import { TrendsScreen } from "../screens/TrendsScreen";
import type { SkillId } from "../theme/tokens";
import { SkillDetailScreen } from "../screens/SkillDetailScreen";
import { DevHomeScreen } from "../screens/dev/DevHomeScreen";
import { SHOW_DEV_TOOLS } from "../config/devTools";
import { RecordingScreen } from "../screens/RecordingScreen";
import { PreviewScreen } from "../screens/PreviewScreen";
import { ProcessingScreen } from "../screens/ProcessingScreen";
import { ResultScreen } from "../screens/ResultScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { YouScreen } from "../screens/YouScreen";
import { PhrasebookScreen } from "../screens/PhrasebookScreen";
import { ThreeThingsScreen } from "../screens/ThreeThingsScreen";
import { TalkBackScreen } from "../screens/TalkBackScreen";
import { RewindScreen } from "../screens/RewindScreen";
import { RewindRecordScreen } from "../screens/RewindRecordScreen";
import { RewindResultScreen } from "../screens/RewindResultScreen";
import { syncRewindReminder } from "../services/rewind/rewindReminder";
import { autoCleanupRewindAudio } from "../services/rewind/rewindCleanup";
import { ThoughtChallengeScreen } from "../screens/ThoughtChallengeScreen";
import { ThreeThingsListScreen } from "../screens/ThreeThingsListScreen";
import type { SettingsSection } from "../components/settings/sections";
import { TipsScreen } from "../screens/TipsScreen";
import { SourcesScreen } from "../screens/SourcesScreen";
import { MarkItUpScreen } from "../screens/MarkItUpScreen";
import { LineRepScreen } from "../screens/LineRepScreen";
import { AddTextScreen } from "../screens/AddTextScreen";
import { MarkEditScreen } from "../screens/MarkEditScreen";
import { SpeechStudyScreen } from "../screens/SpeechStudyScreen";
import { RehearseScreen } from "../screens/RehearseScreen";
import { MoveItScreen } from "../screens/MoveItScreen";
import { FeelingScreen } from "../screens/FeelingScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { SetupCheckScreen } from "../screens/SetupCheckScreen";
import { SkillCheckScreen } from "../screens/SkillCheckScreen";
import { StartingPointScreen } from "../screens/StartingPointScreen";
import { OnboardingGateScreen } from "../screens/OnboardingGateScreen";
import { isOnboardingComplete, removeObsoletePrefs } from "../services/prefs/prefsStore";
import { deleteRemovedSecrets } from "../services/secrets/secretsStore";
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
import { TabBar } from "../components/common/TabBar";

export { navigationRef };

export type TabParamList = {
  Today: undefined;
  Learn: undefined;
  Library: undefined;
  You: undefined;
  Dev: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  // One section of Settings, or the list of them with no section.
  Settings: { section?: SettingsSection } | undefined;
  Progress: undefined;
  // One skill's rating: what moves it, and its recent changes.
  SkillDetail: { skill: SkillId };
  Phrasebook: undefined;
  ThreeThings: undefined;
  TalkBack: undefined;
  Rewind: undefined;
  RewindRecord: undefined;
  RewindResult: { id: string };
  ThoughtChallenge: { thoughtId: string };
  // capstone: the wrap-up after thirty days.
  ThreeThingsList: { capstone?: boolean } | undefined;
  MarkItUp: { shelf?: "lines" | "mine" | "speeches" } | undefined;
  LineRep: { lineIds?: string[]; mineIds?: string[]; phraseIds?: string[]; aboutYou?: boolean; category?: LineCategory; mode?: "rep" | "lineOfDay"; practice?: PracticeContext } | undefined;
  AddText: undefined;
  MarkEdit: { id: string };
  SpeechStudy: { speechId: string };
  Rehearse: { speechId: string; markLevel?: MarkLevel };
  MoveIt: { practice?: PracticeContext } | undefined;
  Feeling: { practice?: PracticeContext } | undefined;
  OnboardingGate: undefined;
  // "profile": the questions only, for someone who's used the app before.
  Onboarding: { mode?: "full" | "profile" } | undefined;
  SetupCheck: undefined;
  // defer: put it off until tomorrow. retake: the 30-day check.
  SkillCheck: { defer?: boolean; retake?: boolean } | undefined;
  StartingPoint: { checkId: string };
  PromptLibrary: undefined;
  AddPrompt: undefined;
  PlanYourPoint: { prompt: Prompt };
  Drills: undefined;
  DrillSession: { twisterId?: string; practice?: PracticeContext };
  Drill: { drill: DrillType; contentId?: string; practice?: PracticeContext };
  Guided: { guidedId?: string; warmupId?: string; practice?: PracticeContext };
  Conversation: { drill: ConversationDrillType; contentId?: string; practice?: PracticeContext; blankMomentId?: string };
  Summary: { drill: SummaryDrillType; contentId?: string; practice?: PracticeContext };
  Prime: undefined;
  Debrief: { eventId?: string } | undefined;
  ConversationLog: undefined;
  Lesson: { lessonId: string };
  // slot 1-2: a daily-goal top-up instead of the main plan.
  DailySession: { slot?: 1 | 2 } | undefined;
  Practice: undefined;
  Frameworks: undefined;
  Sources: undefined;
  Trends: undefined;
  Curriculum: undefined;
  Recording: RecordingSubject;
  Preview: RecordingSubject & { videoUri: string; durationSecondsLocal: number };
  // Kept only as a redirect to Result, so older notification/deep links
  // still land somewhere sensible.
  Processing: { sessionId: string };
  Result: { sessionId: string; practice?: PracticeContext };
  AsrLab: undefined;
  DevLogs: { tag?: string; level?: LogLevelFilter } | undefined;
  DevPipeline: { problemsOnly?: boolean } | undefined;
  DevSession: { sessionId: string };
  DevArtifact: { sessionId: string; kind: ArtifactKind };
  DevFaceLab: undefined;
  DevTools: undefined;
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
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
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
        name="Library"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" size={size} color={color} />,
        }}
      />
      <JSTab.Screen
        name="You"
        component={YouScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} />,
        }}
      />
      {SHOW_DEV_TOOLS ? (
        <JSTab.Screen
          name="Dev"
          component={DevHomeScreen}
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
      tabBarStyle={{ backgroundColor: colors.background }}
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
        name="Library"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "square.stack.fill" : "square.stack" }),
        }}
      />
      <NativeTab.Screen
        name="You"
        component={YouScreen}
        options={{
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? "person.crop.circle.fill" : "person.crop.circle" }),
        }}
      />
      {SHOW_DEV_TOOLS ? (
        <NativeTab.Screen
          name="Dev"
          component={DevHomeScreen}
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

// `onReady` fires once the first screen is mounted (App.tsx hides the
// splash then).
export function AppNavigator({ onReady }: { onReady?: () => void }) {
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
      const data = response.notification.request.content.data;
      if (typeof data?.sessionId === "string" && navigationRef.isReady()) {
        navigationRef.navigate("Result", { sessionId: data.sessionId });
      } else if (data?.route === "Rewind" && navigationRef.isReady()) {
        navigationRef.navigate("Rewind");
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
    removeObsoletePrefs();
    deleteRemovedSecrets().catch(() => undefined);
    reconcileOnLaunch();
    autoCleanupVideos().catch((err) => logger.error(`[videos] auto-cleanup failed — ${(err as Error).message}`));
    autoCleanupRewindAudio().catch((err) => logger.error(`[rewind] audio cleanup failed — ${(err as Error).message}`));
  }, []);

  useEffect(() => {
    syncDailyReminder().catch((err) => logger.error(`[reminders] launch resync failed — ${(err as Error).message}`));
    syncRewindReminder().catch((err) => logger.error(`[rewind] launch resync failed — ${(err as Error).message}`));
  }, []);

  // If tapping the evening nudge is what launched the app, the listener above
  // wasn't there yet: open Rewind once the navigator is ready.
  function openFromLaunchNotification() {
    onReady?.();
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification.request.content.data?.route === "Rewind") {
      Notifications.clearLastNotificationResponse();
      navigationRef.navigate("Rewind");
    }
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={openFromLaunchNotification}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={isOnboardingComplete() ? "Tabs" : "OnboardingGate"}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="OnboardingGate" component={OnboardingGateScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="SetupCheck" component={SetupCheckScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="SkillCheck" component={SkillCheckScreen} />
        <Stack.Screen name="StartingPoint" component={StartingPointScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Progress" component={ProgressScreen} />
        <Stack.Screen name="Phrasebook" component={PhrasebookScreen} />
        <Stack.Screen name="ThreeThings" component={ThreeThingsScreen} />
        <Stack.Screen name="TalkBack" component={TalkBackScreen} />
        <Stack.Screen name="Rewind" component={RewindScreen} />
        <Stack.Screen name="RewindRecord" component={RewindRecordScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="RewindResult" component={RewindResultScreen} />
        <Stack.Screen name="ThoughtChallenge" component={ThoughtChallengeScreen} />
        <Stack.Screen name="ThreeThingsList" component={ThreeThingsListScreen} />
        {SHOW_DEV_TOOLS ? (
          <Stack.Group>
            <Stack.Screen name="DevLogs" component={LogsScreen} />
            <Stack.Screen name="DevPipeline" component={PipelineScreen} />
            <Stack.Screen name="DevSession" component={SessionDetailScreen} />
            <Stack.Screen name="DevArtifact" component={ArtifactScreen} />
            <Stack.Screen name="DevFaceLab" component={FaceLabScreen} />
            <Stack.Screen name="DevTools" component={ToolsScreen} />
            <Stack.Screen name="AsrLab" component={AsrLabScreen} />
          </Stack.Group>
        ) : null}
        <Stack.Screen name="Practice" component={HomeScreen} />
        <Stack.Screen name="Frameworks" component={TipsScreen} />
        <Stack.Screen name="Sources" component={SourcesScreen} />
        <Stack.Screen name="Trends" component={TrendsScreen} />
        <Stack.Screen name="SkillDetail" component={SkillDetailScreen} />
        <Stack.Screen name="Drill" component={DrillRunnerScreen} />
        <Stack.Screen name="Guided" component={GuidedScreen} />
        <Stack.Screen name="Conversation" component={ConversationRunnerScreen} />
        <Stack.Screen name="Summary" component={SummaryRunnerScreen} />
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
        <Stack.Screen name="MoveIt" component={MoveItScreen} />
        <Stack.Screen name="Feeling" component={FeelingScreen} />
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
