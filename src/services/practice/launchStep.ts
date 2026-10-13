import type { NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation";
import type { LessonStep } from "../../content/lessons";
import type { PracticeContext } from "../../domain/practice";
import { isConversationDrill, paramsFor } from "../../domain/drills/drillSpecs";
import { FRAMEWORK_PROMPT_CATEGORIES } from "../../domain/coach/structureHeuristics";
import { getDrillLevel } from "../db/progressRepo";
import { getAllPrompts } from "../db/promptsRepo";
import { getRecentlyUsedPromptIds } from "../db/sessionsRepo";
import { pickRandomPrompt } from "../../domain/pickTodaysPrompt";
import { isFreeRecordPrompt } from "../../data/topics";
import type { LineCategory } from "../../content/lines";
import { CONTEXT_LABELS, CONTEXT_PROMPTS } from "../../data/contextPrompts";
import { daysUntilEvent, promptContexts } from "../../domain/profile";
import { makeAdhocPrompt } from "../../domain/sessionTypes";
import { getUserProfile } from "../prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";

type Nav = NavigationProp<RootStackParamList>;

// Opens the right screen for one lesson / plan step.
export async function launchStep(navigation: Nav, step: LessonStep, practice: PracticeContext): Promise<void> {
  switch (step.kind) {
    case "warmup":
      navigation.navigate("Guided", { warmupId: step.warmupId, practice });
      return;
    case "guided":
      navigation.navigate("Guided", { guidedId: step.guidedId, practice });
      return;
    case "drill":
      if (step.drill === "twister") {
        navigation.navigate("DrillSession", { twisterId: step.contentId, practice });
      } else if (step.drill === "marked_reading") {
        // contentId "cat:<category>" picks lines from one group; a plain id
        // starts with that line.
        const category = step.contentId?.startsWith("cat:") ? (step.contentId.slice(4) as LineCategory) : undefined;
        const lineIds = step.contentId && !category ? [step.contentId] : undefined;
        navigation.navigate("LineRep", { category, lineIds, practice });
      } else if (step.drill === "move_it") {
        navigation.navigate("MoveIt", { practice });
      } else if (isConversationDrill(step.drill)) {
        navigation.navigate("Conversation", { drill: step.drill, contentId: step.contentId, practice });
      } else {
        navigation.navigate("Drill", { drill: step.drill, contentId: step.contentId, practice });
      }
      return;
    case "rep": {
      // Prompt difficulty, prep and length all come from the adaptive
      // impromptu level.
      const level = await getDrillLevel("rep");
      const params = paramsFor("rep", level);
      const [prompts, recent] = await Promise.all([getAllPrompts(), getRecentlyUsedPromptIds(20)]);
      const all = prompts.filter((p) => !isFreeRecordPrompt(p.id));
      // A structure rep gets a prompt that structure can answer (PREP needs
      // a side to take, STAR a "tell me about a time"), then the level's
      // tier within that.
      const categories = step.framework && step.framework !== "None" ? FRAMEWORK_PROMPT_CATEGORIES[step.framework] : null;
      const fitting = categories ? all.filter((p) => categories.includes(p.category)) : all;
      const eligible = fitting.length >= 5 ? fitting : all;
      const tiered = eligible.filter((p) => p.difficultyTier === params.tier);
      // Half the reps (all of them close to an event) come from the
      // situations you said matter to you — except a structure rep, which
      // keeps to prompts its structure fits until the event is near.
      const profile = getUserProfile();
      const today = todayISODate();
      const contexts = promptContexts(profile, today);
      const daysToEvent = daysUntilEvent(profile, today);
      const nearEvent = daysToEvent != null && daysToEvent <= 14;
      const useContext = contexts.length > 0 && (nearEvent || (!categories && Math.random() < 0.5));
      const prompt = useContext
        ? (() => {
            const context = contexts[Math.floor(Math.random() * contexts.length)];
            const list = CONTEXT_PROMPTS[context];
            return makeAdhocPrompt(list[Math.floor(Math.random() * list.length)], CONTEXT_LABELS[context]);
          })()
        : pickRandomPrompt(tiered.length >= 5 ? tiered : eligible, recent);
      navigation.navigate("Recording", {
        kind: "prompt",
        prompt,
        lessonId: practice.lessonId,
        targetFramework: step.framework,
        targetSeconds: step.seconds ?? params.seconds,
        prepSeconds: step.prepSeconds ?? params.prepSeconds,
        practice,
      });
      return;
    }
  }
}
