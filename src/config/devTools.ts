// The Dev tab (persisted logs + Share logs, DB inspector) and ASR Lab are on
// in development and in any build made with EXPO_PUBLIC_DEV_TOOLS=1 (the EAS
// "preview" profile sets it), and off in production.
export const SHOW_DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === "1";
