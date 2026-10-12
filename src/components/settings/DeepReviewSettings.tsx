import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { ChoiceList } from "../common/ChoiceList";
import { PrimaryButton } from "../common/PrimaryButton";
import { TextField } from "../common/TextField";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { PROVIDER_ORDER, PROVIDERS, whatGetsSent, type ProviderId } from "../../services/cloud/providers";
import { askCloudConsent } from "../../services/cloud/consent";
import { checkProviderKey } from "../../services/cloud/textProviders";
import { getCloudConsent, getCloudModel, getCloudProvider, setCloudConsent, setCloudModel, setCloudProvider } from "../../services/prefs/prefsStore";
import { getProviderKey, setProviderKey } from "../../services/secrets/secretsStore";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Settings → Deep reviews: bring your own key. The app stays free; a deep
// review calls the provider chosen here, with the user's key.
export function DeepReviewSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [providerId, setProviderId] = useState<ProviderId>(getCloudProvider());
  const provider = PROVIDERS[providerId];
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProviderKey(providerId).then((k) => !cancelled && setKey(k ?? ""));
    setModel(getCloudModel(providerId) ?? "");
    setAllowed(getCloudConsent().includes(providerId));
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  function choose(id: ProviderId) {
    setCloudProvider(id);
    setProviderId(id);
  }

  async function check() {
    setChecking(true);
    await setProviderKey(providerId, key);
    const problem = await checkProviderKey(providerId, key);
    setChecking(false);
    showToast(problem ?? `${provider.name} accepted the key.`, problem ? "error" : "success");
  }

  async function toggleAllowed() {
    if (allowed) {
      setCloudConsent(providerId, false);
      setAllowed(false);
      return;
    }
    setAllowed(await askCloudConsent(provider));
  }

  return (
    <View style={styles.wrap}>
      <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
        Deep reviews — bring your own key
      </Txt>
      <Txt variant="subhead" tone="secondary" style={styles.intro}>
        Speech Coach is free and works fully on your phone. For an optional AI deep review of a take, connect your own key from one of these
        providers — you pay them directly, usually a few cents a review.
      </Txt>
      <ChoiceList
        options={PROVIDER_ORDER.map((id) => ({ key: id, label: PROVIDERS[id].name, detail: PROVIDERS[id].blurb }))}
        value={providerId}
        onChange={choose}
      />

      <Card style={styles.section}>
        <Txt variant="headline">{provider.name}</Txt>
        <TextField
          label="API key"
          caption={`${provider.keyHint}. Stored in this phone's keychain only.`}
          value={key}
          onChangeText={setKey}
          onCommit={() => setProviderKey(providerId, key)}
          secret
        />
        <View style={styles.buttons}>
          <PrimaryButton label="Get a key" variant="secondary" size="sm" icon="open-outline" onPress={() => Linking.openURL(provider.keyUrl)} />
          <PrimaryButton label="Check key" variant="secondary" size="sm" icon="checkmark-done-outline" loading={checking} onPress={check} />
        </View>
        <TextField
          label="Model"
          caption={provider.modelHint}
          value={model}
          onChangeText={setModel}
          onCommit={() => setCloudModel(providerId, model)}
          placeholder={provider.defaultModel}
        />
        <View style={styles.disclosure}>
          <Ionicons name={provider.input === "video" ? "videocam-outline" : "document-text-outline"} size={18} color={colors.textSecondary} />
          <Txt variant="footnote" tone="secondary" style={styles.flex}>
            {whatGetsSent(provider)}
          </Txt>
        </View>
        <PrimaryButton
          label={allowed ? `Stop sending to ${provider.company}` : `Allow sending to ${provider.company}`}
          variant={allowed ? "ghost" : "secondary"}
          size="sm"
          onPress={toggleAllowed}
          style={styles.allow}
        />
      </Card>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.md },
  groupTitle: { paddingHorizontal: 4, marginBottom: -t.space.sm },
  intro: { paddingHorizontal: 4 },
  section: { gap: t.space.md },
  buttons: { flexDirection: "row", gap: t.space.sm, flexWrap: "wrap" },
  disclosure: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  flex: { flex: 1 },
  allow: { alignSelf: "flex-start" },
}));
