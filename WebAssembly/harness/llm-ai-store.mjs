import { createLlmAiProfile, exportLlmAiSession } from "./llm-ai-profile.mjs";

const DB_NAME = "project-new-shoes-llm-ai";
const DB_VERSION = 1;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed")), { once: true });
  });
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export class LlmAiStore {
  constructor({ indexedDBImpl = globalThis.indexedDB } = {}) {
    if (!indexedDBImpl) throw new TypeError("IndexedDB is unavailable; LLM AI data cannot be persisted");
    this.indexedDB = indexedDBImpl;
    this.databasePromise = null;
  }

  async database() {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(DB_NAME, DB_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("profiles")) {
          const profiles = database.createObjectStore("profiles", { keyPath: "id" });
          profiles.createIndex("updatedAt", "updatedAt");
          profiles.createIndex("name", "name");
        }
        if (!database.objectStoreNames.contains("sessions")) {
          const sessions = database.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("profileId", "profileId");
          sessions.createIndex("startedAt", "startedAt");
          sessions.createIndex("status", "status");
        }
        if (!database.objectStoreNames.contains("events")) {
          const events = database.createObjectStore("events", { keyPath: ["sessionId", "sequence"] });
          events.createIndex("sessionId", "sessionId");
          events.createIndex("timestamp", "timestamp");
        }
      });
      request.addEventListener("success", () => {
        request.result.addEventListener("versionchange", () => request.result.close());
        resolve(request.result);
      }, { once: true });
      request.addEventListener("error", () => {
        this.databasePromise = null;
        reject(request.error || new Error("Could not open LLM AI storage"));
      }, { once: true });
      request.addEventListener("blocked", () => {
        this.databasePromise = null;
        reject(new Error("LLM AI storage upgrade is blocked by another open tab"));
      }, { once: true });
    });
    return this.databasePromise;
  }

  async transaction(storeNames, mode, callback) {
    const database = await this.database();
    const transaction = database.transaction(storeNames, mode);
    const result = await callback(transaction);
    await transactionDone(transaction);
    return result;
  }

  async listProfiles() {
    const values = await this.transaction(["profiles"], "readonly", (transaction) =>
      requestResult(transaction.objectStore("profiles").getAll()));
    return values.sort((a, b) => a.name.localeCompare(b.name)).map(clone);
  }

  async getProfile(id) {
    const value = await this.transaction(["profiles"], "readonly", (transaction) =>
      requestResult(transaction.objectStore("profiles").get(id)));
    return clone(value ?? null);
  }

  async saveProfile(input, options) {
    const existing = input.id ? await this.getProfile(input.id) : null;
    const profile = createLlmAiProfile({ ...existing, ...input }, options);
    await this.transaction(["profiles"], "readwrite", (transaction) =>
      requestResult(transaction.objectStore("profiles").put(profile)));
    return clone(profile);
  }

  async deleteProfile(id) {
    await this.transaction(["profiles"], "readwrite", (transaction) =>
      requestResult(transaction.objectStore("profiles").delete(id)));
  }

  async createSession(session) {
    if (!session?.id || !session?.profileId) throw new TypeError("Session ID and profile ID are required");
    await this.transaction(["sessions"], "readwrite", (transaction) =>
      requestResult(transaction.objectStore("sessions").add(clone(session))));
    return clone(session);
  }

  async updateSession(id, patch) {
    return this.transaction(["sessions"], "readwrite", async (transaction) => {
      const store = transaction.objectStore("sessions");
      const current = await requestResult(store.get(id));
      if (!current) throw new Error(`Unknown LLM AI session ${id}`);
      const next = { ...current, ...clone(patch), id, updatedAt: Date.now() };
      await requestResult(store.put(next));
      return clone(next);
    });
  }

  async getSession(id) {
    const value = await this.transaction(["sessions"], "readonly", (transaction) =>
      requestResult(transaction.objectStore("sessions").get(id)));
    return clone(value ?? null);
  }

  async listSessions({ profileId = null, limit = 200 } = {}) {
    const values = await this.transaction(["sessions"], "readonly", (transaction) => {
      const store = transaction.objectStore("sessions");
      return requestResult(profileId ? store.index("profileId").getAll(profileId) : store.getAll());
    });
    return values.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit).map(clone);
  }

  async appendEvent(event) {
    if (!event?.sessionId || !Number.isInteger(event?.sequence)) {
      throw new TypeError("Session event requires sessionId and integer sequence");
    }
    await this.transaction(["events"], "readwrite", (transaction) =>
      requestResult(transaction.objectStore("events").add(clone(event))));
    return clone(event);
  }

  async listEvents(sessionId) {
    const values = await this.transaction(["events"], "readonly", (transaction) =>
      requestResult(transaction.objectStore("events").index("sessionId").getAll(sessionId)));
    return values.sort((a, b) => a.sequence - b.sequence).map(clone);
  }

  async deleteSession(sessionId) {
    await this.transaction(["sessions", "events"], "readwrite", async (transaction) => {
      await requestResult(transaction.objectStore("sessions").delete(sessionId));
      const events = transaction.objectStore("events").index("sessionId");
      await new Promise((resolve, reject) => {
        const cursorRequest = events.openKeyCursor(IDBKeyRange.only(sessionId));
        cursorRequest.addEventListener("error", () => reject(cursorRequest.error), { once: true });
        cursorRequest.addEventListener("success", () => {
          const cursor = cursorRequest.result;
          if (!cursor) { resolve(); return; }
          transaction.objectStore("events").delete(cursor.primaryKey);
          cursor.continue();
        });
      });
    });
  }

  async exportSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Unknown LLM AI session ${sessionId}`);
    const profile = await this.getProfile(session.profileId) || session.profileSnapshot;
    if (!profile) throw new Error("The session profile is unavailable");
    const events = await this.listEvents(sessionId);
    return exportLlmAiSession({ profile, session, events });
  }
}

export class MemoryLlmAiStore {
  constructor() {
    this.profiles = new Map();
    this.sessions = new Map();
    this.events = new Map();
  }

  async listProfiles() { return [...this.profiles.values()].map(clone); }
  async getProfile(id) { return clone(this.profiles.get(id) ?? null); }
  async saveProfile(input, options) {
    const profile = createLlmAiProfile({ ...(this.profiles.get(input.id) || {}), ...input }, options);
    this.profiles.set(profile.id, profile); return clone(profile);
  }
  async deleteProfile(id) { this.profiles.delete(id); }
  async createSession(session) { this.sessions.set(session.id, clone(session)); return clone(session); }
  async updateSession(id, patch) {
    const current = this.sessions.get(id); if (!current) throw new Error(`Unknown LLM AI session ${id}`);
    const next = { ...current, ...clone(patch), id, updatedAt: Date.now() };
    this.sessions.set(id, next); return clone(next);
  }
  async getSession(id) { return clone(this.sessions.get(id) ?? null); }
  async listSessions({ profileId = null, limit = 200 } = {}) {
    return [...this.sessions.values()].filter((session) => !profileId || session.profileId === profileId)
      .sort((a, b) => b.startedAt - a.startedAt).slice(0, limit).map(clone);
  }
  async appendEvent(event) {
    const list = this.events.get(event.sessionId) || []; list.push(clone(event));
    this.events.set(event.sessionId, list); return clone(event);
  }
  async listEvents(sessionId) { return clone(this.events.get(sessionId) || []); }
  async deleteSession(id) { this.sessions.delete(id); this.events.delete(id); }
  async exportSession(id) {
    const session = await this.getSession(id);
    if (!session) throw new Error(`Unknown LLM AI session ${id}`);
    const profile = await this.getProfile(session.profileId) || session.profileSnapshot;
    if (!profile) throw new Error("The session profile is unavailable");
    return exportLlmAiSession({ profile, session, events: await this.listEvents(id) });
  }
}
