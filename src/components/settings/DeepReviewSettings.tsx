import { useEffect, useState } from "react";
import { cleanApiKey, isValidModelId, MAX_KEY_LENGTH, MAX_MODEL_LENGTH, providerForKey } from "../../services/cloud/inputGuards";
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
import {
  getCloudConsent,
  getCloudModel,
  getCloudProvider,
  getCloudReviewDefault,
  getShareProfileWithReviews,
  getUserProfile,
  setCloudConsent,
  setCloudModel,
  setCloudProvider,
  setCloudReviewDefault,
  setShareProfileWithReviews,
} from "../../services/prefs/prefsStore";
import { buildSpeakerContext } from "../../domain/reviewerContext";
import { todayISODate } from "../../utils/dateUtils";
import { SwitchRow } from "../common/ListRow";
import { DeepReviewUsage } from "./DeepReviewUsage";
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
  const [shareProfile, setShareProfile] = useState(getShareProfileWithReviews());
  const [everyTake, setEveryTake] = useState(getCloudReviewDefault());
  // Exactly what would be added to a review's prompt, minus its framing.
  const contextPreview = buildSpeakerContext(getUserProfile(), todayISODate())
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2))
    .join("\n");

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

  async function commitKey() {
    const cleaned = cleanApiKey(key);
    setKey(cleaned);
    await setProviderKey(providerId, cleaned);
    return cleaned;
  }

  function commitModel() {
    const trimmed = model.trim();
    if (trimmed && !isValidModelId(trimmed)) {
      showToast("That doesn't look like a model ID — letters, numbers, dots, dashes, colons and slashes only.", "error");
      setModel(getCloudModel(providerId) ?? "");
      return;
    }
    setModel(trimmed);
    setCloudModel(providerId, trimmed);
  }

  async function check() {
    const cleaned = await commitKey();
    if (!cleaned) {
      showToast(`Paste your ${provider.name} key first.`, "error");
      return;
    }
    const looksLike = providerForKey(cleaned);
    if (looksLike && looksLike !== providerId) {
      const other = PROVIDERS[looksLike].name;
      showToast(`That looks like ${/^[aeiou]/i.test(other) ? "an" : "a"} ${other} key. Choose ${other} above, or paste your ${provider.name} key.`, "error");
      return;
    }
    setChecking(true);
    const problem = await checkProviderKey(providerId, cleaned).catch(() => "Couldn't check the key — check your connection and try again.");
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
        Your phone measures pace, pauses, fillers and eye contact. A deep review adds the judgment calls — structure, tone, presence — and
        Tono leans on it for your scores and your plan. Connect your own key from one of these providers; you pay them directly, usually a few
        cents a review.
      </Txt>
      <Card style={styles.section}>
        <SwitchRow
          title="Review every take"
          subtitle={
            allowed
              ? "Each take you keep gets a deep review. You can still turn it off for one take on its save screen."
              : `On once ${provider.company} is allowed below. Until then, everything stays on this phone.`
          }
          value={everyTake}
          onValueChange={(on) => {
            setEveryTake(on);
            setCloudReviewDefault(on);
          }}
        />
      </Card>
      <ChoiceList
        options={PROVIDER_ORDER.map((id) => ({ key: id, label: PROVIDERS[id].name, detail: PROVIDERS[id].blurb }))}
        value={providerId}
        onChange={choose}
      />

      <Card style={styles.section}>
        <SwitchRow
          title="Tell reviews about you"
          subtitle="What you said in setup, so feedback fits what you're working on."
          value={shareProfile}
          onValueChange={(on) => {
            setShareProfile(on);
            setShareProfileWithReviews(on);
          }}
        />
        {shareProfile ? (
          <Txt variant="footnote" tone="secondary">
            {contextPreview || "Nothing to share yet — answer the profile questions in Settings → Practice."}
          </Txt>
        ) : null}
      </Card>

      <Card style={styles.section}>
        <Txt variant="headline">{provider.name}</Txt>
        <TextField
          label="API key"
          caption={`${provider.keyHint}. Stored in this phone's keychain only.`}
          value={key}
          onChangeText={setKey}
          onCommit={commitKey}
          secret
          maxLength={MAX_KEY_LENGTH}
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
          onCommit={commitModel}
          placeholder={provider.defaultModel}
          maxLength={MAX_MODEL_LENGTH}
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
      <DeepReviewUsage />
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
