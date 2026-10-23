import { Easing, FadeInDown, type WithSpringConfig } from "react-native-reanimated";

// Motion tokens (docs/history/design-refresh-plan.md): presses answer instantly, content
// enters in a short stagger, progress fills. Nothing loops except live
// states (recording, listening).

export const duration = { fast: 160, base: 260, slow: 420 } as const;

// Emphasized deceleration — quick start, soft landing.
export const easeOut = Easing.bezier(0.2, 0, 0, 1);

export const spring = {
  // Press feedback: tight and quick, no visible wobble.
  press: { damping: 18, stiffness: 380, mass: 0.6 } satisfies WithSpringConfig,
  // Sliding indicators, sheets, toasts.
  gentle: { damping: 20, stiffness: 180, mass: 1 } satisfies WithSpringConfig,
};

export const PRESS_SCALE = 0.97;
const STAGGER_MS = 45;

// Staggered entrance for the i-th block of a screen. Only applies on first
// mount (Reanimated layout animations don't re-run on re-render).
export function enter(index = 0) {
  return FadeInDown.duration(duration.slow)
    .delay(Math.min(index, 8) * STAGGER_MS)
    .easing(easeOut)
    .withInitialValues({ transform: [{ translateY: 12 }] });
}
