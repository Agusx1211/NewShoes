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
]);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

export async function startStaticServer({ root, port = 0 } = {}) {
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

      response.writeHead(200, {
        "content-length": fileStat.size,
        "content-type": contentTypes.get(extname(requestedPath)) ?? "application/octet-stream",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-embedder-policy": "require-corp",
      });
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
    server.listen(port, "127.0.0.1", () => {
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
