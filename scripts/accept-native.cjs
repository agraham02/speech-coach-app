// Records the native fingerprint of the code as it is now, for the build you are
// about to make. Bump `version` in app.config.ts and package.json first: this
// refuses to accept a native change under the same version.
// Run it with: npm run native:accept
const { spawnSync } = require("child_process");

const result = spawnSync("npx", ["jest", "src/domain/__tests__/nativeFingerprint.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NATIVE_ACCEPT: "1" },
});
process.exit(result.status ?? 1);
