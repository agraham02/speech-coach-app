import { useState } from "react";
import { View } from "react-native";
import { Chip } from "../common/Chip";
import { DatePicker, formatEventDate } from "../common/DatePicker";
import { Txt } from "../common/Txt";
import { SignInOptions } from "./SignInOptions";
import { useAccount } from "../../services/account/accountStore";
import { isAdultNow } from "../../services/cloud/routing";
import { getUserProfile, setBirthDate } from "../../services/prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";
import { makeStyles } from "../../theme/ThemeProvider";

const OLDEST_BIRTHDAY = "1900-01-01";
// Where the wheels start: nobody is a baby, and 18-and-over is the answer that matters.
const PICKER_START = "2000-01-01";

// What it takes to use Tono AI: a birthday (kept on this phone, so the
// 18-and-over rule follows people as they grow up) and a sign-in with Apple
// or Google. Either is shown only while it is missing, the birthday first (a
// person under 18 is never asked to make an account for something they can't use). `onChange` runs after
// either is given, so the caller can look at where things stand.
export function SignInPanel({ onChange }: { onChange?: () => void | Promise<void> }) {
  const styles = useStyles();
  const account = useAccount();
  const [birthDate, setBirth] = useState<string | undefined>(() => getUserProfile()?.birthDate);
  const [picking, setPicking] = useState(false);
  const adult = isAdultNow();

  async function pick(date: string) {
    setBirthDate(date);
    setBirth(date);
    await onChange?.();
  }

  const needsBirthday = adult === null;
  const minor = adult === false;

  return (
    <View style={styles.wrap}>
      {needsBirthday || minor ? (
        <View style={styles.block}>
          <Txt variant="subhead" weight="600">
            Your birthday
          </Txt>
          <Txt variant="footnote" tone="secondary">
            Tono AI is for people 18 and over. Your birthday stays on this phone, and Tono AI opens by itself the day you turn 18.
          </Txt>
          <View style={styles.row}>
            <Chip label={birthDate ? formatEventDate(birthDate) : "Pick your birthday"} selected={!!birthDate} onPress={() => setPicking(true)} />
          </View>
          <DatePicker
            visible={picking}
            value={birthDate ?? PICKER_START}
            title="Your birthday"
            display="spinner"
            minimumDate={OLDEST_BIRTHDAY}
            maximumDate={todayISODate()}
            onPick={(date) => void pick(date)}
            onClose={() => setPicking(false)}
          />
        </View>
      ) : null}

      {minor ? (
        <Txt variant="footnote" tone="secondary">
          Tono AI is for 18 and over, so it stays off for now. Everything else in Tono works as always, and it will open when you turn 18.
        </Txt>
      ) : needsBirthday ? null : account.status !== "signedIn" ? (
        <View style={styles.block}>
          <Txt variant="subhead" weight="600">
            Sign in
          </Txt>
          <Txt variant="footnote" tone="secondary">
            An account keeps your Tono AI allowance and Tono Plus yours, on this phone and any other. Your recordings stay on this phone either way.
          </Txt>
          <SignInOptions onSignedIn={onChange} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.lg },
  block: { gap: t.space.sm },
  row: { flexDirection: "row" },
}));
