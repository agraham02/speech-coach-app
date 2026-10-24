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
import { allowanceLine, dayLabel, isPaidPlan } from "../domain/aiAllowance";
import { buyLabel, MANAGE_SUBSCRIPTIONS_URL, planDetail, PLUS_MONTHLY_JUDGED_TAKES, PRIVACY_URL, renewalNotice, TERMS_URL, trialLine, type PlusPlan } from "../domain/plus";
import { useAccount } from "../services/account/accountStore";
import { askTonoConsent } from "../services/cloud/consent";
import { tonoAgeGated } from "../services/cloud/routing";
import { hasTonoConsent } from "../services/prefs/prefsStore";
import { buyPlus, loadPlusOffer, purchasesEnabled, restorePlus, type PlusOffer } from "../services/purchases/purchases";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Paywall">;

// Tono Plus: what it adds, the two plans at the store's own prices, the free
// trial when the App Store says this Apple ID can still have it, and, right
// by the button, what App Review needs shown (trial length, price after it,
// that it renews, how to stop it, Restore, Terms and Privacy). No sign-in:
// the purchase belongs to the Tono account made behind the scenes.
export function PaywallScreen({ navigation }: Props) {
  const styles = useStyles();
  const showToast = useToast();
  const account = useAccount();
  const paying = isPaidPlan(account.allowance);
  const enabled = purchasesEnabled();
  const minor = tonoAgeGated();

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
    if (enabled && !paying && !minor && !offer) void load();
  }, [enabled, paying, minor, offer, load]);

  const plan = offer?.plans.find((p) => p.id === choice) ?? offer?.plans[0] ?? null;

  async function subscribe() {
    if (!plan || !offer || busy) return;
    setBusy("buy");
    const result = await buyPlus(plan, offer);
    setBusy(null);
    if (result.ok) {
      showToast(result.plus ? (plan.trialDays ? "Your free trial has started." : "You have Tono Plus.") : "Thank you. Tono Plus switches on in a moment.", result.plus ? "success" : "info");
      // Plus is Tono AI: ask the one consent now rather than at the first take.
      if (!hasTonoConsent()) await askTonoConsent();
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
      <ListRow
        icon="sparkles-outline"
        title={`${PLUS_MONTHLY_JUDGED_TAKES} judged takes a month`}
        subtitle="Tono AI judges what you said and how it came across, from your words and your phone's measurements, and coaches the next take."
      />
      <ListRow icon="link-outline" title="Your drills, checked" subtitle="Word Chain, Bridge Chain, Rewind and Say it short get notes on what you said." />
      <ListRow icon="create-outline" title="Mark it up with Tono AI" subtitle="Delivery marks written for your own text." />
      <ListRow icon="lock-closed-outline" title="Your recordings stay on your phone" subtitle="Only the words and numbers of a take are sent, and nothing is kept after it's judged." />
    </ListGroup>
  );

  const legal = (
    <View style={styles.links}>
      <PrimaryButton label="Restore purchases" variant="ghost" size="sm" loading={busy === "restore"} disabled={!!busy} onPress={restore} />
      <PrimaryButton label="Terms" variant="ghost" size="sm" onPress={() => Linking.openURL(TERMS_URL)} />
      <PrimaryButton label="Privacy" variant="ghost" size="sm" onPress={() => Linking.openURL(PRIVACY_URL)} />
    </View>
  );

  if (!enabled || minor) {
    return (
      <Screen title="Tono Plus" onBack={() => navigation.goBack()}>
        <Txt variant="subhead" tone="secondary">
          {minor ? "Tono Plus is Tono AI, which is for people 18 and over. Everything your phone measures, and its tips, work as always." : "Tono Plus isn't available yet."}
        </Txt>
      </Screen>
    );
  }

  if (paying) {
    const trial = account.allowance?.plan === "trial";
    return (
      <Screen title="Tono Plus" onBack={() => navigation.goBack()}>
        <Card style={styles.card}>
          <Txt variant="headline">{trial ? "Your free trial is on" : "You have Tono Plus"}</Txt>
          {account.allowance ? (
            <Txt variant="subhead" tone="secondary">
              {allowanceLine(account.allowance)}
            </Txt>
          ) : null}
          {trial && account.allowance?.trialEndsAt ? (
            <Txt variant="footnote" tone="secondary">
              It turns into your plan on {dayLabel(account.allowance.trialEndsAt)} unless you cancel at least 24 hours before.
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

  const anyTrial = offer?.plans.some((p) => p.trialDays);

  return (
    <Screen
      title="Tono Plus"
      eyebrow={anyTrial ? "Try it free" : "Judged takes and coaching"}
      onBack={() => navigation.goBack()}
      footer={
        plan ? (
          <View style={styles.footer}>
            <PrimaryButton label={buyLabel(plan)} loading={busy === "buy"} disabled={!!busy} onPress={subscribe} />
            <Txt variant="caption1" tone="muted" style={styles.notice}>
              {renewalNotice(plan)}
            </Txt>
            {legal}
          </View>
        ) : undefined
      }
    >
      {included}

      {offer ? (
        <ChoiceList
          options={offer.plans.map((p) => ({ key: p.id, label: `${p.title} · ${trialLine(p)}`, detail: planDetail(p) }))}
          value={choice}
          onChange={setChoice}
        />
      ) : failed ? (
        <Card style={styles.card}>
          <Txt variant="subhead" tone="secondary">
            Couldn't load the prices from the App Store. Check your connection and try again.
          </Txt>
          <PrimaryButton label="Try again" variant="secondary" size="sm" onPress={load} />
          {legal}
        </Card>
      ) : (
        <Txt variant="subhead" tone="secondary">
          Loading prices…
        </Txt>
      )}
      <Txt variant="footnote" tone="secondary">
        No account needed. To keep Plus on another phone, you can sign in with Apple or Google later in Settings.
      </Txt>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  footer: { gap: t.space.sm },
  notice: { textAlign: "center" },
  links: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: t.space.xs },
}));
