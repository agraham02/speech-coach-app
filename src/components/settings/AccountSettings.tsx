import { Alert, Linking, View } from "react-native";
import { Card } from "../common/Card";
import { ListGroup, ListRow } from "../common/ListRow";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { SignInOptions } from "../account/SignInOptions";
import { isLinked, signedInLabel } from "../../domain/account";
import { allowanceLine, isPaidPlan } from "../../domain/aiAllowance";
import { MANAGE_SUBSCRIPTIONS_URL, PLUS_MONTHLY_JUDGED_TAKES, TRIAL_DAYS } from "../../domain/plus";
import { restorePlus, purchasesEnabled } from "../../services/purchases/purchases";
import { openPaywall } from "../../services/cloud/consent";
import { tonoAgeGated } from "../../services/cloud/routing";
import { useAccount } from "../../services/account/accountStore";
import { deleteAccount, signOut } from "../../services/account/signIn";
import { describeCloudError } from "../../services/cloud/cloudErrors";
import { makeStyles } from "../../theme/ThemeProvider";

// Settings → Account & Plus. Nobody has to sign in: Tono works without an
// account, and Tono AI and Plus use one made behind the scenes. Signing in
// with Apple or Google links that account, so Plus follows you to another
// phone. Practice data stays on the phone either way.
export function AccountSettings() {
  const styles = useStyles();
  const account = useAccount();
  const showToast = useToast();

  if (account.status === "unknown") return <View />;

  const linked = isLinked(account);
  const paying = isPaidPlan(account.allowance);
  const canBuy = purchasesEnabled() && !tonoAgeGated();

  async function restore() {
    const result = await restorePlus();
    if (!result.ok) {
      if (!result.cancelled) showToast(result.message, "error");
      return;
    }
    showToast(result.plus ? "Tono Plus is back." : "No Tono Plus purchase was found for this Apple ID.", result.plus ? "success" : "info");
  }

  function confirmSignOut() {
    Alert.alert(
      "Sign out of Tono?",
      "This phone forgets your account. Tono keeps working, and your recordings and history stay here. Sign in again to get Tono Plus back on this phone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", onPress: () => void signOut() },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      `This deletes your Tono account and its record of your Tono AI use${linked ? ", and unlinks your sign-in" : ""}. Your recordings and practice history stay on this phone.${
        paying ? " It does not cancel Tono Plus: cancel that in iOS Settings, under your name, then Subscriptions." : ""
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

  const planName = account.allowance?.plan === "plus" ? "Tono Plus" : account.allowance?.plan === "trial" ? "Free trial" : undefined;

  return (
    <View style={styles.wrap}>
      {account.status === "signedIn" ? (
        <ListGroup>
          <ListRow icon="person-circle-outline" title={signedInLabel(account)} subtitle={linked ? "Your Tono account" : "Tono works without signing in"} />
          {account.allowance ? <ListRow icon="sparkles-outline" title={allowanceLine(account.allowance)} subtitle={planName} /> : null}
        </ListGroup>
      ) : null}

      {!linked ? (
        <Card style={styles.section}>
          <Txt variant="headline">Sign in (optional)</Txt>
          <Txt variant="subhead" tone="secondary">
            You don't need an account to use Tono. Sign in with Apple or Google to keep Tono Plus on another phone, or to bring it back after reinstalling. Your recordings stay on this phone either
            way.
          </Txt>
          <SignInOptions />
        </Card>
      ) : null}

      {account.mode === "beta" ? (
        <Txt variant="footnote" tone="secondary" style={styles.note}>
          Tono AI is free while Tono is in beta. A monthly allowance keeps it fair for everyone.
        </Txt>
      ) : null}

      {canBuy || paying ? (
        <ListGroup>
          {paying ? (
            <ListRow icon="card-outline" title="Manage Tono Plus" subtitle="Change or cancel in your Apple ID settings" chevron onPress={() => Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)} />
          ) : (
            <ListRow
              icon="sparkles-outline"
              title="Tono Plus"
              subtitle={`${PLUS_MONTHLY_JUDGED_TAKES} judged takes a month, and notes on your drills. New subscribers can try it free for ${TRIAL_DAYS} days.`}
              chevron
              onPress={openPaywall}
            />
          )}
          <ListRow icon="refresh-outline" title="Restore purchases" onPress={restore} />
        </ListGroup>
      ) : null}

      {account.status === "signedIn" ? (
        <ListGroup>
          {linked ? <ListRow icon="log-out-outline" title="Sign out" onPress={confirmSignOut} /> : null}
          <ListRow icon="trash-outline" title="Delete account" subtitle="Removes your account and its Tono AI record" destructive onPress={confirmDelete} />
        </ListGroup>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.lg },
  section: { gap: t.space.md },
  note: { paddingHorizontal: 4 },
}));
