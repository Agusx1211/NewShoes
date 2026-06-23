import { createServer } from "node:http";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotsDir = resolve(webRoot, "artifacts/screenshots");
const realBigPaths = [
  resolve(webRoot, "artifacts/real-assets/INIZH.big"),
  resolve(webRoot, "artifacts/real-assets/Gensec.big"),
];

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/public/index.html" : url.pathname;
  const localPath = normalize(join(webRoot, pathname));

  if (!localPath.startsWith(webRoot)) {
    return null;
  }

  return localPath;
}

const server = createServer(async (request, response) => {
  const localPath = resolveRequestPath(request.url ?? "/");

  if (!localPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(localPath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(localPath)) ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolveListen) => {
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
const url = `http://127.0.0.1:${address.port}/public/index.html`;
const browser = await chromium.launch();
let realAsset = null;

try {
  for (const realBigPath of realBigPaths) {
    try {
      await access(realBigPath);
      realAsset = realBigPath;
      break;
    } catch {
      realAsset = null;
    }
  }
} catch {
  realAsset = null;
}

try {
  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const captures = [];
  await mkdir(screenshotsDir, { recursive: true });

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(url);
    await page.waitForSelector('body[data-validation="pass"]', { timeout: 10000 });
    if (realAsset) {
      const expectedFirstFile = realAsset.endsWith("INIZH.big") ? "data/ini/armor.ini" : "generalsb.sec";
      const expectedIniFirst = realAsset.endsWith("INIZH.big") ? "data/ini/armor.ini: Armor NoArmor" : "no ini: empty";
      await page.setInputFiles("[data-big-file]", realAsset);
      await page.waitForFunction(([expectedFile, expectedIni]) => {
        return document.body.dataset.validation === "pass" &&
          document.querySelector("[data-big-first]")?.textContent === expectedFile &&
          document.querySelector("[data-ini-first]")?.textContent === expectedIni;
      }, [expectedFirstFile, expectedIniFirst]);
    }
    const viewportScreenshotPath = resolve(screenshotsDir, `refpack-harness-${viewport.name}.png`);
    const status = await page.locator("[data-status]").textContent();
    const decoded = await page.locator("[data-output]").textContent();
    await page.screenshot({ path: viewportScreenshotPath, fullPage: true });
    await page.close();
    captures.push({ ...viewport, status, decoded, screenshot: viewportScreenshotPath });
  }

  console.log(JSON.stringify({
    url,
    status: captures[0].status,
    decoded: captures[0].decoded,
    realAsset,
    screenshot: captures[0].screenshot,
    screenshots: captures.map((capture) => capture.screenshot),
  }, null, 2));
} finally {
  await browser.close();
  server.close();
}
