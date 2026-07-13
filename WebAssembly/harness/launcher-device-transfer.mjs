import { joinRoom } from "./vendor/trystero-nostr.min.mjs";
import { PROJECT_NOSTR_RELAY } from "./webrtc-udp-endpoint.mjs";
import {
  DEVICE_TRANSFER_APP_ID,
  DEVICE_TRANSFER_CHECKPOINT_BYTES,
  DEVICE_TRANSFER_CHUNK_BYTES,
  DEVICE_TRANSFER_VERSION,
  deriveTransferKey,
  formatTransferBytes,
  formatTransferPin,
  formatTransferRate,
  generateTransferPin,
  normalizeTransferPin,
  openTransferMessage,
  sealTransferMessage,
} from "./device-transfer-protocol.mjs";

const ACTION_NAME = "newshoes-library-transfer-v1";
const SIGNAL_TIMEOUT_MS = 60_000;
const screens = new Map([...document.querySelectorAll("[data-transfer-screen]")]
  .map((element) => [element.dataset.transferScreen, element]));

const state = {
  token: 0,
  mode: null,
  pin: null,
  key: null,
  room: null,
  action: null,
  outgoing: null,
  senderPeer: null,
  senderPeers: new Map(),
  receiveQueues: new Map(),
  signals: new Map(),
  incoming: null,
  metricsTimer: null,
};

function safeError(error) {
  return error?.message ?? String(error);
}

function showScreen(name) {
  for (const [screenName, element] of screens) element.hidden = screenName !== name;
}

function setProgress(track, fill, completed, total) {
  const percent = total > 0 ? Math.max(0, Math.min(100, completed / total * 100)) : 0;
  track.setAttribute("aria-valuenow", String(Math.round(percent)));
  fill.style.width = `${percent}%`;
  return percent;
}

function relayUrls() {
  const testUrls = globalThis.__cncTestTransferRelayUrls;
  if (Array.isArray(testUrls) && testUrls.length
      && testUrls.every((url) => /^wss?:\/\//i.test(String(url)))) {
    return [...testUrls];
  }
  return [PROJECT_NOSTR_RELAY];
}

function localDeviceLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "Browser device";
  return String(platform).trim().slice(0, 60) || "Browser device";
}

function signalKey(peerId, type, value = "") {
  return `${peerId}:${type}:${value}`;
}

function waitForSignal(peerId, type, value = "") {
  const key = signalKey(peerId, type, value);
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.signals.delete(key);
      reject(new Error(`Timed out waiting for ${type}`));
    }, SIGNAL_TIMEOUT_MS);
    state.signals.set(key, { peerId, resolve, reject, timer });
  });
  // A send can fail before its pre-registered acknowledgement is awaited.
  // Keep cancellation from becoming an unhandled rejection in that case.
  promise.catch(() => {});
  return promise;
}

function resolveSignal(peerId, type, value, message) {
  const key = signalKey(peerId, type, value);
  const pending = state.signals.get(key);
  if (!pending) return false;
  clearTimeout(pending.timer);
  state.signals.delete(key);
  pending.resolve(message);
  return true;
}

function rejectSignals(reason, peerId = null) {
  for (const [key, pending] of state.signals) {
    if (peerId !== null && pending.peerId !== peerId) continue;
    clearTimeout(pending.timer);
    state.signals.delete(key);
    pending.reject(reason);
  }
}

async function sendEncrypted(peerId, message, payload = null) {
  if (!state.action || !state.key) throw new Error("Transfer connection is closed");
  const envelope = await sealTransferMessage(state.key, message, payload);
  await state.action.send(envelope, { target: peerId });
}

function validateCombinedManifest(value) {
  if (value?.version !== DEVICE_TRANSFER_VERSION || value?.game !== "zeroHour"
      || !Array.isArray(value.files) || !value.files.length) {
    throw new Error("The sender returned an invalid Zero Hour manifest");
  }
  const files = value.files.map((file) => ({
    id: String(file?.id ?? ""),
    kind: String(file?.kind ?? ""),
    name: String(file?.name ?? ""),
    bytes: Number(file?.bytes),
    ...(file?.kind === "archive" ? { entryCount: Number(file?.entryCount) } : {}),
  }));
  const ids = new Set(files.map((file) => file.id));
  if (files.some((file) => !file.id || !["archive", "video", "save", "replay"].includes(file.kind)
      || !file.name || !Number.isSafeInteger(file.bytes) || file.bytes <= 0)
      || ids.size !== files.length) {
    throw new Error("The sender returned an invalid file list");
  }
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new Error("Transfer size is invalid");
  return { version: DEVICE_TRANSFER_VERSION, game: "zeroHour", files, totalBytes };
}

