import { Platform, Share } from "react-native";
import { File, Paths } from "expo-file-system";
import { formatJson } from "../domain/dev/formatJson";
import { copyText } from "./copyText";

// Dev tab exports: JSON as text on the clipboard, or as a file in the share
// sheet (AirDrop, Files, Messages). Pretty-printed with number runs on one
// line (see formatJson).

// Resolves true when it landed on the clipboard (false: the share sheet was
// used instead because this build has no clipboard module).
export async function copyJson(data: unknown): Promise<boolean> {
  return copyText(formatJson(data));
}

export async function shareJsonFile(fileName: string, data: unknown): Promise<void> {
  const text = formatJson(data);
  if (Platform.OS !== "ios") {
    await Share.share({ message: text });
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Share.share({ url: file.uri });
}

export function exportFileName(kind: string): string {
  return "tono-" + kind + "-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".json";
}
