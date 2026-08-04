import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./index";

// Split into its own leaf module (rather than living in index.tsx alongside
// the screen imports) so non-screen code — the background pipeline's toast
// tap handler in sessionProcessor.ts — can import just this ref without
// pulling in every screen component, which was creating a require cycle
// (navigation/index -> PreviewScreen -> sessionProcessor -> navigation/index).
// The RootStackParamList import above is type-only and erased at build time,
// so it doesn't reintroduce that cycle at runtime.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
