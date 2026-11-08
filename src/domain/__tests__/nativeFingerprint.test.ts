import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import appConfig from "../../../app.config";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { computeNativeFingerprint, describeChange } = require("../../../scripts/nativeFingerprint.cjs") as {
  computeNativeFingerprint: (config: unknown, root: string) => { hash: string; parts: Record<string, unknown>; missingPackages: string[] };
  describeChange: (before: Record<string, unknown>, after: Record<string, unknown>) => string[];
};

// The one-build rule (docs/overhaul/DECISIONS.md, D20): anything compiled into the
// iPhone build may only change together with the version, because an update only
// reaches builds with the same version. If this fails, a change since the last
// build needs a new build. `npm run native:accept` records a new one, once the
// version has been bumped in app.config.ts and package.json.

const ROOT = join(__dirname, "..", "..", "..");
const FILE = join(ROOT, "native-fingerprint.json");
const config = appConfig() as { version: string };

interface Stored {
  version: string;
  hash: string;
  parts: Record<string, unknown>;
}

const current = computeNativeFingerprint(config, ROOT);

// NATIVE_ACCEPT=force is for a version that has not been built yet: its fingerprint can
// still change, since no build exists that it could disagree with.
if (process.env.NATIVE_ACCEPT === "1" || process.env.NATIVE_ACCEPT === "force") {
  const old: Stored | null = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
  if (current.missingPackages.length) throw new Error(`Run npm install first: ${current.missingPackages.join(", ")} aren't installed.`);
  if (old && old.hash !== current.hash && old.version === config.version && process.env.NATIVE_ACCEPT !== "force") {
    throw new Error(`Native code changed (${describeChange(old.parts, current.parts).join("; ")}) but the version is still ${config.version}. Bump version in app.config.ts and package.json first.`);
  }
  writeFileSync(FILE, `${JSON.stringify({ version: config.version, hash: current.hash, parts: current.parts }, null, 2)}\n`);
}

describe("the iPhone build's native code", () => {
  const stored: Stored = JSON.parse(readFileSync(FILE, "utf8"));

  it("has every dependency installed to check", () => {
    expect(current.missingPackages).toEqual([]);
  });

  it("hasn't changed since the last build was accepted, unless the version moved", () => {
    const changes = describeChange(stored.parts, current.parts);
    const message = changes.length
      ? `Native code changed since ${stored.version}: ${changes.join("; ")}. That needs a new build, not an update. Bump version in app.config.ts and package.json, run npm run native:accept, then build.`
      : "";
    expect(message).toBe("");
    expect(current.hash).toBe(stored.hash);
  });

  it("says the same version as the app", () => {
    expect(stored.version).toBe(config.version);
  });

  it("names the module the rest of the plan relies on", () => {
    expect(Object.keys(stored.parts.localModules as object)).toEqual(expect.arrayContaining(["tono-language", "backup-exclusion", "device-metrics"]));
    expect(Object.keys(stored.parts.packages as object)).toEqual(expect.arrayContaining(["react-native-keyboard-controller", "whisper.rn", "@react-native-ai/apple", "expo-speech-recognition"]));
  });
});
