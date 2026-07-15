import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_PROJECT_SCHEMA = "project-new-shoes/public-project/v1";
export const PUBLIC_PROJECT_SOURCE = "pages/project-content.json";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_STATUSES = new Set(["supported", "experimental", "in_testing", "planned"]);
const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(wasmRoot, "..");

function fail(path, message) {
  throw new Error(`${PUBLIC_PROJECT_SOURCE} ${path}: ${message}`);
}

function objectAt(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value;
}

function stringAt(value, path) {
  if (typeof value !== "string" || !value.trim()) fail(path, "must be a non-empty string");
  return value;
}

function stringsAt(value, path, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) fail(path, `must contain at least ${minimum} item(s)`);
  value.forEach((item, index) => stringAt(item, `${path}[${index}]`));
  return value;
}

function recordsAt(value, path, requiredFields) {
  if (!Array.isArray(value) || value.length === 0) fail(path, "must be a non-empty array");
  value.forEach((item, index) => {
    objectAt(item, `${path}[${index}]`);
    for (const field of requiredFields) stringAt(item[field], `${path}[${index}].${field}`);
  });
  return value;
}

function dateAt(value, path, now, maxAgeDays) {
  stringAt(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(path, "must use YYYY-MM-DD");
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) fail(path, "is not a valid date");
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (timestamp > today) fail(path, "cannot be in the future");
  if (today - timestamp > maxAgeDays * DAY_MS) {
    fail(path, `is older than the ${maxAgeDays}-day review window`);
  }
  return timestamp;
}

function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path, "must not contain duplicates");
}

