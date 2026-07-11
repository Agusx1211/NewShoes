(() => {
  "use strict";

  const DEFAULT_LOGO_ID = "01";
  const LOGO_DECISION_VERSION = "round-01-folded-command";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  if (storageGet("zeroh-logo-decision") !== LOGO_DECISION_VERSION) {
    storageSet("zeroh-selected-logo", DEFAULT_LOGO_ID);
    storageSet("zeroh-logo-decision", LOGO_DECISION_VERSION);
  }

  const candidates = [
    ["Folded Command", "armored monogram"],
    ["Siege Ring", "bold circular seal"],
    ["Signal Spear", "fast tactical signal"],
    ["Hex Relay", "contained command badge"],
    ["Split Shield", "faction-ready crest"],
    ["Horizon Ring", "minimal field symbol"],
    ["Compass Strike", "precision and motion"],
    ["Uplink Gate", "networked stronghold"],
    ["Field Monogram", "clean dimensional type"],
    ["Gearmark", "industrial system badge"],
    ["Night Compass", "recon and direction"],
    ["Target Line", "technical rangefinder"],
    ["Desert Gate", "terrain and fortress"],
    ["Command Node", "connected operations"],
    ["Arrowhead", "aggressive deployment"],
    ["Orbital Fold", "global command motion"],
    ["Fortress Cut", "heavy defensive mark"],
    ["Steel Oval", "retro hardware badge"],
    ["Clean Monogram", "small-scale clarity"],
    ["Horizon Beacon", "desert signal marker"],
  ].map(([name, trait], index) => ({
    id: String(index + 1).padStart(2, "0"),
    name,
    trait,
    src: `./assets/logos/logo-${String(index + 1).padStart(2, "0")}.webp`,
  }));

  const grid = document.querySelector("#logoGrid");
  const applyButton = document.querySelector("#applyButton");
  const shortlistFilter = document.querySelector("#shortlistFilter");
  const shortlistCount = document.querySelector("#shortlistCount");
  const emptyShortlist = document.querySelector("#emptyShortlist");
  const decisionImage = document.querySelector("#decisionImage");
  const dockTinyImage = document.querySelector("#dockTinyImage");
  const decisionPlaceholder = document.querySelector("#decisionPlaceholder");
  const decisionName = document.querySelector("#decisionName");
  const decisionNote = document.querySelector("#decisionNote");
  const toast = document.querySelector("#labToast");
  let inspectingId = storageGet("zeroh-selected-logo") || DEFAULT_LOGO_ID;
  let shortlist = readShortlist();
  let shortlistOnly = false;
  let previewTheme = "command";
  let toastTimer = 0;

  function readShortlist() {
    try {
      const stored = JSON.parse(storageGet("zeroh-logo-shortlist") || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }

  function renderCards() {
    const appliedId = storageGet("zeroh-selected-logo") || DEFAULT_LOGO_ID;
    const visible = shortlistOnly ? candidates.filter((candidate) => shortlist.has(candidate.id)) : candidates;
    grid.replaceChildren(...visible.map((candidate) => {
      const card = document.createElement("article");
      card.className = "logo-card";
      card.dataset.id = candidate.id;
      card.dataset.theme = previewTheme;
      card.classList.toggle("is-inspecting", candidate.id === inspectingId);
      card.classList.toggle("is-applied", candidate.id === appliedId);
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="logo-stage">
          <img src="${candidate.src}" alt="ZeroH candidate ${candidate.id}: ${candidate.name}" loading="lazy" width="512" height="512">
          <button class="star-button${shortlist.has(candidate.id) ? " is-starred" : ""}" type="button" aria-label="${shortlist.has(candidate.id) ? "Remove from" : "Add to"} shortlist" aria-pressed="${shortlist.has(candidate.id)}">${shortlist.has(candidate.id) ? "★" : "☆"}</button>
        </div>
        <div class="logo-info"><span class="logo-number">${candidate.id}</span><strong class="logo-name">${candidate.name}</strong><span class="logo-trait">${candidate.trait}</span></div>
        <div class="scale-test" aria-label="Taskbar scale preview"><img src="${candidate.src}" alt=""><strong>ZeroH</strong><i></i></div>`;
      card.addEventListener("click", (event) => {
        if (event.target.closest(".star-button")) return;
        inspectCandidate(candidate.id);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        inspectCandidate(candidate.id);
      });
      card.querySelector(".star-button").addEventListener("click", () => toggleShortlist(candidate.id));
      return card;
    }));
    shortlistCount.textContent = String(shortlist.size);
    emptyShortlist.hidden = visible.length !== 0;
  }

  function inspectCandidate(id) {
    inspectingId = id;
    const candidate = candidates.find((item) => item.id === id);
    document.querySelectorAll(".logo-card").forEach((card) => card.classList.toggle("is-inspecting", card.dataset.id === id));
    if (!candidate) return;
    decisionImage.src = candidate.src;
    dockTinyImage.src = candidate.src;
    decisionImage.alt = `Candidate ${candidate.id}, ${candidate.name}`;
    decisionImage.hidden = false;
    dockTinyImage.hidden = false;
    decisionPlaceholder.hidden = true;
    decisionName.textContent = `${candidate.id} — ${candidate.name}`;
    decisionNote.textContent = candidate.trait;
    applyButton.disabled = false;
    applyButton.textContent = storageGet("zeroh-selected-logo") === id ? "Currently in use" : "Use this mark";
  }

  function toggleShortlist(id) {
    if (shortlist.has(id)) shortlist.delete(id); else shortlist.add(id);
    if (!storageSet("zeroh-logo-shortlist", JSON.stringify([...shortlist]))) {
      showToast("Shortlist changed for this tab, but browser storage is unavailable.");
    }
    renderCards();
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
  }

  document.querySelectorAll("[data-preview-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      previewTheme = button.dataset.previewTheme;
      document.querySelectorAll("[data-preview-theme]").forEach((item) => item.classList.toggle("is-active", item === button));
      document.querySelectorAll(".logo-card").forEach((card) => { card.dataset.theme = previewTheme; });
    });
  });

  shortlistFilter.addEventListener("click", () => {
    shortlistOnly = !shortlistOnly;
    shortlistFilter.setAttribute("aria-pressed", String(shortlistOnly));
    renderCards();
  });

  document.querySelector("#showAllButton").addEventListener("click", () => {
    shortlistOnly = false;
    shortlistFilter.setAttribute("aria-pressed", "false");
    renderCards();
  });

  applyButton.addEventListener("click", () => {
    if (!inspectingId) return;
    const candidate = candidates.find((item) => item.id === inspectingId);
    if (!storageSet("zeroh-selected-logo", inspectingId)) {
      showToast("This browser could not save the launcher mark.");
      return;
    }
    window.opener?.postMessage({ type: "zeroh-logo-selected", id: inspectingId }, window.location.origin);
    applyButton.textContent = "Currently in use";
    renderCards();
    showToast(`${candidate.name} is now the ZeroH launcher mark.`);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === "zeroh-selected-logo") {
      inspectingId = event.newValue;
      renderCards();
      if (inspectingId) inspectCandidate(inspectingId);
    }
  });

  renderCards();
  if (inspectingId) inspectCandidate(inspectingId);
})();
