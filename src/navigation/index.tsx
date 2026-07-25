import { NavigationContainer, type NavigatorScreenParams } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
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
import type { Prompt } from "../domain/sessionTypes";
import { colors } from "../theme/theme";

export type TabParamList = {
  Home: undefined;
  History: undefined;
  Trends: undefined;
  Dev: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Settings: undefined;
  Recording: { prompt: Prompt };
  Preview: { prompt: Prompt; videoUri: string; durationSecondsLocal: number };
  Processing: {
    sessionId: string;
    prompt: Prompt;
    videoUri: string;
    durationSecondsLocal: number;
    wantsGrading: boolean;
    wantsNotionSync: boolean;
  };
  Result: { sessionId: string };
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => <Ionicons name="mic-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Trends"
        component={TrendsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Dev"
        component={DevScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="bug-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="Recording" component={RecordingScreen} />
        <Stack.Screen name="Preview" component={PreviewScreen} />
        <Stack.Screen name="Processing" component={ProcessingScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