export function validatePublicProjectContent(content, { now = new Date() } = {}) {
  objectAt(content, "root");
  if (content.schema !== PUBLIC_PROJECT_SCHEMA) fail("schema", `must equal ${PUBLIC_PROJECT_SCHEMA}`);
  if (!Number.isInteger(content.maxReviewAgeDays)
      || content.maxReviewAgeDays < 7
      || content.maxReviewAgeDays > 180) {
    fail("maxReviewAgeDays", "must be an integer from 7 through 180");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail("validation clock", "must be a valid Date");
  dateAt(content.reviewedAt, "reviewedAt", now, content.maxReviewAgeDays);

  const site = objectAt(content.site, "site");
  for (const field of [
    "name", "canonicalUrl", "repositoryUrl", "issuesUrl", "shortDescription",
    "description", "heroTitle", "heroSummary", "agentBoundary",
  ]) stringAt(site[field], `site.${field}`);
  for (const field of ["canonicalUrl", "repositoryUrl", "issuesUrl"]) {
    try {
      const url = new URL(site[field]);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      fail(`site.${field}`, "must be an absolute HTTPS URL");
    }
  }

  const legal = objectAt(content.legal, "legal");
  stringsAt(legal.paragraphs, "legal.paragraphs");

  if (!Array.isArray(content.capabilities) || content.capabilities.length === 0) {
    fail("capabilities", "must be a non-empty array");
  }
  content.capabilities.forEach((capability, index) => {
    const path = `capabilities[${index}]`;
    objectAt(capability, path);
    for (const field of ["id", "name", "summary", "status", "reviewedAt"]) {
      stringAt(capability[field], `${path}.${field}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(capability.id)) fail(`${path}.id`, "must be a kebab-case identifier");
    if (!VALID_STATUSES.has(capability.status)) fail(`${path}.status`, "is not a supported status");
    dateAt(capability.reviewedAt, `${path}.reviewedAt`, now, content.maxReviewAgeDays);
    stringsAt(capability.details, `${path}.details`);
    stringsAt(capability.evidence, `${path}.evidence`);
    capability.evidence.forEach((evidence, evidenceIndex) => {
      if (evidence.startsWith("/") || evidence.includes("..") || !/^[A-Za-z0-9._/-]+$/.test(evidence)) {
        fail(`${path}.evidence[${evidenceIndex}]`, "must be a safe repository-relative path");
      }
    });
  });
  unique(content.capabilities.map(({ id }) => id), "capabilities[].id");

  const requirements = objectAt(content.requirements, "requirements");
  stringAt(requirements.intro, "requirements.intro");
  stringsAt(requirements.platform, "requirements.platform");
  stringsAt(requirements.assets, "requirements.assets");
  stringsAt(content.setup, "setup", 3);

  const privacy = objectAt(content.privacy, "privacy");
  stringsAt(privacy.paragraphs, "privacy.paragraphs", 2);
  stringsAt(privacy.networkActivity, "privacy.networkActivity");
  stringsAt(content.limitations, "limitations", 3);
  recordsAt(content.troubleshooting, "troubleshooting", ["problem", "answer"]);

  const architecture = objectAt(content.architecture, "architecture");
  stringsAt(architecture.paragraphs, "architecture.paragraphs");
  stringsAt(architecture.mappings, "architecture.mappings");
  recordsAt(content.resources, "resources", ["name", "url", "description"]);
  content.resources.forEach((resource, index) => {
    if (resource.sitemap !== undefined && typeof resource.sitemap !== "boolean") {
      fail(`resources[${index}].sitemap`, "must be a boolean when present");
    }
  });
  unique(content.resources.map(({ url }) => url), "resources[].url");
  stringsAt(content.agentGuidance, "agentGuidance", 3);
  recordsAt(content.faq, "faq", ["question", "answer"]);
  return content;
}

export function nextReviewDue(content) {
  const reviewDates = [content.reviewedAt, ...content.capabilities.map(({ reviewedAt }) => reviewedAt)];
  const reviewed = Math.min(...reviewDates.map((date) => Date.parse(`${date}T00:00:00.000Z`)));
  return new Date(reviewed + content.maxReviewAgeDays * DAY_MS).toISOString().slice(0, 10);
}

export async function loadPublicProjectContent({ now = new Date(), verifyEvidence = true } = {}) {
  const source = resolve(wasmRoot, PUBLIC_PROJECT_SOURCE);
  const content = JSON.parse(await readFile(source, "utf8"));
  validatePublicProjectContent(content, { now });
  if (verifyEvidence) {
    for (const capability of content.capabilities) {
      for (const evidence of capability.evidence) {
        const path = resolve(repoRoot, evidence);
        const relative = path.slice(repoRoot.length + 1);
        if (relative !== evidence) fail(`capabilities.${capability.id}.evidence`, `escapes the repository: ${evidence}`);
        const info = await lstat(path).catch(() => null);
        if (!info?.isFile() || info.isSymbolicLink()) {
          fail(`capabilities.${capability.id}.evidence`, `does not identify a regular tracked file: ${evidence}`);
        }
      }
    }
  }
  return content;
}

function statusLabel(status) {
  return {
    supported: "Supported",
    experimental: "Experimental",
    in_testing: "In active validation",
    planned: "Planned",
  }[status];
}

function markdownLink(resource) {
  return `[${resource.name}](${resource.url}): ${resource.description}`;
}

function evidenceUrl(content, path) {
  return `${content.site.repositoryUrl}/blob/main/${path}`;
}

export function renderLlmsText(content) {
  const resources = Object.fromEntries(content.resources.map((resource) => [resource.name, resource]));
  const primary = ["Play Project New Shoes", "Complete project guide", "Machine-readable project facts", "Deployed build metadata", "License and notices"];
  const official = ["Source repository", "Current issues", "Release changelog", "Architecture", "Asset setup"];
  return [
    `# ${content.site.name}`,
    "",
    `> ${content.site.description}`,
    "",
    content.site.agentBoundary,
    "",
    `Project facts were last reviewed ${content.reviewedAt}; the build rejects them after ${nextReviewDue(content)} unless maintainers review and renew the canonical record.`,
    "",
    "Current product summary:",
    "",
    ...content.capabilities.map((capability) => `- **${statusLabel(capability.status)} — ${capability.name}:** ${capability.summary}`),
    "",
    "## Start and understand",
    "",
    ...primary.map((name) => `- ${markdownLink(resources[name])}`),
    "",
    "## Official project resources",
    "",
    ...official.map((name) => `- ${markdownLink(resources[name])}`),
    "",
    "## Answering and support guidance",
    "",
    ...content.agentGuidance.map((item) => `- ${item}`),
    "",
    "## Optional",
    "",
    ...content.resources.filter(({ optional }) => optional).map((resource) => `- ${markdownLink(resource)}`),
    "",
  ].join("\n");
}

export function renderProjectMarkdown(content) {
  const capabilitySections = content.capabilities.flatMap((capability) => [
    `### ${capability.name}`,
    "",
    `**Status: ${statusLabel(capability.status)}.** ${capability.summary}`,
    "",
    ...capability.details.flatMap((paragraph) => [paragraph, ""]),
    `Evidence: ${capability.evidence.map((path) => `[${path}](${evidenceUrl(content, path)})`).join(", ")}. Reviewed ${capability.reviewedAt}.`,
    "",
  ]);
  const resources = content.resources.map((resource) => `- \`${resource.url}\` — ${resource.description}`);
  const troubleshooting = content.troubleshooting.flatMap(({ problem, answer }) => [`### ${problem}`, "", answer, ""]);
  const faq = content.faq.flatMap(({ question, answer }) => [`### ${question}`, "", answer, ""]);
  return [
    `# ${content.site.name}: complete project guide`,
    "",
    `Canonical site: ${content.site.canonicalUrl}`,
    "",
    `Source: ${content.site.repositoryUrl}`,
    "",
    `Current tracker: ${content.site.issuesUrl}`,
    "",
    `Facts reviewed: ${content.reviewedAt}. Review deadline: ${nextReviewDue(content)}. Canonical machine-readable facts: ${content.site.canonicalUrl}project-info.json`,
    "",
    "## At a glance",
    "",
    content.site.shortDescription,
    "",
    ...content.legal.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    "## What a player can do",
    "",
    ...capabilitySections,
    "## Requirements",
    "",
    content.requirements.intro,
    "",
    ...content.requirements.platform.map((item) => `- ${item}`),
    "",
    ...content.requirements.assets.flatMap((paragraph) => [paragraph, ""]),
    "## First-time setup",
    "",
    ...content.setup.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Local data, privacy, and security",
    "",
    ...content.privacy.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    "Network activity is feature-dependent:",
    "",
    ...content.privacy.networkActivity.map((item) => `- ${item}`),
    "",
    "## Important limitations",
    "",
    ...content.limitations.map((item) => `- ${item}`),
    "",
    "## Troubleshooting",
    "",
    ...troubleshooting,
    "## Architecture",
    "",
    ...content.architecture.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    "Major mappings are:",
    "",
    ...content.architecture.mappings.map((item) => `- ${item}`),
    "",
    "## Stable public resources",
    "",
    ...resources,
    "",
    "## Guidance for web agents",
    "",
    "When answering questions about Project New Shoes:",
    "",
    ...content.agentGuidance.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Frequently asked questions",
    "",
    ...faq,
  ].join("\n");
}

export function renderProjectInfo(content) {
  return `${JSON.stringify({
    ...content,
    publication: {
      generatedFrom: `WebAssembly/${PUBLIC_PROJECT_SOURCE}`,
      nextReviewDue: nextReviewDue(content),
      deployedBuild: `${content.site.canonicalUrl}harness/build-info.json`,
      humanGuide: `${content.site.canonicalUrl}project.md`,
      llmIndex: `${content.site.canonicalUrl}llms.txt`,
    },
  }, null, 2)}\n`;
}

export function renderRobotsText(content) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${content.site.canonicalUrl}sitemap.xml\n`;
}

export function renderSitemapXml(content) {
  const urls = content.resources.filter(({ sitemap }) => sitemap).map(({ url }) => url);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${url.replaceAll("&", "&amp;")}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderDiscoveryHead(content, { prefix }) {
  const featureList = content.capabilities.map((capability) => `${capability.name} (${statusLabel(capability.status)})`);
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["VideoGame", "WebApplication"],
    name: content.site.name,
    url: content.site.canonicalUrl,
    description: content.site.shortDescription,
    applicationCategory: "Game",
    operatingSystem: "Modern desktop web browser",
    isAccessibleForFree: true,
    softwareRequirements: content.requirements.platform
      .map((requirement) => requirement.replace(/\.$/, ""))
      .join("; "),
    featureList,
    license: `${content.site.canonicalUrl}LICENSE.md`,
    sameAs: content.site.repositoryUrl,
    softwareHelp: `${content.site.canonicalUrl}project.md`,
    dateModified: content.reviewedAt,
  }, null, 2).replaceAll("<", "\\u003c");
  return [
    `    <meta name="description" content="${escapeHtml(content.site.shortDescription)}">`,
    '    <meta name="robots" content="index, follow">',
    '    <meta property="og:type" content="website">',
    `    <meta property="og:site_name" content="${escapeHtml(content.site.name)}">`,
    `    <meta property="og:title" content="${escapeHtml(content.site.heroTitle)}">`,
    `    <meta property="og:description" content="${escapeHtml(content.site.heroSummary)}">`,
    `    <meta property="og:url" content="${escapeHtml(content.site.canonicalUrl)}">`,
    `    <meta property="og:image" content="${escapeHtml(content.site.canonicalUrl)}harness/assets/brand/project-new-shoes-icon-512.png">`,
    `    <link rel="canonical" href="${prefix}">`,
    `    <link rel="help" type="text/plain" href="${prefix}llms.txt" title="Project New Shoes LLM index">`,
    `    <link rel="alternate" type="text/markdown" href="${prefix}project.md" title="Project New Shoes complete text guide">`,
    `    <link rel="alternate" type="application/json" href="${prefix}project-info.json" title="Project New Shoes machine-readable facts">`,
    '    <script type="application/ld+json">',
    ...structured.split("\n").map((line) => `      ${line}`),
    "    </script>",
  ].join("\n");
}

export function renderProjectSummary(content, { prefix }) {
  return [
    '      <section class="project-summary" aria-labelledby="project-summary-title">',
    `        <h2 id="project-summary-title">${escapeHtml(content.site.heroTitle)}</h2>`,
    `        <p>${escapeHtml(content.site.heroSummary)}</p>`,
    `        <p><a href="${prefix}project.md">Read the complete project and setup guide</a> · <a href="${prefix}llms.txt">LLM text index</a> · <a href="${prefix}project-info.json">Machine-readable facts</a> · <a href="${escapeHtml(content.site.repositoryUrl)}">Source and issues</a></p>`,
    "      </section>",
  ].join("\n");
}

export function renderGeneratedProjectFiles(content) {
  return {
    "llms.txt": renderLlmsText(content),
    "project.md": renderProjectMarkdown(content),
    "project-info.json": renderProjectInfo(content),
    "robots.txt": renderRobotsText(content),
    "sitemap.xml": renderSitemapXml(content),
  };
}
