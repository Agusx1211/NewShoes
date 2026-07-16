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
  const renderScale = ipadLike
    ? Math.max(1, ENGINE_MIN.width / boxWidth, ENGINE_MIN.height / boxHeight)
    : dpr;
  let width = boxWidth * renderScale;
  let height = boxHeight * renderScale;
  const maxPixels = iosLike || ipadLike
    ? IOS_MAX_DYNAMIC_PIXELS
    : DESKTOP_MAX_DYNAMIC_PIXELS;
  const pixels = width * height;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    width *= scale;
    height *= scale;
  }
  return clampResolution(width, height);
}
