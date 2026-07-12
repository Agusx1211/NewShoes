/* Shared archive contract for the launcher, asset worker, and real boot page. */
(() => {
  "use strict";

  const specs = [
    ["INIZH.big", "INIZH.big", "zh", "INIZH.big", ["Data\\INI\\Armor.ini"]],
    ["EnglishZH.big", "EnglishZH.big", "zh"],
    ["WindowZH.big", "WindowZH.big", "zh", "WindowZH.big", ["Window\\ControlBar.wnd"]],
    ["MapsZH.big", "MapsZH.big", "zh", "MapsZH.big", [
      "Maps\\MapCache.ini",
      "Maps\\Alpine Assault\\Alpine Assault.map",
      "Maps\\Alpine Assault\\Alpine Assault.tga",
    ]],
    ["MusicZH.big", "MusicZH.big", "zh"],
    ["GensecZH.big", "GensecZH.big", "zh"],
    ["TerrainZH.big", "TerrainZH.big", "zh", "TerrainZH.big", ["Art\\Terrain\\PTBlossom01.tga"]],
    ["TexturesZH.big", "TexturesZH.big", "zh", "TexturesZH.big", ["Art\\Textures\\sacommandbar.tga"]],
    ["W3DZH.big", "W3DZH.big", "zh", "W3DZH.big", ["Art\\W3D\\ABBarracks_AC.W3D"]],
    ["W3DEnglishZH.big", "W3DEnglishZH.big", "zh"],
    ["SpeechZH.big", "SpeechZH.big", "zh"],
    ["SpeechEnglishZH.big", "SpeechEnglishZH.big", "zh"],
    ["AudioZH.big", "AudioZH.big", "zh"],
    ["AudioEnglishZH.big", "AudioEnglishZH.big", "zh"],
    ["ShadersZH.big", "ShadersZH.big", "zh"],
    ["ZZBase_INI.big", "INI.big", "base", "INI.big", ["Data\\INI\\Armor.ini"]],
    ["LooseScripts.big", "LooseScripts.big", "zh"],
    ["ZZBase_English.big", "English.big", "base"],
    ["ZZBase_Window.big", "Window.big", "base", "Window.big", ["Window\\ControlBar.wnd"]],
    ["ZZBase_Terrain.big", "Terrain.big", "base", "Terrain.big", ["Art\\Terrain\\TLCliff01a.tga"]],
    ["ZZBase_Textures.big", "Textures.big", "base", "Textures.big", ["Art\\Textures\\sncommandbar.tga"]],
    ["ZZBase_W3D.big", "W3D.big", "base", "W3D.big", ["Art\\W3D\\ABArFrcCmd.W3D"]],
    ["ZZBase_Shaders.big", "Shaders.big", "base"],
    ["ZZBase_Music.big", "Music.big", "base", "base-generals/Music.big", ["Data\\Audio\\Tracks\\CHI_01.mp3"]],
    ["ZZBase_Audio.big", "Audio.big", "base", "base-generals/Audio.big"],
    ["ZZBase_AudioEnglish.big", "AudioEnglish.big", "base", "base-generals/AudioEnglish.big"],
    ["ZZBase_Speech.big", "Speech.big", "base", "base-generals/Speech.big"],
    ["ZZBase_SpeechEnglish.big", "SpeechEnglish.big", "base", "base-generals/SpeechEnglish.big"],
    ["ZZBase_Maps.big", "Maps.big", "base", "base-generals/Maps.big", [
      "Maps\\MapCache.ini",
      "Maps\\Alpine Assault\\Alpine Assault.map",
    ]],
    // Original ZH media presents Gensec.big as part of the expansion set,
    // while the Steam installation nests the same required archive under its
    // ZH_Generals base-game directory.
    ["Gensec.big", "Gensec.big", "zh", "Gensec.big", [], ["zh", "base"]],
  ].map(([name, sourceName, edition, artifactSourceName = sourceName,
    requiredEntries = [], acceptedEditions = [edition]]) =>
    Object.freeze({ name, sourceName, edition, artifactSourceName,
      requiredEntries: Object.freeze(requiredEntries),
      acceptedEditions: Object.freeze(acceptedEditions) }));

  globalThis.ZeroHArchiveSpecs = Object.freeze(specs);
})();
