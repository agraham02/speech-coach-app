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

// EAS asks which environment's variables to bundle with. Both kinds of build
// are made in "production", which has none, so nothing is added to the bundle.
const ENVIRONMENT = "production";

const [channel, ...passed] = process.argv.slice(2);
const rest = passed.includes("--environment") ? passed : [...passed, "--environment", ENVIRONMENT];
if (!(channel in DEV_TOOLS)) {
  console.error(`Usage: node scripts/eas-update.mjs <${Object.keys(DEV_TOOLS).join("|")}> [eas update options]`);
  process.exit(1);
}

const env = { ...process.env };
if (DEV_TOOLS[channel]) env.EXPO_PUBLIC_DEV_TOOLS = "1";
else delete env.EXPO_PUBLIC_DEV_TOOLS;

console.log(`Publishing to "${channel}" with the Dev tab ${DEV_TOOLS[channel] ? "on" : "off"}.`);
// Run through a shell (eas is a .cmd file on Windows), which splits on spaces,
// so anything with a space in it (a --message) has to be quoted.
const quote = (arg) => (/[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const result = spawnSync("eas", ["update", "--channel", channel, ...rest].map(quote), { env, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
