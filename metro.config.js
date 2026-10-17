const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// whisper.rn lists only wildcard subpaths in its package exports, with no
// entry for the bare package name, so Metro warns on every import and falls
// back to the file entry. Resolve the bare name to that entry directly.
const WHISPER_ENTRY = path.join(__dirname, "node_modules", "whisper.rn", "src", "index.ts");
const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "whisper.rn") return { type: "sourceFile", filePath: WHISPER_ENTRY };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
