import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { AccountSettings } from "../components/settings/AccountSettings";
import { AppFooter } from "../components/settings/AppFooter";
import { DeepReviewSettings } from "../components/settings/DeepReviewSettings";
import { GoalReminderSettings } from "../components/settings/GoalReminderSettings";
import { HelpDataSettings } from "../components/settings/HelpDataSettings";
import { LegalLinks } from "../components/settings/LegalLinks";
import { OnDeviceAiSettings } from "../components/settings/OnDeviceAiSettings";
import { PermissionSettings } from "../components/settings/PermissionSettings";
import { PracticeSettings } from "../components/settings/PracticeSettings";
import { SETTINGS_SECTIONS, type SettingsSection } from "../components/settings/sections";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

const SECTION_BODY: Record<SettingsSection, () => React.JSX.Element> = {
  practice: PracticeSettings,
  goal: GoalReminderSettings,
  ai: OnDeviceAiSettings,
  account: AccountSettings,
  deepReviews: DeepReviewSettings,
  permissions: PermissionSettings,
  help: HelpDataSettings,
};

// One section of Settings, opened from the You tab — or, with no section,
// the list of them all.
export function SettingsScreen({ route }: Props) {
  const styles = useStyles();
  const navigation = useNavigation<Props["navigation"]>();
  const section = route.params?.section;

  if (!section) {
    return (
      <Screen title="Settings" onBack={() => navigation.goBack()} contentStyle={styles.content}>
        <ListGroup>
          {SETTINGS_SECTIONS.map((s) => (
            <ListRow key={s.key} icon={s.icon} title={s.title} subtitle={s.subtitle} chevron onPress={() => navigation.navigate("Settings", { section: s.key })} />
          ))}
        </ListGroup>
        <LegalLinks />
        <AppFooter />
      </Screen>
    );
  }

  const Body = SECTION_BODY[section];
  const title = SETTINGS_SECTIONS.find((s) => s.key === section)?.title ?? "Settings";
  return (
    <Screen title={title} onBack={() => navigation.goBack()} contentStyle={styles.content}>
      <Body />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg },
}));
