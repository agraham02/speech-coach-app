import { Share } from "react-native";

// Copies text to the clipboard. expo-clipboard is a native module, so a dev
// build made before it was added won't have it: fall back to the share sheet
// (which has a Copy action). Resolves true when it landed on the clipboard.
export async function copyText(text: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require("expo-clipboard") as { setStringAsync(value: string): Promise<boolean> };
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    await Share.share({ message: text }).catch(() => undefined);
    return false;
  }
}
