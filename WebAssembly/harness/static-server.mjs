import { createReadStream } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { hostname as osHostname, networkInterfaces } from "node:os";
import { basename, extname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const serverStartedAt = new Date().toISOString();

// The play page's threaded default needs SharedArrayBuffer, which Chrome only
// grants to cross-origin-isolated pages — and COOP/COEP headers are IGNORED on
// untrustworthy origins (plain http:// over a LAN IP). The harness therefore
// serves the same handler over HTTPS with a long-lived self-signed cert; the
// play page redirects insecure LAN origins here (owner directive 2026-07-10:
// no legacy single-thread fallback). 8443 is the baked default the page falls
// back to when the /__cnc_https_info announcement is unavailable.
export const DEFAULT_HTTPS_PORT = 8443;

// The owner's play URL — always part of the cert SAN set so a cert generated
// on either box covers it.
const OWNER_LAN_IP = "192.168.106.45";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".json", "application/json; charset=utf-8"],
  [".cncdump", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webm", "video/webm"],
]);

const maxDumpUploadBytes = 256 * 1024 * 1024;
const liveCacheExtensions = new Set([".css", ".html", ".js", ".mjs", ".wasm"]);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function commonHeaders(extra = {}) {
  return {
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
    ...extra,
  };
}

function liveAssetCacheHeaders(staticRoot, requestedPath) {
  const relativePath = relative(staticRoot, requestedPath).split(sep).join("/");
  const extension = extname(requestedPath);
  const liveExtension = liveCacheExtensions.has(extension);
  const livePath = relativePath.startsWith("harness/") || /^dist(?:[-_][A-Za-z0-9_-]+)?\//.test(relativePath);
  return livePath && liveExtension
    ? { "cache-control": "no-store" }
    : {};
}

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, commonHeaders({
    "content-type": "text/plain; charset=utf-8",
  }));
  response.end(message);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, commonHeaders({
    "content-type": "application/json; charset=utf-8",
  }));
  response.end(JSON.stringify(payload));
}

async function gitOutput(root, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
      timeout: 2000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trimEnd();
  } catch {
    return null;
  }
}

async function collectBuildInfo(root) {
  const [commit, branch, describe, statusText] = await Promise.all([
    gitOutput(root, ["rev-parse", "HEAD"]),
    gitOutput(root, ["branch", "--show-current"]),
    gitOutput(root, ["describe", "--always", "--dirty", "--tags"]),
    gitOutput(root, ["status", "--short"]),
  ]);
  const status = statusText == null || statusText === ""
    ? []
    : statusText.split("\n").slice(0, 200);
  return {
    schema: "cnc.harness-build-info.v1",
    generatedAt: new Date().toISOString(),
    server: {
      startedAt: serverStartedAt,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    git: {
      available: commit != null,
      commit,
      shortCommit: commit ? commit.slice(0, 12) : null,
      branch: branch || null,
      describe: describe || null,
      dirty: statusText == null ? null : status.length > 0,
      status,
    },
  };
}

function sanitizeUploadName(name) {
  const clean = basename(String(name || "cnc-issue-dump.cncdump.json"))
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  if (!clean) {
    return "cnc-issue-dump.cncdump.json";
  }
  return /\.(json|cncdump)$/i.test(clean) ? clean : `${clean}.cncdump.json`;
}

function readRequestBody(request, maxBytes = maxDumpUploadBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error(`Upload exceeds ${maxBytes} bytes`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function selfSignedSanEntries() {
  const dns = new Set(["localhost"]);
  const host = String(osHostname() || "").toLowerCase().replace(/\.$/, "");
  if (/^[a-z0-9._-]+$/.test(host)) {
    dns.add(host);
    const short = host.split(".")[0];
    if (short) {
      dns.add(short);
      dns.add(`${short}.local`);
    }
  }
  const ips = new Set(["127.0.0.1", "::1", OWNER_LAN_IP]);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal && address.address && !address.address.startsWith("fe80")) {
        ips.add(address.address);
      }
    }
  }
  return { dns: [...dns], ips: [...ips] };
}