async function createOutgoingSource({ includeSaves, includeReplays }) {
  const game = await window.ZeroHAssetLibrary.createTransferSource();
  let userFiles = [];
  if (includeSaves || includeReplays) {
    if (typeof window.CnCPort?.listTransferUserFiles !== "function") {
      throw new Error("Save and replay transfer is not available in this runtime");
    }
    await window.CnCPort.persistSaves?.("device-transfer-snapshot");
    userFiles = await window.CnCPort.listTransferUserFiles({ includeSaves, includeReplays });
  }
  const files = [...game.manifest.files, ...userFiles];
  const byId = new Map(files.map((file) => [file.id, file]));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    manifest: { version: DEVICE_TRANSFER_VERSION, game: "zeroHour", files },
    totalBytes,
    async readChunk(id, offset, length) {
      const file = byId.get(id);
      if (!file) throw new Error("Transfer source file is missing");
      return file.kind === "archive" || file.kind === "video"
        ? game.readChunk(id, offset, length)
        : window.CnCPort.readTransferUserFileChunk(file, offset, length);
    },
  };
}

function renderSenderPeers() {
  const list = document.querySelector("#transferReceiverList");
  const peers = [...state.senderPeers.values()];
  list.replaceChildren();
  if (!peers.length) {
    const empty = document.createElement("p");
    empty.textContent = "No receiving devices connected yet.";
    list.append(empty);
  }
  for (const peer of peers) {
    const row = document.createElement("div");
    row.className = "transfer-peer";
    const title = document.createElement("strong");
    title.textContent = peer.label;
    const metrics = document.createElement("span");
    metrics.textContent = peer.status === "complete"
      ? `Complete · ${formatTransferBytes(peer.sent)}`
      : peer.status === "failed"
        ? `Failed · ${peer.error}`
        : `${formatTransferBytes(peer.sent)} · ${formatTransferRate(peer.sent, Date.now() - peer.startedAt)}`;
    const track = document.createElement("i");
    const fill = document.createElement("b");
    fill.style.width = `${peer.total > 0 ? Math.min(100, peer.sent / peer.total * 100) : 0}%`;
    track.append(fill);
    row.append(title, metrics, track);
    list.append(row);
  }
  const active = peers.filter((peer) => peer.status !== "failed");
  const sent = active.reduce((sum, peer) => sum + peer.sent, 0);
  const total = active.reduce((sum, peer) => sum + peer.total, 0);
  const startedAt = active.length ? Math.min(...active.map((peer) => peer.startedAt)) : Date.now();
  setProgress(
    document.querySelector("#transferSenderProgressFill").parentElement,
    document.querySelector("#transferSenderProgressFill"),
    sent,
    total,
  );
  document.querySelector("#transferSenderMetrics").textContent =
    `${formatTransferBytes(sent)} · ${formatTransferRate(sent, Date.now() - startedAt)}`;
  document.querySelector("#transferSenderProgressLabel").textContent = !peers.length
    ? "Waiting for a receiving device"
    : peers.every((peer) => peer.status === "complete")
      ? `Sent to ${peers.length} device${peers.length === 1 ? "" : "s"}`
      : `Sending to ${active.length} device${active.length === 1 ? "" : "s"}`;
}

