/* Shared archive contract for the launcher, asset worker, and real boot page. */
(() => {
  "use strict";

  const specs = [
    ["INIZH.big", "INIZH.big", "zh"],
    ["EnglishZH.big", "EnglishZH.big", "zh"],
    ["WindowZH.big", "WindowZH.big", "zh"],
    ["MapsZH.big", "MapsZH.big", "zh"],
    ["MusicZH.big", "MusicZH.big", "zh"],
    ["GensecZH.big", "GensecZH.big", "zh"],
    ["TerrainZH.big", "TerrainZH.big", "zh"],
    ["TexturesZH.big", "TexturesZH.big", "zh"],
    ["W3DZH.big", "W3DZH.big", "zh"],
    ["W3DEnglishZH.big", "W3DEnglishZH.big", "zh"],
    ["SpeechZH.big", "SpeechZH.big", "zh"],
    ["SpeechEnglishZH.big", "SpeechEnglishZH.big", "zh"],
    ["AudioZH.big", "AudioZH.big", "zh"],
    ["AudioEnglishZH.big", "AudioEnglishZH.big", "zh"],
    ["ShadersZH.big", "ShadersZH.big", "zh"],
    ["ZZBase_INI.big", "INI.big", "base"],
    ["LooseScripts.big", "LooseScripts.big", "zh"],
    ["ZZBase_English.big", "English.big", "base"],
    ["ZZBase_Window.big", "Window.big", "base"],
    ["ZZBase_Terrain.big", "Terrain.big", "base"],
    ["ZZBase_Textures.big", "Textures.big", "base"],
    ["ZZBase_W3D.big", "W3D.big", "base"],
    ["ZZBase_Shaders.big", "Shaders.big", "base"],
    ["ZZBase_Music.big", "Music.big", "base", "base-generals/Music.big"],
    ["ZZBase_Audio.big", "Audio.big", "base", "base-generals/Audio.big"],
    ["ZZBase_AudioEnglish.big", "AudioEnglish.big", "base", "base-generals/AudioEnglish.big"],
    ["ZZBase_Speech.big", "Speech.big", "base", "base-generals/Speech.big"],
    ["ZZBase_SpeechEnglish.big", "SpeechEnglish.big", "base", "base-generals/SpeechEnglish.big"],
    ["ZZBase_Maps.big", "Maps.big", "base", "base-generals/Maps.big"],
    ["Gensec.big", "Gensec.big", "zh"],
  ].map(([name, sourceName, edition, artifactSourceName = sourceName]) =>
    Object.freeze({ name, sourceName, edition, artifactSourceName }));

  globalThis.ZeroHArchiveSpecs = Object.freeze(specs);
})();
