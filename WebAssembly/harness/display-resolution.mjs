export const ENGINE_MIN = Object.freeze({ width: 800, height: 600 });
export const ENGINE_MAX = Object.freeze({ width: 7680, height: 4320 });

const IOS_MAX_DYNAMIC_PIXELS = 2_400_000;
const DESKTOP_MAX_DYNAMIC_PIXELS = 8_500_000;

export function isIPadLikeNavigator(navigatorLike = {}) {
  const userAgent = String(navigatorLike.userAgent ?? "");
  const platform = String(navigatorLike.platform ?? "");
  const maxTouchPoints = Number(navigatorLike.maxTouchPoints ?? 0);
  return /iPad/.test(userAgent)
    || (platform === "MacIntel" && Number.isFinite(maxTouchPoints) && maxTouchPoints > 1);
}

export function isIOSLikeNavigator(navigatorLike = {}) {
  const userAgent = String(navigatorLike.userAgent ?? "");
  return /iP(ad|hone|od)/.test(userAgent) || isIPadLikeNavigator(navigatorLike);
}

export function clampResolution(width, height) {
  return {
    width: Math.min(ENGINE_MAX.width, Math.max(ENGINE_MIN.width, Math.round(width))),
    height: Math.min(ENGINE_MAX.height, Math.max(ENGINE_MIN.height, Math.round(height))),
  };
}

export function fitResolutionToLimits(width, height, maxPixels) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  const pixelLimit = Number(maxPixels);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
      || !Number.isFinite(pixelLimit)
      || sourceWidth <= 0 || sourceHeight <= 0 || pixelLimit <= 0) {
    return null;
  }

  const minimumScale = Math.max(
    ENGINE_MIN.width / sourceWidth,
    ENGINE_MIN.height / sourceHeight,
  );
  const maximumScale = Math.min(
    ENGINE_MAX.width / sourceWidth,
    ENGINE_MAX.height / sourceHeight,
    Math.sqrt(pixelLimit / (sourceWidth * sourceHeight)),
  );
  // Prefer the source pixel grid, raise it uniformly to the authored minimum
  // when possible, and reduce it uniformly for GPU/engine limits. Extremely
  // narrow or wide boxes can make the minimum and maximum incompatible; the
  // device aspect and hard limits win instead of stretching one axis.
  const scale = minimumScale <= maximumScale
    ? Math.min(maximumScale, Math.max(minimumScale, 1))
    : maximumScale;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function dynamicResolutionForBox({
  cssWidth,
  cssHeight,
  devicePixelRatio = 1,
  iosLike = false,
  ipadLike = false,
} = {}) {
  const boxWidth = Number(cssWidth);
  const boxHeight = Number(cssHeight);
  if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight)
      || boxWidth < 64 || boxHeight < 64) {
    return null;
  }

  const reportedDpr = Number(devicePixelRatio);
  const dpr = Number.isFinite(reportedDpr) && reportedDpr > 0 ? reportedDpr : 1;
  // iPad Safari has a much tighter per-tab/GPU budget than desktop browsers.
  // Its CSS pixel grid is already a useful game resolution (roughly
  // 1024x768..1366x1024), while applying DPR 2 creates several full-size
  // color/depth surfaces for no gameplay benefit. Preserve the box aspect and
  // raise only small/portrait layouts uniformly to the engine-authored minimum.
  const renderScale = ipadLike ? 1 : dpr;
  const width = boxWidth * renderScale;
  const height = boxHeight * renderScale;
  const maxPixels = iosLike || ipadLike
    ? IOS_MAX_DYNAMIC_PIXELS
    : DESKTOP_MAX_DYNAMIC_PIXELS;
  return fitResolutionToLimits(width, height, maxPixels);
}
