import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { ListGroup, ListRow } from "../../components/common/ListRow";
import { Txt } from "../../components/common/Txt";
import { checkNativeModules, runtimeLabel, type NativeCheckRow } from "../../services/dev/nativeCheck";
import { appVersion } from "../../services/dev/devInfo";
import { useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevNativeCheck">;

// Dev, Native check: does this build have every native piece the plan needs?
export function NativeCheckScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<NativeCheckRow[] | null>(null);

  useEffect(() => {
    checkNativeModules()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const missing = rows?.filter((r) => !r.present) ?? [];
  return (
    <Screen title="Native check" eyebrow="Dev" onBack={navigation.goBack}>
      <Card>
        <Txt variant="headline">{rows == null ? "Checking…" : missing.length === 0 ? "This build has everything" : `${missing.length} missing from this build`}</Txt>
        <Txt variant="footnote" tone="secondary">
          {`Version ${appVersion()}. ${runtimeLabel()}. Anything missing here means the code that needs it can't work on this build until you make a new one.`}
        </Txt>
      </Card>
      {rows ? (
        <ListGroup title="Native pieces">
          {rows.map((r) => (
            <ListRow
              key={r.id}
              icon={r.present ? "checkmark-circle" : "close-circle"}
              iconColor={r.present ? colors.success : colors.danger}
              title={r.label}
              subtitle={`${r.usedFor}${r.detail ? `. ${r.detail}` : ""}`}
            />
          ))}
        </ListGroup>
      ) : null}
    </Screen>
  );
}
