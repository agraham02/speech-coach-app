import { SHOW_DEV_TOOLS } from "../../config/devTools";

// Storage for the dev-only test helpers (Dev, App tools: mock account, skip
// the model download). Its own file, apart from the app prefs and apart from
// the Dev tab's store, so Reset app does not clear it: after a reset the
// helpers a tester switched on are still on. Never opened in a production
// build, and any failure to open it just means "nothing stored".

interface Store {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

let store: Store | null | undefined;

function open(): Store | null {
  if (!SHOW_DEV_TOOLS) return null;
  if (store === undefined) {
    try {
      // Loaded here, not at the top, so importing this file never touches the
      // native module (and a production build never loads it from here).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createMMKV } = require("react-native-mmkv") as typeof import("react-native-mmkv");
      store = createMMKV({ id: "speech-coach-dev-helpers" });
    } catch {
      store = null;
    }
  }
  return store;
}

export function getHelperJson<T>(key: string, fallback: T): T {
  try {
    const raw = open()?.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setHelperJson(key: string, value: unknown): void {
  try {
    const s = open();
    if (!s) return;
    if (value === null || value === undefined) s.remove(key);
    else s.set(key, JSON.stringify(value));
  } catch {
    // Dev tooling must never break the app.
  }
}