async function sendToReceiver(peerId, hello, token) {
  if (state.senderPeers.has(peerId)) return;
  const peer = {
    peerId,
    label: String(hello.device || "Receiving device").slice(0, 60),
    status: "preparing",
    sent: 0,
    total: state.outgoing.totalBytes,
    startedAt: Date.now(),
    error: null,
  };
  state.senderPeers.set(peerId, peer);
  renderSenderPeers();
  try {
    const transferId = crypto.randomUUID();
    const ready = waitForSignal(peerId, "ready", transferId);
    await sendEncrypted(peerId, {
      type: "manifest",
      transferId,
      manifest: state.outgoing.manifest,
    });
    await ready;
    if (token !== state.token) throw new Error("Transfer stopped");
    peer.status = "sending";
    let sequence = 0;
    let sinceCheckpoint = 0;
    for (const file of state.outgoing.manifest.files) {
      await sendEncrypted(peerId, { type: "file-start", transferId, fileId: file.id });
      for (let offset = 0; offset < file.bytes;) {
        const length = Math.min(DEVICE_TRANSFER_CHUNK_BYTES, file.bytes - offset);
        const bytes = await state.outgoing.readChunk(file.id, offset, length);
        if (bytes.byteLength !== length) throw new Error(`${file.name} changed during transfer`);
        sinceCheckpoint += bytes.byteLength;
        const checkpoint = sinceCheckpoint >= DEVICE_TRANSFER_CHECKPOINT_BYTES;
        const seq = checkpoint ? ++sequence : 0;
        const acknowledged = checkpoint ? waitForSignal(peerId, "ack", seq) : null;
        await sendEncrypted(peerId, {
          type: "chunk",
          transferId,
          fileId: file.id,
          offset,
          checkpoint,
          seq,
        }, bytes);
        offset += bytes.byteLength;
        peer.sent += bytes.byteLength;
        if (acknowledged) {
          await acknowledged;
          sinceCheckpoint = 0;
        }
        if (token !== state.token) throw new Error("Transfer stopped");
      }
      const seq = ++sequence;
      const fileComplete = waitForSignal(peerId, "ack", seq);
      await sendEncrypted(peerId, { type: "file-end", transferId, fileId: file.id, seq });
      await fileComplete;
      sinceCheckpoint = 0;
    }
    const complete = waitForSignal(peerId, "complete", transferId);
    await sendEncrypted(peerId, { type: "complete", transferId });
    await complete;
    peer.status = "complete";
  } catch (error) {
    rejectSignals(error, peerId);
    peer.status = "failed";
    peer.error = safeError(error);
  }
  renderSenderPeers();
}

async function abortIncoming() {
  const incoming = state.incoming;
  state.incoming = null;
  await Promise.allSettled([
    incoming?.gameSession?.abort?.(),
    incoming?.userSession?.abort?.(),
  ]);
}

function renderReceiverProgress() {
  const incoming = state.incoming;
  if (!incoming) return;
  const elapsed = Date.now() - incoming.startedAt;
  setProgress(
    document.querySelector("#transferReceiverProgressFill").parentElement,
    document.querySelector("#transferReceiverProgressFill"),
    incoming.received,
    incoming.totalBytes,
  );
  document.querySelector("#transferReceiverMetrics").textContent =
    `${formatTransferBytes(incoming.received)} of ${formatTransferBytes(incoming.totalBytes)} · ${formatTransferRate(incoming.received, elapsed)}`;
  document.querySelector("#transferReceiverProgressLabel").textContent =
    `${Math.floor(incoming.received / incoming.totalBytes * 100)}% received`;
}

async function prepareIncoming(message) {
  if (state.incoming) throw new Error("The sender tried to start a second transfer");
  const manifest = validateCombinedManifest(message.manifest);
  const gameFiles = manifest.files.filter((file) => file.kind === "archive" || file.kind === "video");
  const userFiles = manifest.files.filter((file) => file.kind === "save" || file.kind === "replay");
  const gameSession = await window.ZeroHAssetLibrary.beginTransferredLibrary({
    version: DEVICE_TRANSFER_VERSION,
    game: "zeroHour",
    files: gameFiles,
  });
  let userSession = null;
  try {
    if (userFiles.length) {
      if (typeof window.CnCPort?.beginTransferUserDataImport !== "function") {
        throw new Error("This runtime cannot receive saves and replays");
      }
      userSession = await window.CnCPort.beginTransferUserDataImport(userFiles);
    }
  } catch (error) {
    await gameSession.abort();
    throw error;
  }
  state.incoming = {
    transferId: String(message.transferId),
    files: manifest.files,
    fileIndex: 0,
    fileReceived: 0,
    received: 0,
    totalBytes: manifest.totalBytes,
    startedAt: Date.now(),
    gameSession,
    userSession,
  };
  document.querySelector("#transferReceiveTitle").textContent = "Receiving your Zero Hour installation";
  document.querySelector("#transferReceiveDetail").textContent =
    `${manifest.files.length} files · ${formatTransferBytes(manifest.totalBytes)}`;
  document.querySelector("#transferReceiverFile").textContent = "Preparing the first file…";
  renderReceiverProgress();
  await sendEncrypted(state.senderPeer, {
    type: "ready",
    transferId: state.incoming.transferId,
  });
}

