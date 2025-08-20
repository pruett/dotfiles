#!/usr/bin/env node

const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

function getGitInfo() {
  try {
    const branch = execSync("git branch --show-current", {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    const status = execSync("git status --porcelain", {
      encoding: "utf8",
      stdio: "pipe",
    });

    let statusMeta = "";
    if (status.includes("??")) statusMeta += "??"; // Untracked
    if (status.includes(" M") || status.includes("M ")) statusMeta += "M"; // Modified
    if (status.includes(" A") || status.includes("A ")) statusMeta += "A"; // Added
    if (status.includes(" D") || status.includes("D ")) statusMeta += "D"; // Deleted
    if (status.includes("UU")) statusMeta += "UU️"; // Merge conflict

    return `GIT: ${branch} [${statusMeta}]`;
  } catch (error) {
    return "GIT: N/A";
  }
}

function getNodeVersion() {
  try {
    const version = process.version;
    return `NODE: ${version}`;
  } catch (error) {
    return "NODE: [unknown]";
  }
}

function getPackageManager() {
  const cwd = process.cwd();

  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "📦 pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "🧶 yarn";
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "📦 npm";
  if (fs.existsSync(path.join(cwd, "bun.lockb"))) return "🥖 bun";

  return "";
}

function getTime() {
  return `🕐 ${new Date().toLocaleTimeString()}`;
}

function getDirectory() {
  const cwd = process.cwd();
  const home = process.env.HOME;
  const displayPath = cwd.replace(home, "~");
  return `DIR: ${displayPath}`;
}

function getCCInfo() {
  const input = fs.readFileSync(0, "utf-8"); // Read from stdin synchronously
  const data = JSON.parse(input);
  const model = data.model.display_name;
  const version = data.version;
  const output = data.output_style.name;
  const session = data.session_id;
  return `CC: v${version} • ${model} • ${output} • ${session.slice(0, 8)}`;
}

function main() {
  const parts = [
    getDirectory(),
    getGitInfo(),
    getNodeVersion(),
    // getPackageManager(),
    // getTime(),
    getCCInfo(),
  ].filter(Boolean);

  console.log(parts.join(" │ "));
}

main();
