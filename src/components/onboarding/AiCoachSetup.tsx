import { Linking, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "../common/PrimaryButton";
import { TextField } from "../common/TextField";
import { Txt } from "../common/Txt";
import { cleanApiKey, MAX_KEY_LENGTH, providerForKey } from "../../services/cloud/inputGuards";
import { PROVIDERS, whatGetsSent, type ProviderId } from "../../services/cloud/providers";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Onboarding's AI coach step: paste a key and Tono reviews every take with
// it. Gemini is the one we point people to — it's the only provider that
// watches the video — but any supported key works; its prefix says which.
// The disclosure sits right above the button that allows it, so turning it
// on is the explicit permission App Review 5.1.2(i) asks for.

// Which provider a pasted key is for — Gemini unless the key says otherwise.
export function providerForPastedKey(key: string): ProviderId {
  return providerForKey(cleanApiKey(key)) ?? "gemini";
}

const STEPS = ["Tap Get a Gemini key and sign in with Google.", "Tap Create API key, then copy it.", "Come back and paste it here."];

export function AiCoachSetup({ apiKey, onChangeKey, error }: { apiKey: string; onChangeKey: (key: string) => void; error: string | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const provider = PROVIDERS[providerForPastedKey(apiKey)];
  const hasKey = cleanApiKey(apiKey).length > 0;

  return (
    <View style={styles.block}>
      <View style={styles.points}>
        <Point icon="videocam-outline" text="Watches each take like a coach would: does your answer have a shape, does your tone match your words, do you look at your listener." />
        <Point icon="phone-portrait-outline" text="Your phone still measures pace, pauses, fillers and eye contact on its own — the coach adds the judgment calls a phone can't make." />
        <Point icon="card-outline" text="Bring your own key: Tono stays free, and reviews are billed to your own account — usually a few cents each." />
      </View>

      {!hasKey ? (
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Txt variant="caption1" weight="600">
                  {i + 1}
                </Txt>
              </View>
              <Txt variant="subhead" tone="secondary" style={styles.flex}>
                {s}
              </Txt>
            </View>
          ))}
          <PrimaryButton label="Get a Gemini key" variant="secondary" size="md" icon="open-outline" onPress={() => Linking.openURL(PROVIDERS.gemini.keyUrl)} />
        </View>
      ) : null}

      <TextField
        label="Your API key"
        caption={hasKey ? `${provider.name} key. Stored only in this phone's keychain.` : "A Gemini key starts with AIza. OpenAI, Claude and OpenRouter keys work too."}
        value={apiKey}
        onChangeText={onChangeKey}
        onCommit={() => onChangeKey(cleanApiKey(apiKey))}
        placeholder="Paste your key"
        secret
        maxLength={MAX_KEY_LENGTH}
      />
      {error ? (
        <Txt variant="footnote" tone="danger">
          {error}
        </Txt>
      ) : null}

      {hasKey ? (
        <View style={styles.disclosure}>
          <Ionicons name={provider.input === "video" ? "videocam-outline" : "document-text-outline"} size={18} color={colors.textSecondary} />
          <Txt variant="footnote" tone="secondary" style={styles.flex}>
            {whatGetsSent(provider)} {provider.company}'s terms and privacy policy cover what you send; it doesn't go through any server of ours. Reviews run after each take — turn that off any time in Settings, or for one take on its save screen.
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Txt variant="subhead" tone="secondary" style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.lg },
  points: { gap: t.space.md },
  point: { flexDirection: "row", gap: t.space.md - 4, alignItems: "flex-start" },
  steps: { gap: t.space.sm + 2, padding: t.space.md, borderRadius: t.radius.md + 2, backgroundColor: t.colors.surfaceRaised },
  stepRow: { flexDirection: "row", gap: t.space.sm + 2, alignItems: "center" },
  stepNumber: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.background },
  disclosure: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  flex: { flex: 1 },
}));
