import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./cloudflare/trystero-relay/wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["cloudflare/trystero-relay/*.test.mjs"],
  },
});
