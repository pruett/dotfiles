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

    let statusEmoji = "";
    if (status.includes("??")) statusEmoji += "❓"; // Untracked
    if (status.includes(" M") || status.includes("M ")) statusEmoji += "📝"; // Modified
    if (status.includes(" A") || status.includes("A ")) statusEmoji += "➕"; // Added
    if (status.includes(" D") || status.includes("D ")) statusEmoji += "🗑️"; // Deleted
    if (status.includes("UU")) statusEmoji += "⚠️"; // Merge conflict

    return ` ${branch} ${statusEmoji}`;
  } catch (error) {
    return " 🚫";
  }
}

function getNodeVersion() {
  try {
    const version = process.version;
    return `🟢 ${version}`;
  } catch (error) {
    return "🟢 unknown";
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
  return `📂 ${displayPath}`;
}

function getModel() {
  const input = fs.readFileSync(0, "utf-8"); // Read from stdin synchronously
  const data = JSON.parse(input);
  const model = data.model.display_name;
  return `🤖 ${model}`;
}

function main() {
  const parts = [
    getModel(),
    getDirectory(),
    getGitInfo(),
    getNodeVersion(),
    getPackageManager(),
    getTime(),
  ].filter(Boolean);

  console.log(parts.join(" │ "));
}

main();
