import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".wasm", "application/wasm"],
  [".webm", "video/webm"],
]);

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

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, commonHeaders({
    "content-type": "text/plain; charset=utf-8",
  }));
  response.end(message);
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

export async function startStaticServer({ root, port = 0, host = "127.0.0.1" } = {}) {
  if (!root) {
    throw new Error("startStaticServer requires a root directory");
  }

  const staticRoot = resolve(root);

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
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
          "content-length": length,
          "content-range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
          "content-type": contentType,
        }));
        createReadStream(requestedPath, { start: range.start, end: range.end }).pipe(response);
        return;
      }

      response.writeHead(200, commonHeaders({
        "accept-ranges": "bytes",
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
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine static server address");
  }

  return {
    server,
    root: staticRoot,
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
  };
}
