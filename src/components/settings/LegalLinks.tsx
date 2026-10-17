import { Alert, Linking } from "react-native";
import { ListGroup, ListRow } from "../common/ListRow";
import { PRIVACY_POLICY_URL, TERMS_URL } from "../../config/legalLinks";

function open(title: string, url: string) {
  if (!url) {
    Alert.alert(title, "This link isn't set up yet.");
    return;
  }
  Linking.openURL(url).catch(() => Alert.alert(title, "Couldn't open the page. Check your connection and try again."));
}

// Settings: the privacy policy and terms of service. Both open the published
// pages in the browser, so the text can be fixed without a new release.
export function LegalLinks() {
  return (
    <ListGroup>
      <ListRow icon="shield-checkmark-outline" title="Privacy policy" subtitle="What stays on your phone, and what is sent when you choose" chevron onPress={() => open("Privacy policy", PRIVACY_POLICY_URL)} />
      <ListRow icon="document-text-outline" title="Terms of service" chevron onPress={() => open("Terms of service", TERMS_URL)} />
    </ListGroup>
  );
}
