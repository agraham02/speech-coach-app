import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { Chip } from "../../components/common/Chip";
import { ListGroup, ListRow, SwitchRow } from "../../components/common/ListRow";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import {
  DEFAULT_MOCK_CONFIG,
  TIER_LABELS,
  TIER_TOTALS,
  configForTier,
  describeMock,
  type MockAccountConfig,
  type MockOffer,
  type MockSignIn,
  type MockTier,
} from "../../domain/dev/mockAccount";
import { setMockAccount, useMockAccountConfig } from "../../services/dev/mockAccount";
import { makeStyles } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevMockAccount">;

const TIERS: MockTier[] = ["free", "beta", "trial", "plus"];
const SIGN_INS: { key: MockSignIn; label: string }[] = [
  { key: "none", label: "No account" },
  { key: "anonymous", label: "Anonymous" },
  { key: "google", label: "Google" },
];
const OFFERS: { key: MockOffer; label: string }[] = [
  { key: "trial", label: "With free trial" },
  { key: "no_trial", label: "No trial" },
  { key: "failed", label: "Prices fail" },
];

// Dev, App tools, Mock account: the tier and allowances the app sees, set here
// instead of by the server. While a mock is set the app asks Tono's server for
// nothing (no `me`, no app-config, no account made) and every call to it is
// refused on the phone. Saved on the phone and kept across Reset app.
export function MockAccountScreen({ navigation }: Props) {
  const styles = useStyles();
  const config = useMockAccountConfig();
  const active = config !== null;
  const c: MockAccountConfig = config ?? DEFAULT_MOCK_CONFIG;
  const totals = TIER_TOTALS[c.tier];

  const update = (patch: Partial<MockAccountConfig>) => setMockAccount({ ...c, ...patch });
  const setTier = (tier: MockTier) =>
    setMockAccount(
      configForTier(tier, {
        minorsMayUseAi: c.minorsMayUseAi,
        killSwitch: c.killSwitch,
        serverUnreachable: c.serverUnreachable,
        showPlusOffers: c.showPlusOffers,
        offer: c.offer,
        plusPurchasable: c.plusPurchasable,
      }),
    );
  const takeChoices = Array.from(new Set([0, 1, Math.min(5, totals.takes), totals.takes])).sort((a, b) => a - b);
  const minuteChoices = totals.conversationMinutes ? Array.from(new Set([0, 5, totals.conversationMinutes])).sort((a, b) => a - b) : [];

  return (
    <Screen title="Mock account" eyebrow="Dev" onBack={navigation.goBack}>
      <Card style={styles.block}>
        <Txt variant="headline" testID="dev-mock-status">
          {active ? "Mock account is on" : "Mock account is off"}
        </Txt>
        <Txt variant="footnote" tone="secondary">
          {active ? describeMock(c) : "The app is using the real account state. Pick a tier to take over; nothing is sent to Tono's server while a mock is on."}
        </Txt>
        <PrimaryButton label="Clear overrides" variant="secondary" size="md" disabled={!active} onPress={() => setMockAccount(null)} testID="dev-mock-clear" />
      </Card>

      <ListGroup title="Tier">
        <View style={styles.chips}>
          {TIERS.map((tier) => (
            <Chip key={tier} label={TIER_LABELS[tier]} selected={active && c.tier === tier} onPress={() => setTier(tier)} testID={`dev-mock-tier-${tier}`} />
          ))}
        </View>
      </ListGroup>

      {active ? (
        <>
          <ListGroup title="Who">
            <View style={styles.chips}>
              {SIGN_INS.map((s) => (
                <Chip key={s.key} label={s.label} selected={c.signIn === s.key} onPress={() => update({ signIn: s.key })} testID={`dev-mock-signin-${s.key}`} />
              ))}
            </View>
          </ListGroup>

          {c.signIn !== "none" ? (
            <ListGroup title={`Judged takes left (of ${totals.takes})`}>
              <View style={styles.chips}>
                {takeChoices.map((n) => (
                  <Chip key={n} label={String(n)} selected={c.takesLeft === n} onPress={() => update({ takesLeft: n })} testID={`dev-mock-takes-${n}`} />
                ))}
              </View>
            </ListGroup>
          ) : null}

          {c.signIn !== "none" && minuteChoices.length > 0 ? (
            <ListGroup title={`Conversation minutes left (of ${totals.conversationMinutes})`}>
              <View style={styles.chips}>
                {minuteChoices.map((n) => (
                  <Chip key={n} label={String(n)} selected={c.conversationMinutesLeft === n} onPress={() => update({ conversationMinutesLeft: n })} testID={`dev-mock-minutes-${n}`} />
                ))}
              </View>
            </ListGroup>
          ) : null}

          <ListGroup title="What the server says">
            <SwitchRow title="Exercise notes allowed" subtitle="Rewind, Say it short and AI marks (the server's text count)" value={c.textAllowed} onValueChange={(v) => update({ textAllowed: v })} testID="dev-mock-text-allowed" />
            <SwitchRow title="Insights allowed" value={c.insightAllowed} onValueChange={(v) => update({ insightAllowed: v })} testID="dev-mock-insight-allowed" />
            <SwitchRow title="Tono Plus is on sale" subtitle="The server's launch switch (plusPurchasable)" value={c.plusPurchasable} onValueChange={(v) => update({ plusPurchasable: v })} testID="dev-mock-plus-purchasable" />
            <SwitchRow title="Minors may use Tono AI" subtitle="The server's policy for under-18s (minorsMayUseAi)" value={c.minorsMayUseAi} onValueChange={(v) => update({ minorsMayUseAi: v })} testID="dev-mock-minors-may-use-ai" />
            <SwitchRow title="Kill switch" subtitle="Tono AI switched off for everyone" value={c.killSwitch} onValueChange={(v) => update({ killSwitch: v })} testID="dev-mock-kill-switch" />
            <SwitchRow title="Beta mode" subtitle="The server mode (beta or launch)" value={c.mode === "beta"} onValueChange={(v) => update({ mode: v ? "beta" : "launch" })} testID="dev-mock-beta-mode" />
            <SwitchRow title="Server unreachable" subtitle="Every call to Tono fails as if offline" value={c.serverUnreachable} onValueChange={(v) => update({ serverUnreachable: v })} testID="dev-mock-unreachable" />
          </ListGroup>

          <ListGroup title="Tono Plus on this phone">
            <SwitchRow
              title="Show Tono Plus as for sale"
              subtitle="Real purchases are iPhone only. This shows the paywall and the See Tono Plus buttons here, with made-up prices; no purchase is made."
              value={c.showPlusOffers}
              onValueChange={(v) => update({ showPlusOffers: v })}
              testID="dev-mock-show-plus"
            />
            {c.showPlusOffers ? (
              <>
                <View style={styles.chips}>
                  {OFFERS.map((o) => (
                    <Chip key={o.key} label={o.label} selected={c.offer === o.key} onPress={() => update({ offer: o.key })} testID={`dev-mock-offer-${o.key}`} />
                  ))}
                </View>
                <ListRow icon="sparkles-outline" title="Open the paywall" chevron onPress={() => navigation.navigate("Paywall")} testID="dev-mock-open-paywall" />
              </>
            ) : null}
          </ListGroup>
        </>
      ) : null}

      <Txt variant="footnote" tone="muted">
        Sign out, Delete account and Continue with Google still run their real code. Leave them alone while testing.
      </Txt>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, padding: t.space.md },
}));