// Generate the self-signed HTTPS cert ONCE into a persistent (gitignored)
// directory and reuse it forever after: the browser "proceed anyway"/trust
// decision is per-certificate, so regenerating on every start would re-prompt
// the owner on every restart. 10-year lifetime; SANs cover localhost, this
// box's hostname(s), every non-internal interface address, and the owner's
// play IP. openssl is driven through a -config file (portable across the dev
// box's OpenSSL 3.x and the Mac's LibreSSL, which disagree on -addext).
export async function ensureSelfSignedCert(certDir) {
  const dir = resolve(certDir);
  const certPath = resolve(dir, "cert.pem");
  const keyPath = resolve(dir, "key.pem");
  const [existingCert, existingKey] = await Promise.all([
    readFile(certPath).catch(() => null),
    readFile(keyPath).catch(() => null),
  ]);
  if (existingCert && existingKey) {
    return { cert: existingCert, key: existingKey, certPath, keyPath, generated: false };
  }
  await mkdir(dir, { recursive: true });
  const { dns, ips } = selfSignedSanEntries();
  const configPath = resolve(dir, "san.cnf");
  await writeFile(configPath, [
    "# Generated once by harness/static-server.mjs (ensureSelfSignedCert).",
    "# Delete cert.pem/key.pem to regenerate (the browser must re-trust the",
    "# new cert afterwards).",
    "[req]",
    "distinguished_name = dn",
    "x509_extensions = ext",
    "prompt = no",
    "[dn]",
    "CN = cnc-harness",
    "[ext]",
    "basicConstraints = CA:FALSE",
    "keyUsage = digitalSignature, keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "subjectAltName = @alt",
    "[alt]",
    ...dns.map((name, index) => `DNS.${index + 1} = ${name}`),
    ...ips.map((ip, index) => `IP.${index + 1} = ${ip}`),
    "",
  ].join("\n"));
  await execFileAsync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
    "-keyout", keyPath, "-out", certPath,
    "-days", "3650", "-config", configPath,
  ], { timeout: 30000 });
  await chmod(keyPath, 0o600).catch(() => {});
  const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
  return { cert, key, certPath, keyPath, generated: true };
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (match[1] === "" && match[2] === "")) {
    return false;
  }

  let start;
  let end;
  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return false;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? fileSize - 1 : Number(match[2]);
  }

  if (!Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= fileSize ||
      end < start) {
    return false;
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

export async function startStaticServer({
  root,
  port = 0,
  host = "127.0.0.1",
  issueDumpRoot = null,
  // HTTPS listener (same handler, same headers). null/undefined = no HTTPS —
  // the default, so the harness gates' self-spawned ephemeral localhost
  // servers are untouched. A number (0 = ephemeral) enables it; the cert is
  // generated once into certDir and reused (see ensureSelfSignedCert).
  httpsPort = null,
  certDir = null,
} = {}) {
  if (!root) {
    throw new Error("startStaticServer requires a root directory");
  }

  const staticRoot = resolve(root);
  // Filled once the HTTPS listener is up (it starts before HTTP so the
  // announcement below can never race an incoming request).
  const httpsInfo = { enabled: false, port: null };

  const handleRequest = async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);

      if (request.method === "GET" && pathname === "/__cnc_build_info") {
        sendJson(response, 200, await collectBuildInfo(staticRoot));
        return;
      }

      // Announces where the HTTPS listener lives so the play page can
      // redirect insecure LAN origins to a trustworthy one (SharedArrayBuffer
      // requires it; owner directive: no legacy single-thread fallback).
      if (request.method === "GET" && pathname === "/__cnc_https_info") {
        sendJson(response, 200, {
          schema: "cnc.harness-https-info.v1",
          httpsEnabled: httpsInfo.enabled,
          httpsPort: httpsInfo.port,
          defaultHttpsPort: DEFAULT_HTTPS_PORT,
        });
        return;
      }

      if (request.method === "POST" && pathname === "/__cnc_issue_dump") {
        if (!issueDumpRoot) {
          sendJson(response, 404, { ok: false, error: "issue dump uploads are disabled" });
          return;
        }
        const uploadRoot = resolve(issueDumpRoot);
        await mkdir(uploadRoot, { recursive: true });
        const preferredName = request.headers["x-cnc-dump-name"] ?? requestUrl.searchParams.get("name");
        const filename = sanitizeUploadName(preferredName);
        const targetPath = resolve(uploadRoot, filename);
        if (!isInside(uploadRoot, targetPath)) {
          sendJson(response, 400, { ok: false, error: "invalid dump filename" });
          return;
        }
        const body = await readRequestBody(request);
        await writeFile(targetPath, body);
        sendJson(response, 200, {
          ok: true,
          bytes: body.length,
          filename,
          path: relative(staticRoot, targetPath),
          url: `/artifacts/issue-dumps/${filename}`,
        });
        return;
      }

      const requestedPath = resolve(staticRoot, pathname === "/" ? "index.html" : pathname.slice(1));

      if (!isInside(staticRoot, requestedPath)) {
        sendError(response, 403, "Forbidden");
        return;
      }

      const fileStat = await stat(requestedPath);
      if (!fileStat.isFile()) {
        sendError(response, 404, "Not found");
        return;
      }

      const contentType = contentTypes.get(extname(requestedPath)) ?? "application/octet-stream";
      const lastModified = fileStat.mtime.toUTCString();

      // HEAD support: the play page polls the build's Last-Modified to show
      // a "build updated N min ago" indicator without downloading the wasm.
      if (request.method === "HEAD") {
        response.writeHead(200, commonHeaders({
          "accept-ranges": "bytes",
          ...liveAssetCacheHeaders(staticRoot, requestedPath),
          "content-length": fileStat.size,
          "content-type": contentType,
          "last-modified": lastModified,
        }));
        response.end();
        return;
      }

      const range = parseRangeHeader(request.headers.range, fileStat.size);
      if (range === false) {
        response.writeHead(416, commonHeaders({
          "content-range": `bytes */${fileStat.size}`,
        }));
        response.end();
        return;
      }

      if (range) {
        const length = range.end - range.start + 1;
        response.writeHead(206, commonHeaders({
          "accept-ranges": "bytes",
          ...liveAssetCacheHeaders(staticRoot, requestedPath),
          "content-length": length,
          "content-range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
          "content-type": contentType,
        }));
        createReadStream(requestedPath, { start: range.start, end: range.end }).pipe(response);
        return;
      }

      response.writeHead(200, commonHeaders({
        "accept-ranges": "bytes",
        ...liveAssetCacheHeaders(staticRoot, requestedPath),
        "content-length": fileStat.size,
        "content-type": contentType,
        "last-modified": lastModified,
      }));
      createReadStream(requestedPath).pipe(response);
    } catch (error) {
      if (error?.code === "ENOENT") {
        sendError(response, 404, "Not found");
        return;
      }
      sendError(response, 500, error instanceof Error ? error.message : String(error));
    }
  };

  const listenOn = (candidate, listenPort) => new Promise((resolveListen, rejectListen) => {
    candidate.once("error", rejectListen);
    candidate.listen(listenPort, host, () => {
      candidate.off("error", rejectListen);
      resolveListen();
    });
  });

  const closeOne = (candidate, forceAfterMs) => new Promise((resolveClose, rejectClose) => {
    const forceTimer = setTimeout(() => {
      candidate.closeAllConnections?.();
    }, forceAfterMs);
    forceTimer.unref?.();
    candidate.closeIdleConnections?.();
    candidate.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });

  // HTTPS first (when requested) so httpsInfo is final before HTTP accepts.
  let httpsServer = null;
  let certPath = null;
  if (httpsPort !== null && httpsPort !== undefined) {
    const certState = await ensureSelfSignedCert(certDir ?? resolve(staticRoot, "harness/.certs"));
    certPath = certState.certPath;
    httpsServer = createHttpsServer({ cert: certState.cert, key: certState.key }, handleRequest);
    await listenOn(httpsServer, httpsPort);
    const httpsAddress = httpsServer.address();
    if (!httpsAddress || typeof httpsAddress === "string") {
      throw new Error("Could not determine HTTPS static server address");
    }
    httpsInfo.enabled = true;
    httpsInfo.port = httpsAddress.port;
  }

  const server = createServer(handleRequest);
  await listenOn(server, port);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine static server address");
  }

  return {
    server,
    httpsServer,
    root: staticRoot,
    url: `http://127.0.0.1:${address.port}/`,
    httpsUrl: httpsServer ? `https://127.0.0.1:${httpsInfo.port}/` : null,
    httpsPort: httpsInfo.port,
    certPath,
    close: ({ forceAfterMs = 1000 } = {}) => Promise.all([
      closeOne(server, forceAfterMs),
      httpsServer ? closeOne(httpsServer, forceAfterMs) : Promise.resolve(),
    ]).then(() => undefined),
  };
}
