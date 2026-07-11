export const DEFAULT_SHADER_TIER = "ps11";

export function normalizeShaderTier(value) {
  if (value === "ps11" || value === 1 || value === true) {
    return "ps11";
  }
  if (value === "ff" || value === 0 || value === false) {
    return "ff";
  }
  return null;
}

export function resolveShaderTier({ forcedTier, search = "", storedTier } = {}) {
  const forced = normalizeShaderTier(forcedTier);
  if (forced) {
    return { tier: forced, source: "forced" };
  }

  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(search);
  const fromUrl = normalizeShaderTier(params.get("shaderTier"));
  if (fromUrl) {
    return { tier: fromUrl, source: "url" };
  }

  const stored = normalizeShaderTier(storedTier);
  if (stored) {
    return { tier: stored, source: "localStorage" };
  }

  return { tier: DEFAULT_SHADER_TIER, source: "default" };
}