function currentIncomingFile(message) {
  const incoming = state.incoming;
  if (!incoming || message.transferId !== incoming.transferId) throw new Error("Transfer session does not match");
  const file = incoming.files[incoming.fileIndex];
  if (!file || file.id !== message.fileId) throw new Error("Incoming file order does not match the manifest");
  return { incoming, file };
}

function sessionForFile(incoming, file) {
  return file.kind === "archive" || file.kind === "video" ? incoming.gameSession : incoming.userSession;
}

async function handleReceiverMessage(peerId, message, payload) {
  if (message.type === "hello") {
    if (message.role !== "sender") return;
    if (state.senderPeer && state.senderPeer !== peerId) return;
    state.senderPeer = peerId;
    document.querySelector("#transferReceiveTitle").textContent = "Connected to your sending device";
    document.querySelector("#transferReceiveDetail").textContent = "Waiting for the encrypted file manifest…";
    await sendEncrypted(peerId, { type: "hello", role: "receiver", legal: true, device: localDeviceLabel() });
    return;
  }
  if (peerId !== state.senderPeer) return;
  if (message.type === "manifest") {
    await prepareIncoming(message);
    return;
  }
  if (message.type === "file-start") {
    const { incoming, file } = currentIncomingFile(message);
    incoming.fileReceived = 0;
    document.querySelector("#transferReceiverFile").textContent = `Receiving ${file.name}`;
    await sessionForFile(incoming, file).beginFile(file.id);
    return;
  }
  if (message.type === "chunk") {
    const { incoming, file } = currentIncomingFile(message);
    if (payload.byteLength > DEVICE_TRANSFER_CHUNK_BYTES || message.offset !== incoming.fileReceived
        || incoming.fileReceived + payload.byteLength > file.bytes) {
      throw new Error("Incoming file chunk is invalid or out of order");
    }
    await sessionForFile(incoming, file).writeChunk(file.id, message.offset, payload);
    incoming.fileReceived += payload.byteLength;
    incoming.received += payload.byteLength;
    renderReceiverProgress();
    if (message.checkpoint === true) {
      await sendEncrypted(peerId, { type: "ack", transferId: incoming.transferId, seq: message.seq });
    }
    return;
  }
  if (message.type === "file-end") {
    const { incoming, file } = currentIncomingFile(message);
    if (incoming.fileReceived !== file.bytes) throw new Error(`${file.name} is incomplete`);
    await sessionForFile(incoming, file).finishFile(file.id);
    incoming.fileIndex += 1;
    incoming.fileReceived = 0;
    await sendEncrypted(peerId, { type: "ack", transferId: incoming.transferId, seq: message.seq });
    return;
  }
  if (message.type === "complete") {
    const incoming = state.incoming;
    if (!incoming || message.transferId !== incoming.transferId
        || incoming.fileIndex !== incoming.files.length || incoming.received !== incoming.totalBytes) {
      throw new Error("Transfer completed before all files arrived");
    }
    const importedUserFiles = incoming.userSession ? await incoming.userSession.finish() : [];
    await incoming.gameSession.finish();
    await sendEncrypted(peerId, { type: "complete-ack", transferId: incoming.transferId });
    state.incoming = null;
    document.querySelector("#transferCompleteSummary").textContent = importedUserFiles.length
      ? `Game files and ${importedUserFiles.length} save/replay file${importedUserFiles.length === 1 ? "" : "s"} are ready on this device.`
      : "Your game files are ready on this device.";
    showScreen("complete");
    window.ZeroHDesktop?.showToast("Transfer complete", "Zero Hour is installed and ready to launch.");
  }
}

async function handleSenderMessage(peerId, message) {
  if (message.type === "hello" && message.role === "receiver" && message.legal === true) {
    void sendToReceiver(peerId, message, state.token);
    return;
  }
  if (message.type === "ready") {
    resolveSignal(peerId, "ready", String(message.transferId), message);
    return;
  }
  if (message.type === "ack") {
    resolveSignal(peerId, "ack", String(message.seq), message);
    return;
  }
  if (message.type === "complete-ack") {
    resolveSignal(peerId, "complete", String(message.transferId), message);
  }
}

