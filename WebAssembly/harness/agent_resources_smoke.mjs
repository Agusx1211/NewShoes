export async function verifyAgentResources(page) {
  const report = await page.evaluate(async () => {
    const root = new URL("../", document.baseURI);
    const specifications = [
      ["llms.txt", "text/plain", "# Project New Shoes"],
      ["project.md", "text/markdown", "## Guidance for web agents"],
      ["robots.txt", "text/plain", "Sitemap: https://newshoes.gg/sitemap.xml"],
      ["sitemap.xml", "application/xml", "<loc>https://newshoes.gg/project.md</loc>"],
    ];
    const resources = [];
    for (const [name, expectedType, marker] of specifications) {
      const response = await fetch(new URL(name, root), { cache: "no-store" });
      const body = await response.text();
      resources.push({
        name,
        ok: response.ok,
        type: response.headers.get("content-type") || "",
        expectedType,
        markerFound: body.includes(marker),
        bytes: new TextEncoder().encode(body).byteLength,
      });
    }
    const structuredText = document.querySelector('script[type="application/ld+json"]')?.textContent || "";
    return {
      help: document.querySelector('link[rel="help"]')?.href || "",
      alternate: document.querySelector('link[rel="alternate"][type="text/markdown"]')?.href || "",
      guide: document.querySelector("[data-agent-guide]")?.href || "",
      structured: JSON.parse(structuredText),
      resources,
    };
  });

  const discoveryTargets = [
    [report.help, "llms.txt"],
    [report.alternate, "project.md"],
    [report.guide, "project.md"],
  ];
  const discoveryInvalid = discoveryTargets.some(([url, name]) => {
    try {
      return !new URL(url).pathname.endsWith(`/${name}`);
    } catch {
      return true;
    }
  });
  if (discoveryInvalid
      || report.structured?.name !== "Project New Shoes"
      || report.structured?.softwareHelp !== "https://newshoes.gg/project.md"
      || report.resources.some((resource) => !resource.ok
        || !resource.type.startsWith(resource.expectedType)
        || !resource.markerFound
        || resource.bytes < 50)) {
    throw new Error(`Agent discovery/resources failed: ${JSON.stringify(report)}`);
  }
  return report;
}
