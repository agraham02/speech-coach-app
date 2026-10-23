import { Image, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, lineLimit, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

// The prep and research clock on the Dynamic Island and the Lock Screen, so
// you can leave for a web search and still see how long you have. The timer
// ticks on its own (Text with a timerInterval), so nothing has to be pushed
// each second: the app only updates it when you add time.
//
// This function runs in the widget's own isolated runtime: no hooks, no
// state, no values from outside it. Everything it uses is built inside, and
// the app passes only plain values (milliseconds and short strings).
export type PrepActivityProps = {
  // The prompt, shortened by the app.
  prompt: string;
  startedAtMs: number;
  endsAtMs: number;
  // What the countdown is for. Optional: an activity started by an older
  // version of the app has none.
  label?: "Researching" | "Preparing";
};

const PrepActivity = (props: PrepActivityProps, environment: LiveActivityEnvironment) => {
  "widget";
  const accent = environment.isLuminanceReduced ? "#FFFFFF" : "#F4F2EC";
  const range = { lower: new Date(props.startedAtMs), upper: new Date(props.endsAtMs) };
  const label = props.label === "Preparing" ? "Preparing" : "Researching";
  const icon = props.label === "Preparing" ? "timer" : "magnifyingglass";

  return {
    banner: (
      <VStack modifiers={[padding({ all: 14 })]}>
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle("#A9A69D")]}>{label}</Text>
        <Text timerInterval={range} countsDown modifiers={[font({ size: 34, weight: "bold" }), foregroundStyle(accent)]} />
        <Text modifiers={[font({ size: 14 }), foregroundStyle(accent), lineLimit(2)]}>{props.prompt}</Text>
      </VStack>
    ),
    compactLeading: <Image systemName={icon} color={accent} />,
    compactTrailing: <Text timerInterval={range} countsDown modifiers={[font({ weight: "semibold" }), foregroundStyle(accent)]} />,
    minimal: <Text timerInterval={range} countsDown modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(accent)]} />,
    expandedLeading: <Image systemName={icon} color={accent} />,
    expandedCenter: <Text timerInterval={range} countsDown modifiers={[font({ size: 28, weight: "bold" }), foregroundStyle(accent)]} />,
    expandedBottom: <Text modifiers={[font({ size: 14 }), foregroundStyle(accent), lineLimit(2)]}>{props.prompt}</Text>,
  };
};

export default createLiveActivity("PrepActivity", PrepActivity);
