import { useEffect, useState } from "react";
import { Share } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { IconButton } from "../../components/common/IconButton";
import { SegmentedControl } from "../../components/common/SegmentedControl";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { JsonText, JsonTree } from "../../components/dev/JsonViewer";
import { getArtifact } from "../../services/db/artifactsRepo";
import { describeJson } from "../../domain/dev/jsonView";
import { copyText } from "../../utils/copyText";

type Props = NativeStackScreenProps<RootStackParamList, "DevArtifact">;

// One stored result as JSON: a tree of its first level, or the raw text.
export function ArtifactScreen({ navigation, route }: Props) {
  const { sessionId, kind } = route.params;
  const showToast = useToast();
  const [value, setValue] = useState<unknown>(undefined);
  const [view, setView] = useState<"tree" | "raw">("tree");

  useEffect(() => {
    getArtifact<unknown>(sessionId, kind)
      .then((v) => setValue(v ?? null))
      .catch(() => setValue(null));
  }, [sessionId, kind]);

  const loaded = value !== undefined;
  const text = () => JSON.stringify(value, null, 2);

  return (
    <Screen
      title={kind}
      eyebrow="Stored result"
      onBack={navigation.goBack}
      right={
        <>
          <IconButton
            icon="copy-outline"
            accessibilityLabel="Copy JSON"
            disabled={!loaded}
            onPress={async () => {
              if (await copyText(text())) showToast("JSON copied.", "success");
            }}
          />
          <IconButton icon="share-outline" accessibilityLabel="Share JSON" disabled={!loaded} onPress={() => Share.share({ message: text() }).catch(() => undefined)} />
        </>
      }
    >
      {!loaded ? (
        <Txt variant="subhead" tone="muted">
          Loading{"…"}
        </Txt>
      ) : (
        <>
          <Mono tone="secondary">{describeJson(value)}</Mono>
          <SegmentedControl
            options={[
              { key: "tree", label: "Tree" },
              { key: "raw", label: "Raw" },
            ]}
            value={view}
            onChange={setView}
            size="sm"
          />
          {view === "tree" ? <JsonTree value={value} /> : <JsonText value={value} />}
        </>
      )}
    </Screen>
  );
}
