import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { ChoiceList } from "../components/common/ChoiceList";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { useToast } from "../components/common/ToastProvider";
import { SignInOptions } from "../components/account/SignInOptions";
import { allowanceLine } from "../domain/aiAllowance";
import { MANAGE_SUBSCRIPTIONS_URL, planDetail, planPriceLine, PLUS_MONTHLY_REVIEWS, PRIVACY_URL, renewalNotice, TERMS_URL, type PlusPlan } from "../domain/plus";
import { useAccount } from "../services/account/accountStore";
import { askCloudConsent } from "../services/cloud/consent";
import { hasConsent, PROVIDERS } from "../services/cloud/providers";
import { buyPlus, loadPlusOffer, purchasesEnabled, restorePlus, type PlusOffer } from "../services/purchases/purchases";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Paywall">;

// Tono Plus: what it adds, the two plans at the store's own prices, and, right
// by the button, what App Review needs shown (length, price, that it renews,
// how to stop it, Restore, Terms and Privacy). Plus belongs to the Tono
// account, so a signed-out visitor signs in first.
export function PaywallScreen({ navigation }: Props) {
  const styles = useStyles();
  const showToast = useToast();
  const account = useAccount();
  const signedIn = account.status === "signedIn";
  const isPlus = account.allowance?.plan === "plus";
  const enabled = purchasesEnabled();

  const [offer, setOffer] = useState<PlusOffer | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState<PlusPlan["id"]>("annual");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const loaded = await loadPlusOffer();
      if (loaded.plans.length === 0) throw new Error("no plans");
      setOffer(loaded);
      setChoice(loaded.plans[0].id);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (enabled && signedIn && !isPlus && !offer) void load();
  }, [enabled, signedIn, isPlus, offer, load]);

  const plan = offer?.plans.find((p) => p.id === choice) ?? offer?.plans[0] ?? null;

  async function subscribe() {
    if (!plan || !offer || busy) return;
    setBusy("buy");
    const result = await buyPlus(plan, offer);
    setBusy(null);
    if (result.ok) {
      showToast(result.plus ? "You have Tono Plus." : "Thank you. Tono Plus switches on in a moment.", result.plus ? "success" : "info");
      navigation.goBack();
    } else if (!result.cancelled) {
      showToast(result.message, "error");
    }
  }

  async function restore() {
    if (busy) return;
    setBusy("restore");
    const result = await restorePlus();
    setBusy(null);
    if (!result.ok) {
      if (!result.cancelled) showToast(result.message, "error");
      return;
    }
    if (result.plus) {
      showToast("Tono Plus is back.", "success");
      navigation.goBack();
    } else {
      showToast("No Tono Plus purchase was found for this Apple ID.", "info");
    }
  }

  const included = (
    <ListGroup title="What Plus adds">
      <ListRow icon="videocam-outline" title={`${PLUS_MONTHLY_REVIEWS} AI video reviews a month`} subtitle="Tono AI watches your take and scores it, the way a coach would." />
      <ListRow icon="sparkles-outline" title="Coaching on every take" subtitle="Your strength, one change to make, and the skill to work on next." />
      <ListRow icon="chatbubble-ellipses-outline" title="Say it short, Rewind and Mark it up" subtitle="Notes on these come with Plus too." />
      <ListRow icon="lock-closed-outline" title="Your recordings stay on your phone" subtitle="Only the take being reviewed is sent, and it is deleted afterward." />
    </ListGroup>
  );

  if (!enabled) {
    return (
      <Screen title="Tono Plus" onBack={() => navigation.goBack()}>
        <Txt variant="subhead" tone="secondary">
          Tono Plus isn't available yet.
        </Txt>
      </Screen>
    );
  }

  if (isPlus) {
    return (
      <Screen title="Tono Plus" onBack={() => navigation.goBack()}>
        <Card style={styles.card}>
          <Txt variant="headline">You have Tono Plus</Txt>
          {account.allowance ? (
            <Txt variant="subhead" tone="secondary">
              {allowanceLine(account.allowance)}
            </Txt>
          ) : null}
        </Card>
        {included}
        <ListGroup>
          <ListRow icon="card-outline" title="Manage subscription" subtitle="Change or cancel in your Apple ID settings" chevron onPress={() => Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)} />
        </ListGroup>
      </Screen>
    );
  }

  return (
    <Screen
      title="Tono Plus"
      eyebrow="More AI reviews"
      onBack={() => navigation.goBack()}
      footer={
        signedIn && plan ? (
          <View style={styles.footer}>
            <PrimaryButton label={`Continue · ${planPriceLine(plan)}`} loading={busy === "buy"} disabled={!!busy} onPress={subscribe} />
            <Txt variant="caption1" tone="muted" style={styles.notice}>
              {renewalNotice(plan)}
            </Txt>
            <View style={styles.links}>
              <PrimaryButton label="Restore purchases" variant="ghost" size="sm" loading={busy === "restore"} disabled={!!busy} onPress={restore} />
              <PrimaryButton label="Terms" variant="ghost" size="sm" onPress={() => Linking.openURL(TERMS_URL)} />
              <PrimaryButton label="Privacy" variant="ghost" size="sm" onPress={() => Linking.openURL(PRIVACY_URL)} />
            </View>
          </View>
        ) : undefined
      }
    >
      {included}

      {!signedIn ? (
        <Card style={styles.card}>
          <Txt variant="headline">Plus belongs to your Tono account</Txt>
          <Txt variant="subhead" tone="secondary">
            Sign in first, so Plus follows you to a new phone. The rest of Tono doesn't need an account.
          </Txt>
          <SignInOptions
            onSignedIn={async () => {
              if (!hasConsent("tono")) await askCloudConsent(PROVIDERS.tono);
            }}
          />
          <View style={styles.links}>
            <PrimaryButton label="Terms" variant="ghost" size="sm" onPress={() => Linking.openURL(TERMS_URL)} />
            <PrimaryButton label="Privacy" variant="ghost" size="sm" onPress={() => Linking.openURL(PRIVACY_URL)} />
          </View>
        </Card>
      ) : offer ? (
        <ChoiceList
          options={offer.plans.map((p) => ({ key: p.id, label: `${p.title} · ${planPriceLine(p)}`, detail: planDetail(p) }))}
          value={choice}
          onChange={setChoice}
        />
      ) : failed ? (
        <Card style={styles.card}>
          <Txt variant="subhead" tone="secondary">
            Couldn't load the prices from the App Store. Check your connection and try again.
          </Txt>
          <PrimaryButton label="Try again" variant="secondary" size="sm" onPress={load} />
        </Card>
      ) : (
        <Txt variant="subhead" tone="secondary">
          Loading prices…
        </Txt>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  footer: { gap: t.space.sm },
  notice: { textAlign: "center" },
  links: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: t.space.xs },
}));
