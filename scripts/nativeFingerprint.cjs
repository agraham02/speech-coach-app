// A fingerprint of everything that is compiled into the iPhone build, so a change
// that needs a new build can't slip through as "just an update". It covers:
//  - every dependency that has native code, by installed version;
//  - the local native modules (modules/*), the config plugins (plugins/*) and any
//    patch-package patches, by content (line endings ignored);
//  - the native parts of the app config: plugins, iOS and Android settings, the
//    runtime version, and the icon and splash images.
// The version number is NOT in the hash: the rule is that the hash may only change
// when the version does (src/domain/__tests__/nativeFingerprint.test.ts). Pure
// Node, no dependencies, so the test and the accept script share it.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sha = (data) => crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);

// Text is hashed with Windows line endings turned into Unix ones, so the same code
// hashes the same on every machine. Anything with a zero byte is binary.
function fileHash(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) return sha(buffer);
  return sha(buffer.toString("utf8").replace(/\r\n/g, "\n"));
}

const SKIP = new Set(["build", ".gradle", "node_modules", ".cxx", ".git", "Pods", "DerivedData"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function treeHash(root, dir) {
  const parts = walk(dir).map((file) => `${path.relative(root, file).split(path.sep).join("/")}:${fileHash(file)}`);
  return parts.length ? sha(parts.join("\n")) : null;
}

function hasNativeCode(dir) {
  if (fs.existsSync(path.join(dir, "expo-module.config.json")) || fs.existsSync(path.join(dir, "app.plugin.js"))) return true;
  if (fs.existsSync(path.join(dir, "ios")) || fs.existsSync(path.join(dir, "android"))) return true;
  return fs.readdirSync(dir).some((name) => name.endsWith(".podspec"));
}

function nativeDependencies(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const found = {};
  const missing = [];
  for (const name of Object.keys(pkg.dependencies ?? {}).sort()) {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    if (!fs.existsSync(dir)) {
      missing.push(name);
      continue;
    }
    if (hasNativeCode(dir)) found[name] = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
  }
  return { found, missing };
}

// Every "./assets/..." the config points at: the icon and splash images are baked in.
function assetPaths(value, out = new Set()) {
  if (typeof value === "string" && value.startsWith("./assets/")) out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => assetPaths(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => assetPaths(v, out));
  return out;
}

function computeNativeFingerprint(config, root) {
  const { found, missing } = nativeDependencies(root);
  const modulesDir = path.join(root, "modules");
  const localModules = {};
  if (fs.existsSync(modulesDir)) {
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      localModules[entry.name] = treeHash(root, path.join(modulesDir, entry.name));
    }
  }
  const nativeConfig = {
    plugins: config.plugins ?? [],
    ios: config.ios ?? {},
    android: config.android ?? {},
    runtimeVersion: config.runtimeVersion ?? null,
    scheme: config.scheme ?? null,
    orientation: config.orientation ?? null,
    userInterfaceStyle: config.userInterfaceStyle ?? null,
  };
  const assets = {};
  for (const asset of [...assetPaths(config)].sort()) {
    const file = path.join(root, asset);
    assets[asset] = fs.existsSync(file) ? fileHash(file) : "missing";
  }
  const parts = {
    packages: found,
    localModules,
    configPlugins: treeHash(root, path.join(root, "plugins")),
    patches: treeHash(root, path.join(root, "patches")),
    config: sha(JSON.stringify(nativeConfig)),
    assets,
  };
  return { hash: sha(JSON.stringify(parts)), parts, missingPackages: missing };
}

// The parts that differ between two fingerprints, in words.
function describeChange(before, after) {
  const changes = [];
  const compare = (label, a = {}, b = {}) => {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] !== b[key]) changes.push(`${label} ${key}: ${a[key] ?? "(none)"} -> ${b[key] ?? "(none)"}`);
    }
  };
  compare("native package", before.packages, after.packages);
  compare("local module", before.localModules, after.localModules);
  compare("asset", before.assets, after.assets);
  for (const key of ["configPlugins", "patches", "config"]) if (before[key] !== after[key]) changes.push(`${key} changed`);
  return changes;
}

module.exports = { computeNativeFingerprint, describeChange };
