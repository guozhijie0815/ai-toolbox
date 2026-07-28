import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function bumpPatch(version) {
  const parts = version.split(".");
  parts[parts.length - 1] = String(parseInt(parts[parts.length - 1], 10) + 1);
  return parts.join(".");
}

function updatePackageJson(newVersion) {
  const path = resolve(root, "package.json");
  const content = JSON.parse(readFileSync(path, "utf-8"));
  content.version = newVersion;
  writeFileSync(path, JSON.stringify(content, null, 2) + "\n");
}

function updateCargoToml(newVersion) {
  const path = resolve(root, "src-tauri", "Cargo.toml");
  let content = readFileSync(path, "utf-8");
  content = content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${newVersion}"`);
  writeFileSync(path, content);
}

function updateTauriConf(newVersion) {
  const path = resolve(root, "src-tauri", "tauri.conf.json");
  const content = JSON.parse(readFileSync(path, "utf-8"));
  content.version = newVersion;
  writeFileSync(path, JSON.stringify(content, null, 2) + "\n");
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const current = pkg.version;
const next = bumpPatch(current);

console.log(`Bumping version: ${current} → ${next}`);

updatePackageJson(next);
updateCargoToml(next);
updateTauriConf(next);

console.log("Done.");