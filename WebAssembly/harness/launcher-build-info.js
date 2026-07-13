const BUILD_INFO_URL = new URL("./build-info.json", import.meta.url);
const PROJECT_URL = "https://github.com/Agusx1211/NewShoes";

function appendChangelogEntry(list, entry) {
  const item = document.createElement("li");
  const text = document.createElement("span");
  text.textContent = entry.text;
  item.append(text);
  for (const link of entry.links || []) {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = `PR #${link.number}`;
    item.append(anchor);
  }
  list.append(item);
}

function renderChangelog(sections) {
  const root = document.querySelector("#aboutChangelog");
  root.replaceChildren();
  const populated = (sections || []).filter((section) => section.entries?.length);
  if (!populated.length) {
    const empty = document.createElement("p");
    empty.className = "about-changelog-empty";
    empty.textContent = "No release notes have been recorded yet.";
    root.append(empty);
    return;
  }
  for (const section of populated) {
    const group = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = section.date ? `${section.version} · ${section.date}` : section.version;
    const list = document.createElement("ul");
    for (const entry of section.entries) appendChangelogEntry(list, entry);
    group.append(heading, list);
    root.append(group);
  }
}

function renderBuildInfo(info) {
  const version = info.release?.version || "Unavailable";
  const commit = info.git?.commit || "";
  const shortCommit = info.git?.shortCommit || (commit ? commit.slice(0, 12) : "Unavailable");
  const dirtySuffix = info.git?.dirty ? " + local changes" : "";
  document.querySelector("#aboutVersion").textContent = version;
  const commitLink = document.querySelector("#aboutBuildCommit");
  commitLink.textContent = `${shortCommit}${dirtySuffix}`;
  if (commit) {
    commitLink.href = `${PROJECT_URL}/commit/${commit}`;
    commitLink.removeAttribute("aria-disabled");
  } else {
    commitLink.removeAttribute("href");
    commitLink.setAttribute("aria-disabled", "true");
  }
  document.querySelector("#startMenuVersion").textContent = `v${version} · ${shortCommit}${info.git?.dirty ? "+dirty" : ""}`;
  renderChangelog(info.release?.changelog);
}

async function loadBuildInfo() {
  try {
    const response = await fetch(BUILD_INFO_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`build info returned HTTP ${response.status}`);
    const info = await response.json();
    if (info.schema !== "cnc.harness-build-info.v1") throw new Error("unsupported build-info schema");
    renderBuildInfo(info);
  } catch (error) {
    document.querySelector("#aboutVersion").textContent = "Unavailable";
    document.querySelector("#aboutBuildCommit").textContent = "Unavailable";
    document.querySelector("#startMenuVersion").textContent = "Build information unavailable";
    const changelog = document.querySelector("#aboutChangelog");
    changelog.textContent = error instanceof Error ? error.message : String(error);
    changelog.classList.add("is-error");
  }
}

void loadBuildInfo();