function queueIncomingEnvelope(peerId, raw) {
  const previous = state.receiveQueues.get(peerId) ?? Promise.resolve();
  const queued = previous.then(async () => {
    const { message, payload } = await openTransferMessage(state.key, raw);
    if (state.mode === "sender") await handleSenderMessage(peerId, message, payload);
    if (state.mode === "receiver") await handleReceiverMessage(peerId, message, payload);
  }).catch(async (error) => {
    if (state.mode === "sender") {
      const peer = state.senderPeers.get(peerId);
      if (peer) { peer.status = "failed"; peer.error = safeError(error); renderSenderPeers(); }
    } else if (peerId === state.senderPeer) {
      await abortIncoming();
      const alert = document.querySelector("#transferLiveError");
      alert.textContent = safeError(error);
      alert.hidden = false;
      document.querySelector("#transferReceiveTitle").textContent = "Transfer failed";
    }
  });
  state.receiveQueues.set(peerId, queued);
}

async function openRoom(pin, mode) {
  state.pin = normalizeTransferPin(pin);
  state.key = await deriveTransferKey(state.pin);
  state.mode = mode;
  const urls = relayUrls();
  const room = joinRoom({
    appId: DEVICE_TRANSFER_APP_ID,
    password: state.pin,
    relayConfig: { urls, redundancy: urls.length },
  }, `transfer-${state.pin}`, {
    handshakeTimeoutMs: 30_000,
    onJoinError: ({ error }) => {
      if (state.mode === "receiver") {
        const alert = document.querySelector("#transferLiveError");
        alert.textContent = `Could not open the encrypted connection: ${error}`;
        alert.hidden = false;
      } else {
        document.querySelector("#transferSenderStatus").textContent = `Connection warning: ${error}`;
      }
    },
  });
  state.room = room;
  state.action = room.makeAction(ACTION_NAME);
  state.action.onMessage = (data, { peerId }) => queueIncomingEnvelope(peerId, data);
  room.onPeerJoin = (peerId) => {
    if (mode === "sender") {
      void sendEncrypted(peerId, { type: "hello", role: "sender", device: localDeviceLabel() });
      document.querySelector("#transferSenderStatus").textContent = "Receiving device connected securely";
    } else {
      void sendEncrypted(peerId, { type: "hello", role: "receiver", legal: true, device: localDeviceLabel() });
    }
  };
  room.onPeerLeave = (peerId) => {
    state.receiveQueues.delete(peerId);
    rejectSignals(new Error("Device disconnected"), peerId);
    if (mode === "sender") {
      const peer = state.senderPeers.get(peerId);
      if (peer && peer.status !== "complete") {
        peer.status = "failed";
        peer.error = "Device disconnected";
        renderSenderPeers();
      }
    } else if (peerId === state.senderPeer && screens.get("receive-live")?.hidden === false) {
      void abortIncoming();
      const alert = document.querySelector("#transferLiveError");
      alert.textContent = "The sending device disconnected before the transfer completed.";
      alert.hidden = false;
    }
  };
}

async function stopSession({ screen = "choose" } = {}) {
  state.token += 1;
  clearInterval(state.metricsTimer);
  state.metricsTimer = null;
  rejectSignals(new Error("Transfer stopped"));
  await abortIncoming();
  const room = state.room;
  state.room = null;
  state.action = null;
  if (room) {
    try { await room.leave(); } catch { /* already closed */ }
  }
  state.mode = null;
  state.pin = null;
  state.key = null;
  state.outgoing = null;
  state.senderPeer = null;
  state.senderPeers.clear();
  state.receiveQueues.clear();
  document.querySelector("#transferSendOwnership").checked = false;
  document.querySelector("#transferReceiveOwnership").checked = false;
  document.querySelector("#transferReceiveNext").disabled = true;
  document.querySelector("#transferPinInput").value = "";
  document.querySelector("#transferConnect").disabled = true;
  document.querySelector("#transferSenderPin").textContent = "•••• •••• ••••";
  document.querySelector("#transferLiveError").hidden = true;
  document.querySelector("#transferReceiveError").hidden = true;
  showScreen(screen);
}

