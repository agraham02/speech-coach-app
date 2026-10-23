import { Alert, Linking, View } from "react-native";
import { Card } from "../common/Card";
import { ListGroup, ListRow } from "../common/ListRow";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { SignInOptions } from "../account/SignInOptions";
import { signedInLabel } from "../../domain/account";
import { allowanceLine } from "../../domain/aiAllowance";
import { MANAGE_SUBSCRIPTIONS_URL, PLUS_MONTHLY_REVIEWS } from "../../domain/plus";
import { navigationRef } from "../../navigation/navigationRef";
import { restorePlus, purchasesEnabled } from "../../services/purchases/purchases";
import { askCloudConsent } from "../../services/cloud/consent";
import { hasConsent, PROVIDERS } from "../../services/cloud/providers";
import { useAccount } from "../../services/account/accountStore";
import { deleteAccount, signOut } from "../../services/account/signIn";
import { describeCloudError } from "../../services/cloud/cloudErrors";
import { makeStyles } from "../../theme/ThemeProvider";

function refillText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Refills on ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}

// Settings -> Account. An account exists only for Tono AI; everything else in
// Tono works without one, and practice data stays on the phone.
export function AccountSettings() {
  const styles = useStyles();
  const account = useAccount();
  const showToast = useToast();

  if (account.status === "unknown") return <View />;

  if (account.status === "signedOut") {
    return (
      <View style={styles.wrap}>
        <Card style={styles.section}>
          <Txt variant="headline">Sign in to use Tono AI</Txt>
          <Txt variant="subhead" tone="secondary">
            Tono AI reviews your takes the way a coach would, with no API key to find, copy or paste. An account is only for that: the rest of Tono works without one, and your recordings and
            practice history stay on this phone.
          </Txt>
          <SignInOptions
            onSignedIn={async () => {
              if (!hasConsent("tono")) await askCloudConsent(PROVIDERS.tono);
            }}
          />
        </Card>
      </View>
    );
  }

  const refill = refillText(account.allowance?.resetsAt);
  const isPlus = account.allowance?.plan === "plus";
  const canBuy = purchasesEnabled();

  async function restore() {
    const result = await restorePlus();
    if (!result.ok) {
      if (!result.cancelled) showToast(result.message, "error");
      return;
    }
    showToast(result.plus ? "Tono Plus is back." : "No Tono Plus purchase was found for this Apple ID.", result.plus ? "success" : "info");
  }

  function confirmSignOut() {
    Alert.alert("Sign out of Tono?", "AI reviews through Tono AI stop until you sign in again. Your recordings and history stay on this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", onPress: () => void signOut() },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      `This deletes your Tono account and its record of your AI usage, and unlinks Sign in with Apple. Your recordings and practice history stay on this phone.${
        isPlus ? " It does not cancel Tono Plus: cancel that in iOS Settings, under your name, then Subscriptions." : ""
      } This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
              showToast("Your account was deleted.", "success");
            } catch (error) {
              showToast(describeCloudError(error) || "Couldn't delete the account. Try again.", "error");
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.wrap}>
      <ListGroup>
        <ListRow icon="person-circle-outline" title={signedInLabel(account)} subtitle="Your Tono account" />
        {account.allowance ? <ListRow icon="sparkles-outline" title={allowanceLine(account.allowance)} subtitle={refill ?? undefined} /> : null}
      </ListGroup>
      {account.mode === "beta" ? (
        <Txt variant="footnote" tone="secondary" style={styles.note}>
          Tono AI is free while Tono is in beta. A monthly allowance keeps it fair for everyone.
        </Txt>
      ) : null}
      {canBuy ? (
        <ListGroup>
          {isPlus ? (
            <ListRow icon="card-outline" title="Manage Tono Plus" subtitle="Change or cancel in your Apple ID settings" chevron onPress={() => Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)} />
          ) : (
            <ListRow
              icon="sparkles-outline"
              title="Get Tono Plus"
              subtitle={`${PLUS_MONTHLY_REVIEWS} AI video reviews a month`}
              chevron
              onPress={() => {
                if (navigationRef.isReady()) navigationRef.navigate("Paywall");
              }}
            />
          )}
          <ListRow icon="refresh-outline" title="Restore purchases" onPress={restore} />
        </ListGroup>
      ) : null}
      <ListGroup>
        <ListRow icon="log-out-outline" title="Sign out" onPress={confirmSignOut} />
        <ListRow icon="trash-outline" title="Delete account" subtitle="Removes your account and AI usage" destructive onPress={confirmDelete} />
      </ListGroup>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.lg },
  section: { gap: t.space.md },
  note: { paddingHorizontal: 4 },
}));
