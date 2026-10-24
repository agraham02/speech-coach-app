import { useCallback, useEffect, useRef } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Txt } from "../components/common/Txt";
import { SignInPanel } from "../components/account/SignInPanel";
import { useAccount } from "../services/account/accountStore";
import { isAdultNow } from "../services/cloud/routing";
import { finishSignIn, type SignInReason } from "../services/account/signInGate";

type Props = NativeStackScreenProps<RootStackParamList, "SignIn">;

const HEADLINES: Record<SignInReason, { title: string; body: string }> = {
  tono_ai: {
    title: "Sign in to use Tono AI",
    body: "Tono AI judges what you said and how it came across. It's free for one judged take a month, and Tono Plus gives you more. Everything your phone measures works without an account.",
  },
  conversation: {
    title: "Sign in for live conversation",
    body: "The partner you talk to is Tono AI. An account keeps track of your conversation minutes. The drills in each lesson work without one.",
  },
  plus: {
    title: "Sign in to start Tono Plus",
    body: "Your subscription belongs to your account, so it follows you to a new phone and comes back if you reinstall.",
  },
  settings: {
    title: "Sign in",
    body: "An account is for Tono AI and Tono Plus. Everything else in Tono works without one.",
  },
};

// The sign-in the app asks for when something needs an account (see
// services/account/signInGate.ts). It closes itself once there is a sign-in
// and a birthday, and tells whoever asked how it ended.
export function SignInScreen({ navigation, route }: Props) {
  const account = useAccount();
  const settled = useRef(false);
  const headline = HEADLINES[route.params?.reason ?? "tono_ai"];

  const finish = useCallback(
    (ok: boolean) => {
      if (settled.current) return;
      settled.current = true;
      finishSignIn(ok);
      if (navigation.canGoBack()) navigation.goBack();
    },
    [navigation],
  );

  // Closing the sheet any way at all ends the wait.
  useEffect(() => navigation.addListener("beforeRemove", () => {
    if (!settled.current) {
      settled.current = true;
      finishSignIn(false);
    }
  }), [navigation]);

  const check = useCallback(() => {
    if (isAdultNow() === true && account.status === "signedIn") finish(true);
  }, [account.status, finish]);

  useEffect(check, [check]);

  return (
    <Screen title={headline.title} onBack={() => finish(false)} backIcon="close">
      <Txt variant="body" tone="secondary">
        {headline.body}
      </Txt>
      <SignInPanel onChange={check} />
    </Screen>
  );
}