async function startSender() {
  const button = document.querySelector("#transferStartSend");
  button.disabled = true;
  const status = document.querySelector("#transferInstallStatus");
  status.classList.remove("is-error");
  status.textContent = "Preparing a read-only snapshot of your installed files…";
  try {
    state.outgoing = await createOutgoingSource({
      includeSaves: document.querySelector("#transferIncludeSaves").checked,
      includeReplays: document.querySelector("#transferIncludeReplays").checked,
    });
    const pin = generateTransferPin();
    document.querySelector("#transferSenderPin").textContent = formatTransferPin(pin);
    document.querySelector("#transferSenderStatus").textContent = "Waiting for receiving devices";
    showScreen("send-live");
    await openRoom(pin, "sender");
    state.metricsTimer = setInterval(renderSenderPeers, 500);
    renderSenderPeers();
  } catch (error) {
    status.textContent = safeError(error);
    status.classList.add("is-error");
    showScreen("send-consent");
    button.disabled = !document.querySelector("#transferSendOwnership").checked;
  }
}

async function startReceiver() {
  const input = document.querySelector("#transferPinInput");
  const error = document.querySelector("#transferReceiveError");
  error.hidden = true;
  document.querySelector("#transferLiveError").hidden = true;
  try {
    const pin = normalizeTransferPin(input.value);
    showScreen("receive-live");
    document.querySelector("#transferReceiveTitle").textContent = "Connecting to your sending device…";
    document.querySelector("#transferReceiveDetail").textContent = "Waiting for an encrypted WebRTC connection.";
    await openRoom(pin, "receiver");
  } catch (exception) {
    error.textContent = safeError(exception);
    error.hidden = false;
    showScreen("receive-code");
  }
}

async function refreshSendAvailability() {
  const status = document.querySelector("#transferInstallStatus");
  const installed = window.ZeroHAssetLibrary.installedLibrary();
  status.classList.toggle("is-error", !installed);
  status.textContent = installed
    ? `Installed Zero Hour library ready · ${formatTransferBytes(installed.totalBytes)}`
    : "No installed Zero Hour library was found. Use the Game Launcher and choose “Install in this browser” first.";
  document.querySelector("#transferStartSend").disabled =
    !installed || !document.querySelector("#transferSendOwnership").checked;
}

document.querySelector("#transferChooseSend").addEventListener("click", () => {
  showScreen("send-consent");
  void refreshSendAvailability();
});
document.querySelector("#transferChooseReceive").addEventListener("click", () => showScreen("receive-consent"));
document.querySelectorAll("[data-transfer-back]").forEach((button) => button.addEventListener("click", () => {
  showScreen(button.dataset.transferBack);
}));
document.querySelector("#transferSendOwnership").addEventListener("change", refreshSendAvailability);
document.querySelector("#transferReceiveOwnership").addEventListener("change", (event) => {
  document.querySelector("#transferReceiveNext").disabled = !event.currentTarget.checked;
});
document.querySelector("#transferReceiveNext").addEventListener("click", () => {
  showScreen("receive-code");
  document.querySelector("#transferPinInput").focus();
});
document.querySelector("#transferPinInput").addEventListener("input", (event) => {
  event.currentTarget.value = formatTransferPin(event.currentTarget.value);
  document.querySelector("#transferConnect").disabled = event.currentTarget.value.replace(/\D/g, "").length !== 12;
});
document.querySelector("#transferPinInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !document.querySelector("#transferConnect").disabled) void startReceiver();
});
document.querySelector("#transferStartSend").addEventListener("click", () => void startSender());
document.querySelector("#transferConnect").addEventListener("click", () => void startReceiver());
document.querySelector("#transferStopSend").addEventListener("click", () => void stopSession());
document.querySelector("#transferCancelReceive").addEventListener("click", () => void stopSession({ screen: "receive-consent" }));
document.querySelector("#transferDone").addEventListener("click", () => void stopSession());
document.querySelector('#transferWindow [data-window-action="close"]').addEventListener("click", () => void stopSession());
window.addEventListener("zeroh:reset-apps", () => void stopSession());

window.ZeroHDeviceTransfer = {
  snapshot: () => ({
    mode: state.mode,
    pinActive: Boolean(state.pin),
    peerCount: state.mode === "sender" ? state.senderPeers.size : Number(Boolean(state.senderPeer)),
    transferring: Boolean(state.incoming || [...state.senderPeers.values()].some((peer) => peer.status === "sending")),
  }),
};
