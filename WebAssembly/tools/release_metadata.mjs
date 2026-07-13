import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SECTION_PATTERN = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/;
const PR_LINK_PATTERN = /\[PR #(\d+)\]\((https:\/\/github\.com\/Agusx1211\/NewShoes\/pull\/(\d+))\)/g;

function parseSemanticVersion(source, label) {
  const version = String(source).trim();
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`${label} must contain one semantic version, found ${JSON.stringify(version)}`);
  }
  return version;
}

export function parseProjectVersion(source) {
  return parseSemanticVersion(source, "VERSION");
}

function parseEntry(line, lineNumber) {
  const markdown = line.slice(2).trim();
  const links = [];
  for (const match of markdown.matchAll(PR_LINK_PATTERN)) {
    if (match[1] !== match[3]) {
      throw new Error(`CHANGELOG.md:${lineNumber}: PR label and URL disagree`);
    }
    links.push({ number: Number(match[1]), url: match[2] });
  }
  if (links.length === 0) {
    throw new Error(`CHANGELOG.md:${lineNumber}: every entry must link at least one PR`);
  }
  const firstLink = markdown.indexOf("[PR #");
  const prefix = markdown.slice(0, firstLink);
  const suffix = markdown.slice(firstLink).replace(PR_LINK_PATTERN, "");
  if (!prefix.endsWith("(") || !/^(?:\s*,\s*)*\)\.?$/.test(suffix)) {
    throw new Error(`CHANGELOG.md:${lineNumber}: PR links must end the entry in parentheses`);
  }
  const text = prefix.slice(0, -1).trim();
  if (!text) {
    throw new Error(`CHANGELOG.md:${lineNumber}: entry text is empty`);
  }
  return { text, links };
}

export function parseChangelog(source) {
  const sections = [];
  const versions = new Set();
  let current = null;
  const lines = String(source).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const section = SECTION_PATTERN.exec(line);
    if (section) {
      const version = section[1];
      const date = section[2] || null;
      if (versions.has(version)) {
        throw new Error(`CHANGELOG.md:${index + 1}: duplicate ${version} section`);
      }
      if (version === "Unreleased") {
        if (date) throw new Error(`CHANGELOG.md:${index + 1}: Unreleased must not have a date`);
      } else {
        parseSemanticVersion(version, `CHANGELOG.md:${index + 1} release heading`);
        if (!date) throw new Error(`CHANGELOG.md:${index + 1}: released versions require a date`);
      }
      versions.add(version);
      current = { version, date, entries: [] };
      sections.push(current);
      continue;
    }
    if (!line.startsWith("- ")) continue;
    if (!current) {
      throw new Error(`CHANGELOG.md:${index + 1}: entry appears before a version section`);
    }
    current.entries.push(parseEntry(line, index + 1));
  }
  if (sections.length === 0 || sections[0].version !== "Unreleased") {
    throw new Error("CHANGELOG.md must start its release sections with ## [Unreleased]");
  }
  return sections;
}

export async function readReleaseMetadata(repoRoot) {
  const [versionSource, changelogSource] = await Promise.all([
    readFile(resolve(repoRoot, "VERSION"), "utf8"),
    readFile(resolve(repoRoot, "CHANGELOG.md"), "utf8"),
  ]);
  const version = parseProjectVersion(versionSource);
  const changelog = parseChangelog(changelogSource);
  if (!version.includes("-") && !changelog.some((section) => section.version === version)) {
    throw new Error(`CHANGELOG.md has no dated section for released VERSION ${version}`);
  }
  return { version, changelog };
}

export function createBuildInfo({ release, commit, branch, describe, dirty, status = [], server = null }) {
  return {
    schema: "cnc.harness-build-info.v1",
    generatedAt: new Date().toISOString(),
    server,
    git: {
      available: Boolean(commit),
      commit: commit || null,
      shortCommit: commit ? commit.slice(0, 12) : null,
      branch: branch || null,
      describe: describe || null,
      dirty,
      status,
    },
    release,
  };
}

export function validateBuildInfo(info) {
  if (info?.schema !== "cnc.harness-build-info.v1") throw new Error("unsupported schema");
  if (!/^[a-f0-9]{40}$/i.test(info.git?.commit || "")) throw new Error("invalid Git commit");
  parseProjectVersion(info.release?.version || "");
  const changelog = info.release?.changelog;
  if (!Array.isArray(changelog) || changelog[0]?.version !== "Unreleased") {
    throw new Error("invalid changelog sections");
  }
  return info;
}
