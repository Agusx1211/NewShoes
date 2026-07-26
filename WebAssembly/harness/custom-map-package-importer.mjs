function defaultWorkerFactory() {
  return new Worker(new URL("./custom-map-package-worker.mjs", import.meta.url), { type: "module" });
}

export class CustomMapPackageImporter {
  constructor({ workerFactory = defaultWorkerFactory, onProgress = () => {} } = {}) {
    this.workerFactory = workerFactory;
    this.onProgress = onProgress;
    this.worker = null;
    this.pending = new Map();
  }

  #ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.addEventListener("message", (event) => {
      const message = event.data ?? {};
      if (message.kind === "progress") {
        this.onProgress(message);
        return;
      }
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "Map import failed"));
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Map package worker failed");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  importFiles(files) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return Promise.reject(new Error("Choose a map archive or folder first"));
    const requestId = crypto.randomUUID();
    const worker = this.#ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        worker.postMessage({ command: "import", requestId, files: selected });
      } catch (error) {
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(new Error("Map importer closed"));
    this.pending.clear();
  }
}
