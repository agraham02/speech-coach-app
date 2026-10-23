import { Alert } from "react-native";
import { REWIND_REVIEW_SYSTEM, acceptReview, buildRewindReviewPrompt, rewindReviewSchema, type RewindReview } from "../../domain/rewind/reviewPrompt";
import { getAppleProvider, isAppleModelAvailable } from "../onDeviceLlm/onDeviceCoach";
import { callTextProvider, type TextProviderId } from "../cloud/textProviders";
import { toStrictSchema } from "../cloud/jsonSchema";
import { CloudApiError, describeCloudError } from "../cloud/cloudErrors";
import { askCloudConsent } from "../cloud/consent";
import { DAILY_REVIEW_LIMIT, MAX_REVIEW_WORDS, fenced, reviewsLeft, wordCount } from "../cloud/inputGuards";
import { currentProvider, hasConsent, hasProviderKey, modelFor, PROVIDERS, type CloudProvider } from "../cloud/providers";
import { getAccount } from "../account/accountStore";
import { generateContent } from "../gemini/geminiClient";
import { getCloudCallsToday, getRewindCloudConsent, noteCloudCall, setRewindCloudConsent } from "../prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";
import { withDeadline } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";

// The coach's notes on a Rewind take. Written from the transcript only — the
// words, never the sound — and never a score (domain/rewind/reviewPrompt.ts).
// The on-device model (Apple Intelligence) runs on its own; the bring-your-own-
// key cloud review only ever runs when asked for, per take.

const APPLE_TIMEOUT_MS = 40_000;
// Too short to say anything about.
const MIN_REVIEW_WORDS = 25;

export const canReviewOnDevice = (): boolean => isAppleModelAvailable();

export async function reviewOnDevice(transcript: string): Promise<RewindReview | null> {
  if (!isAppleModelAvailable() || wordCount(transcript) < MIN_REVIEW_WORDS) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateObject } = require("ai") as typeof import("ai");
    const model = getAppleProvider()!();
    const result = await withDeadline(
      generateObject({
        model: model as Parameters<typeof generateObject>[0]["model"],
        schema: rewindReviewSchema,
        system: REWIND_REVIEW_SYSTEM,
        prompt: buildRewindReviewPrompt(transcript),
      }),
      APPLE_TIMEOUT_MS,
      "On-device Rewind notes",
    );
    const accepted = acceptReview(result.object);
    if (!accepted) logger.warn("[rewind] on-device notes weren't usable — showing the counts only");
    return accepted;
  } catch (error) {
    logger.warn(`[rewind] on-device notes failed — ${(error as Error).message}`);
    return null;
  }
}

// --- the optional cloud review ---------------------------------------------

const FIELDS = ["specificity", "storytelling", "flow", "coverage", "vividDetail", "tryTomorrow"] as const;

const cloudSchema = {
  type: "object",
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: "string" }])),
  required: [...FIELDS],
  additionalProperties: false,
};

// A Rewind sends only its words, so it has its own consent — separate from
// the deep-review one, which for Gemini also covers uploading video.
function askRewindCloudConsent(provider: CloudProvider): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Send this transcript to ${provider.company}?`,
      `Only the words of this Rewind are sent to ${provider.company} for notes — no audio or video. It's billed to your own ${provider.name} key, and ${provider.company}'s terms and privacy policy cover what you send. It doesn't go through any server of ours.`,
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Allow",
          onPress: () => {
            setRewindCloudConsent(provider.id);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export type CloudReviewResult = { ok: true; review: RewindReview } | { ok: false; message: string };

// Notes from the chosen provider, on request. Resolves with why it didn't
// happen, rather than throwing, so the screen can say so plainly.
export async function reviewInCloud(transcript: string, openSettings: () => void): Promise<CloudReviewResult> {
  const provider = currentProvider();
  if (provider.id === "tono") return reviewWithTono(transcript, openSettings);
  if (!(await hasProviderKey(provider.id))) {
    Alert.alert("Add an API key first", `Notes from the cloud use your own AI key. Add a ${provider.name} key in Settings → Deep reviews.`, [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: openSettings },
    ]);
    return { ok: false, message: "No API key set." };
  }
  if (!getRewindCloudConsent().includes(provider.id) && !(await askRewindCloudConsent(provider))) return { ok: false, message: "Not sent." };

  const today = todayISODate();
  if (reviewsLeft(getCloudCallsToday(today)) <= 0) return { ok: false, message: `You've used today's ${DAILY_REVIEW_LIMIT} cloud reviews.` };
  if (wordCount(transcript) > MAX_REVIEW_WORDS) return { ok: false, message: "That take is too long to send." };

  const prompt = `${buildRewindReviewPrompt(fenced(transcript))}`;
  try {
    noteCloudCall(today);
    let raw: string;
    if (provider.id === "gemini") {
      raw = await generateContent({ systemPrompt: `${REWIND_REVIEW_SYSTEM}\n\n${prompt}`, responseSchema: cloudSchema });
    } else {
      raw = await callTextProvider({
        provider: provider.id as TextProviderId,
        model: modelFor(provider.id),
        system: REWIND_REVIEW_SYSTEM,
        user: prompt,
        schemaName: "rewind_review",
        schema: toStrictSchema(cloudSchema),
      });
    }
    const parsed = rewindReviewSchema.safeParse(JSON.parse(raw));
    const accepted = parsed.success ? acceptReview(parsed.data) : null;
    return accepted ? { ok: true, review: accepted } : { ok: false, message: `${provider.name} didn't send back usable notes. Try again.` };
  } catch (error) {
    logger.warn(`[rewind] cloud notes failed — ${(error as Error).message}`);
    return { ok: false, message: error instanceof CloudApiError ? error.message : `Couldn't get notes from ${provider.name}.` };
  }
}

// Tono AI: signed in, with the single Tono consent (it covers every kind of
// text sent), and the server counts the allowance.
async function reviewWithTono(transcript: string, openSettings: () => void): Promise<CloudReviewResult> {
  if (getAccount().status !== "signedIn") {
    Alert.alert("Sign in to use Tono AI", "Notes from Tono AI need an account. Sign in with Apple or Google in Settings → Deep reviews.", [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: openSettings },
    ]);
    return { ok: false, message: "Not signed in." };
  }
  if (!hasConsent("tono") && !(await askCloudConsent(PROVIDERS.tono))) return { ok: false, message: "Not sent." };
  if (wordCount(transcript) > MAX_REVIEW_WORDS) return { ok: false, message: "That take is too long to send." };

  const prompt = buildRewindReviewPrompt(fenced(transcript));
  try {
    const raw = await generateContent({ systemPrompt: `${REWIND_REVIEW_SYSTEM}\n\n${prompt}`, responseSchema: cloudSchema, transport: "hosted", kind: "text" });
    const parsed = rewindReviewSchema.safeParse(JSON.parse(raw));
    const accepted = parsed.success ? acceptReview(parsed.data) : null;
    return accepted ? { ok: true, review: accepted } : { ok: false, message: "Tono AI didn't send back usable notes. Try again." };
  } catch (error) {
    logger.warn(`[rewind] Tono AI notes failed — ${(error as Error).message}`);
    return { ok: false, message: describeCloudError(error) };
  }
}
