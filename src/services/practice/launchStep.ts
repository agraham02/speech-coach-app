import type { NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation";
import type { LessonStep } from "../../content/lessons";
import type { PracticeContext } from "../../domain/practice";
import { isConversationDrill, paramsFor } from "../../domain/drills/drillSpecs";
import { getDrillLevel } from "../db/progressRepo";
import { getAllPrompts } from "../db/promptsRepo";
import { getRecentlyUsedPromptIds } from "../db/sessionsRepo";
import { pickRandomPrompt } from "../../domain/pickTodaysPrompt";
import { isFreeRecordPrompt } from "../../data/topics";
import type { LineCategory } from "../../content/lines";

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
      const eligible = prompts.filter((p) => !isFreeRecordPrompt(p.id));
      const tiered = eligible.filter((p) => p.difficultyTier === params.tier);
      const prompt = pickRandomPrompt(tiered.length >= 5 ? tiered : eligible, recent);
      navigation.navigate("Recording", {
        kind: "prompt",
        prompt,
        lessonId: practice.lessonId,
        targetFramework: step.framework,
        targetSeconds: step.seconds ?? params.seconds,
        prepSeconds: params.prepSeconds,
        practice,
      });
      return;
    }
  }
}
