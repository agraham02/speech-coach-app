// Publishes an over-the-air update (EAS Update) to one channel, with the Dev
// tab on or off to match the builds on that channel.
//
//   npm run update:production -- --message "New lessons"
//   npm run update:testflight -- --message "Waveform fix"
//
// The Dev tab is decided when the JavaScript is bundled
// (src/config/devTools.ts reads EXPO_PUBLIC_DEV_TOOLS), and `eas update`
// bundles on this computer without looking at eas.json's build profiles. So
// the flag is set here: on for testflight (those builds have the Dev tab), and
// always cleared for production, even if the shell has it set.
import { spawnSync } from "node:child_process";

const DEV_TOOLS = { production: false, testflight: true };

const [channel, ...rest] = process.argv.slice(2);
if (!(channel in DEV_TOOLS)) {
  console.error(`Usage: node scripts/eas-update.mjs <${Object.keys(DEV_TOOLS).join("|")}> [eas update options]`);
  process.exit(1);
}

const env = { ...process.env };
if (DEV_TOOLS[channel]) env.EXPO_PUBLIC_DEV_TOOLS = "1";
else delete env.EXPO_PUBLIC_DEV_TOOLS;

console.log(`Publishing to "${channel}" with the Dev tab ${DEV_TOOLS[channel] ? "on" : "off"}.`);
const result = spawnSync("eas", ["update", "--channel", channel, ...rest], { env, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
