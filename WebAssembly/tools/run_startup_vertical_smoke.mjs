import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wasmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(wasmRoot, 'dist');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function extractJson(stdout, label) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; --index) {
    const line = lines[index].trim();
    if (!line.startsWith('{')) {
      continue;
    }
    try {
      return JSON.parse(lines.slice(index).join('\n'));
    } catch {
      // Keep scanning upward; some verifiers emit pretty JSON with nested
      // object lines before the top-level opening brace.
    }
  }
  fail(`${label} did not emit a JSON result`);
}

function runNodeStep(step, root) {
  const executable = path.join(root, step.file);
  const result = spawnSync(process.execPath, [executable], {
    cwd: wasmRoot,
    encoding: 'utf8',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    fail(`${step.name} failed with exit code ${result.status}`);
  }

  const payload = extractJson(result.stdout, step.name);
  step.validate(payload);
  return {
    name: step.name,
    file: step.file,
    payload,
  };
}

function runSmoke(step) {
  return runNodeStep(step, distRoot);
}

function runSourceCheck(step) {
  return runNodeStep(step, wasmRoot);
}

function expect(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const sourceChecks = [
  {
    name: 'gameengine-startup-order',
    file: 'tools/verify_gameengine_startup_order.mjs',
    validate(payload) {
      expect(payload.ok === true && payload.orderOk === true,
        'GameEngine startup-order verifier did not report ok');
      expect(payload.createGameEngine?.line === 1122,
        'GameEngine startup-order verifier did not prove CreateGameEngine line');
      const byKey = new Map((payload.initOrder ?? []).map(entry => [entry.key, entry]));
      expect(byKey.get('createFileSystem')?.line === 305,
        'GameEngine startup-order verifier did not prove createFileSystem line');
      expect(byKey.get('createAudioManager')?.line === 434,
        'GameEngine startup-order verifier did not prove createAudioManager line');
      expect(payload.factoryMappings?.createAudioManager?.actual === 'MilesAudioManager',
        'GameEngine startup-order verifier did not prove MilesAudioManager factory mapping');
    },
  },
  {
    name: 'w3d-module-factory-frontier',
    file: 'tools/verify_w3d_module_factory_frontier.mjs',
    validate(payload) {
      expect(payload.ok === true, 'W3DModuleFactory frontier verifier did not report ok');
      expect(payload.path === 'w3d-module-factory-frontier',
        'W3DModuleFactory frontier verifier emitted the wrong path');
      expect(payload.factory?.concrete === 'W3DModuleFactory',
        'W3DModuleFactory frontier verifier did not prove the factory concrete');
      expect(payload.factory?.createModuleFactoryLine === 95 && payload.gameEngineCall?.line === 447,
        'W3DModuleFactory frontier verifier did not prove the expected source lines');
      expect(payload.registration?.w3dDrawModules >= 19,
        'W3DModuleFactory frontier verifier did not see the expected W3D draw registrations');
    },
  },
  {
    name: 'gamelogic-new-game-dispatch-frontier',
    file: 'tools/verify_gamelogic_new_game_dispatch_frontier.mjs',
    validate(payload) {
      expect(payload.ok === true, 'GameLogic new-game dispatch frontier verifier did not report ok');
      expect(payload.path === 'gamelogic-new-game-dispatch-frontier',
        'GameLogic new-game dispatch frontier verifier emitted the wrong path');
      expect(payload.commandTransfer?.transfer?.some(entry => entry.label === 'appendMessageList'),
        'GameLogic new-game dispatch frontier did not prove MessageStream to CommandList transfer');
      expect(payload.processCommandList?.dispatch?.some(entry => entry.label === 'dispatch message'),
        'GameLogic new-game dispatch frontier did not prove processCommandList dispatch');
      expect(payload.dispatcher?.playerLookupBeforeNewGame === true,
        'GameLogic new-game dispatch frontier did not prove the player lookup boundary');
      const dispatchLabels = new Set((payload.dispatcher?.newGame ?? []).map(entry => entry.label));
      expect(dispatchLabels.has('prepare new game') && dispatchLabels.has('start new game'),
        'GameLogic new-game dispatch frontier did not prove prepare/start calls');
      expect(payload.startNewGame?.firstCallDefersBeforeTerrainLoad === true,
        'GameLogic new-game dispatch frontier did not prove the first startNewGame deferral');
      expect(payload.currentShellSmokeBoundary?.originalGameLogicCppLinked === false
        && payload.currentShellSmokeBoundary?.originalGameLogicDispatchCppLinked === false,
        'GameLogic new-game dispatch frontier no longer sees the current shell-smoke shim boundary');
      expect(payload.runtimeTargetBoundary?.originalGameLogicCppLinked === true
          && payload.runtimeTargetBoundary?.originalGlobalDataCppLinked === true
          && payload.runtimeTargetBoundary?.originalPlayerListCppLinked === true
          && payload.runtimeTargetBoundary?.originalPlayerCppLinked === true
          && payload.runtimeTargetBoundary?.originalPlayerSupportSourcesLinked === true
          && payload.runtimeTargetBoundary?.originalGlobalDataHeaderPreincluded === true
          && payload.runtimeTargetBoundary?.originalGameLogicDispatchCppLinked === true
          && payload.runtimeTargetBoundary?.originalGameStateCppLinked === true
          && payload.runtimeTargetBoundary?.originalScriptEngineCppLinked === true
          && payload.runtimeTargetBoundary?.originalScriptsCppLinked === true
          && payload.runtimeTargetBoundary?.originalShellCppLinked === true
          && payload.runtimeTargetBoundary?.originalDisplayCppLinked === true,
        'GameLogic new-game dispatch frontier did not prove the focused original runtime target with GlobalData/PlayerList/ScriptEngine/Shell ownership');
      expect(payload.runtimeTargetBoundary?.globalDataWritableSingletonLine > 0
          && payload.runtimeTargetBoundary?.globalDataMacroProofLine > 0
          && payload.runtimeTargetBoundary?.noLocalTheGlobalDataSingleton === true,
        'GameLogic new-game dispatch frontier did not prove original GlobalData singleton ownership');
      expect(payload.runtimeTargetBoundary?.playerListSingletonLine > 0
          && payload.runtimeTargetBoundary?.playerListNeutralPlayerProofLine > 0
          && payload.runtimeTargetBoundary?.noFocusedPlayerLookupWrap === true
          && payload.runtimeTargetBoundary?.noPlayerListSentinel === true,
        'GameLogic new-game dispatch frontier did not prove original PlayerList ownership');
      expect(!(payload.nextRequired ?? []).includes('replace the runtime PlayerList::getNthPlayer linker wrap with real PlayerList/Player ownership'),
        'GameLogic new-game dispatch frontier still reports PlayerList as a remaining runtime shim boundary');
      expect(!(payload.nextRequired ?? []).includes('replace the runtime shim GlobalData bridge with original GlobalData ownership'),
        'GameLogic new-game dispatch frontier still reports GlobalData as a remaining runtime shim boundary');
    },
  },
];

const browserChecks = [
  {
    name: 'startup-browser-frontier',
    file: 'harness/startup_vertical_smoke.mjs',
    validate(payload) {
      expect(payload.ok === true, 'Startup browser frontier smoke did not report ok');
      expect(payload.wasm === 'loaded', 'Startup browser frontier smoke did not load wasm');
      expect(payload.originalEngineStartup?.status === 'missing_runtime_archives',
        'Startup browser frontier smoke reported the wrong original startup status');
      expect(payload.originalEngineStartup?.deviceFactoryFrontier?.firstUnownedInitFactory === 'createAudioManager',
        'Archiveless startup boot should still report createAudioManager as unowned');
      expect(payload.originalEngineStartup?.deviceFactoryFrontier?.firstUnownedInitLine === 434,
        'Archiveless startup boot should still report createAudioManager line 434');
      expect(payload.archiveBackedStartup?.firstUnownedInitFactory === 'createFunctionLexicon',
        'Archive-backed startup boot did not advance the frontier past createAudioManager to createFunctionLexicon');
      expect(payload.archiveBackedStartup?.firstUnownedInitLine === 446,
        'Archive-backed startup boot did not advance the frontier line to 446');
      expect(payload.archiveBackedStartup?.audioManagerRuntime?.ok === true
          && payload.archiveBackedStartup.audioManagerRuntime.status === 'ready',
        'Archive-backed startup boot did not prove original MilesAudioManager runtime ownership');
      expect(payload.archiveBackedStartup.audioManagerRuntime.initRan === true
          && payload.archiveBackedStartup.audioManagerRuntime.music?.alreadyLoaded === true
          && payload.archiveBackedStartup.audioManagerRuntime.teardown?.tornDown === true,
        'Archive-backed startup boot did not prove real init/music/teardown');
      expect(payload.archiveBackedStartup.functionLexiconRuntime?.status === 'base_function_lexicon_game_win_block_input_runtime_owned',
        'Archive-backed startup boot did not report the expected GameWinBlockInput FunctionLexicon frontier');
      expect(payload.archiveBackedStartup.functionLexiconRuntime?.lookups?.popupReplayInput === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.popupReplayInit === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.popupReplayShutdown === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.controlBarInput === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.gameWinBlockInput === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.motdSystem === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.optionsMenuSystem === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.optionsMenuInput === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.optionsMenuInit === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.optionsMenuUpdate === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.optionsMenuShutdown === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.skirmishMapSelectMenuSystem === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.skirmishMapSelectMenuInput === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.skirmishMapSelectMenuInit === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.skirmishMapSelectMenuUpdate === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.skirmishMapSelectMenuShutdown === true,
        'Archive-backed startup boot did not prove PopupReplay modal, ControlBar input, GameWinBlockInput, MOTD, OptionsMenu, and SkirmishMapSelectMenu callback lookups');
      expect(payload.archiveBackedStartup.functionLexiconRuntime?.lookups?.popupReplaySystem === undefined
          && payload.archiveBackedStartup.functionLexiconRuntime?.lookups?.popupReplayUpdate === undefined,
        'Archive-backed startup boot should leave PopupReplay score-screen-dependent callbacks unregistered');
      expect(payload.archiveBackedStartup.moduleFactoryRuntime?.status === 'ready',
        'Archive-backed startup boot did not report the expected W3DModuleFactory runtime frontier');
      expect(payload.archiveBackedStartup.moduleFactoryRuntime?.lookups?.activeBody === true
          && payload.archiveBackedStartup.moduleFactoryRuntime.lookups.destroyDie === true
          && payload.archiveBackedStartup.moduleFactoryRuntime.lookups.beaconClientUpdate === true
          && payload.archiveBackedStartup.moduleFactoryRuntime.lookups.w3dDefaultDraw === true
          && payload.archiveBackedStartup.moduleFactoryRuntime.lookups.w3dModelDraw === true
          && payload.archiveBackedStartup.moduleFactoryRuntime.lookups.w3dPropDraw === true,
        'Archive-backed startup boot did not prove ModuleFactory gameplay/client-update/W3D draw lookups');
      expect(payload.archiveBackedStartup.particleSystemRuntime?.status === 'ready',
        'Archive-backed startup boot did not report the expected W3DParticleSystemManager runtime frontier');
      expect(payload.archiveBackedStartup.particleSystemRuntime?.templateCount > 100
          && payload.archiveBackedStartup.particleSystemRuntime?.templates?.tsingMaTrailSmoke === true
          && payload.archiveBackedStartup.particleSystemRuntime.templates.jetContrailThin === true
          && payload.archiveBackedStartup.particleSystemRuntime.templates.nukeMushroomRing === true,
        'Archive-backed startup boot did not prove ParticleSystem.ini template ownership');
    },
  },
];

const steps = [
  {
    name: 'win32-gameengine-lifetime',
    file: 'win32-gameengine-lifetime-smoke.cjs',
    validate(payload) {
      expect(payload.ok === true, 'Win32GameEngine lifetime smoke did not report ok');
      expect(payload.constructed === true && payload.destructed === true,
        'Win32GameEngine lifetime smoke did not prove construction/destruction');
      expect(payload.source === 'GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp',
        'Win32GameEngine lifetime smoke is not covering the expected original source');
    },
  },
  {
    name: 'win32-gameengine-original-lifetime',
    file: 'win32-gameengine-original-lifetime-smoke.cjs',
    validate(payload) {
      expect(payload.ok === true, 'Original GameEngine lifetime smoke did not report ok');
      expect(payload.path === 'original-gameengine-lifetime',
        'Original GameEngine lifetime smoke emitted the wrong path');
      expect(payload.source === 'GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp',
        'Original GameEngine lifetime smoke is not covering GameEngine.cpp');
      expect(payload.win32Source === 'GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp',
        'Original GameEngine lifetime smoke is not covering Win32GameEngine.cpp');
      expect(payload.supportSources?.includes('GeneralsMD/Code/GameEngine/Source/Common/System/SubsystemInterface.cpp'),
        'Original GameEngine lifetime smoke did not report SubsystemInterface.cpp support');
      expect(payload.supportSources?.includes('GeneralsMD/Code/GameEngine/Source/GameClient/Drawable.cpp'),
        'Original GameEngine lifetime smoke did not report Drawable.cpp support');
      expect(payload.supportSources?.includes('GeneralsMD/Code/GameEngine/Source/Common/RTS/Science.cpp'),
        'Original GameEngine lifetime smoke did not report Science.cpp support');
      expect(payload.supportSources?.includes('GeneralsMD/Code/GameEngine/Source/GameLogic/System/RankInfo.cpp'),
        'Original GameEngine lifetime smoke did not report RankInfo.cpp support');
      expect(payload.fullOriginalGameEngineCppLinked === true,
        'Original GameEngine lifetime smoke did not link full GameEngine.cpp');
      expect(payload.globalTheGameEngineOwned === true && payload.globalTheGameEngineCleared === true,
        'Original GameEngine lifetime smoke did not prove global TheGameEngine ownership/release');
      expect(payload.initAttempted === false,
        'Original GameEngine lifetime smoke should not enter GameEngine::init yet');
      expect(payload.gameResultsEndThreads === 1,
        'Original GameEngine lifetime smoke did not prove GameResultsQueue teardown');
    },
  },
  {
    name: 'miles-audio-open-device',
    file: 'miles-audio-open-device-smoke.cjs',
    validate(payload) {
      expect(payload.ok === true, 'Miles openDevice smoke did not report ok');
      expect(payload.path === 'MilesAudioManager::openDevice',
        'Miles openDevice smoke is not covering MilesAudioManager::openDevice');
      expect(payload.providerHandle > 0, 'Miles openDevice smoke did not allocate a provider handle');
      expect(payload.samples2D > 0 && payload.samples3D > 0 && payload.streams > 0,
        'Miles openDevice smoke did not allocate the expected sample and stream pools');
    },
  },
  {
    name: 'w3d-gamewindow-manager',
    file: 'w3d-gamewindow-manager-smoke.cjs',
    validate(payload) {
      expect(payload.ok === true, 'W3D game-window manager smoke did not report ok');
      expect(payload.library === 'W3DGameWindowManager',
        'W3D game-window manager smoke is not covering W3DGameWindowManager');
      expect(typeof payload.covered === 'string' && payload.covered.includes('GadgetPushButton'),
        'W3D game-window manager smoke did not prove gadget callback ownership');
    },
  },
  {
    name: 'w3d-window-layout-script',
    file: 'w3d-window-layout-script-smoke.cjs',
    validate(payload) {
      expect(payload.ok === true, 'W3D window layout script smoke did not report ok');
      expect(payload.library === 'W3DFunctionLexicon',
        'W3D window layout script smoke is not covering W3DFunctionLexicon');
      expect(payload.path === 'WindowLayout::load->GameWindowManager::winCreateFromScript',
        'W3D window layout script smoke did not cover real WindowLayout load');
      expect(payload.layout === 'Menus/BlankWindow.wnd',
        'W3D window layout script smoke did not load BlankWindow.wnd');
      expect(Array.isArray(payload.archiveLayouts)
        && payload.archiveLayouts.includes('Menus/MessageBox.wnd')
        && payload.archiveLayouts.includes('Menus/QuitMessageBox.wnd')
        && payload.archiveLayouts.includes('Menus/MainMenu.wnd')
        && payload.archiveLayouts.includes('Menus/CreditsMenu.wnd'),
        'W3D window layout script smoke did not load real WindowZH message-box/MainMenu/CreditsMenu layouts');
      expect(Array.isArray(payload.assetArchives)
        && payload.assetArchives.includes('WindowZH.big')
        && payload.assetArchives.includes('INIZH.big'),
        'W3D window layout script smoke did not prove WindowZH/INIZH archive ownership');
      expect(Array.isArray(payload.shellLayouts)
        && payload.shellLayouts.includes('Menus/MainMenu.wnd')
        && payload.shellLayouts.includes('Menus/CreditsMenu.wnd'),
        'W3D window layout script smoke did not prove original Shell::push MainMenu/CreditsMenu ownership');
      expect(Array.isArray(payload.callbackOwners)
        && payload.callbackOwners.includes('MessageBoxSystem')
        && payload.callbackOwners.includes('QuitMessageBoxSystem')
        && payload.callbackOwners.includes('PassMessagesToParentSystem'),
        'W3D window layout script smoke did not prove real message-box callback ownership');
      expect(Array.isArray(payload.shellCallbackNames)
        && payload.shellCallbackNames.includes('W3DMainMenuInit')
        && payload.shellCallbackNames.includes('MainMenuUpdate')
        && payload.shellCallbackNames.includes('MainMenuSystem')
        && payload.shellCallbackNames.includes('MainMenuShutdown')
        && payload.shellCallbackNames.includes('SkirmishGameOptionsMenuInit')
        && payload.shellCallbackNames.includes('SkirmishGameOptionsMenuUpdate')
        && payload.shellCallbackNames.includes('SkirmishGameOptionsMenuShutdown'),
        'W3D window layout script smoke did not prove MainMenu.wnd / SkirmishGameOptionsMenu.wnd callback-name binding');
      expect(Array.isArray(payload.callbackPaths)
        && payload.callbackPaths.includes('W3DMainMenuInit->original MainMenuInit')
        && payload.callbackPaths.includes('MainMenuSystem(GWM_INPUT_FOCUS)')
        && payload.callbackPaths.includes('MainMenuUpdate(first idle frame)')
        && payload.callbackPaths.includes('GadgetPushButton ButtonUSA click->MainMenuSystem faction difficulty transition')
        && payload.callbackPaths.includes('GadgetPushButton ButtonDiffBack click->MainMenuSystem difficulty return')
        && payload.callbackPaths.includes('GadgetPushButton ButtonLoadReplay click->MainMenuSystem dropdown transition')
        && payload.callbackPaths.includes('GadgetPushButton ButtonLoadReplayBack click->MainMenuSystem dropdown return')
        && payload.callbackPaths.includes('MainMenuUpdate shutdownComplete->original SkirmishGameOptionsMenuInit')
        && payload.callbackPaths.includes('GadgetPushButton ButtonBack click->SkirmishGameOptionsMenuSystem pending Shell::pop')
        && payload.callbackPaths.includes('SkirmishGameOptionsMenuShutdown real callback')
        && payload.callbackPaths.includes('SkirmishGameOptionsMenuUpdate shutdownComplete->MainMenu.wnd')
        && payload.callbackPaths.includes('GadgetPushButton ButtonStart click->SkirmishGameOptionsMenuSystem MSG_NEW_GAME')
        && payload.callbackPaths.includes('MessageStream::propagateMessages->CommandList MSG_NEW_GAME')
        && payload.callbackPaths.includes('GadgetPushButton ButtonCredits click->MainMenuSystem pending Shell::push CreditsMenu')
        && payload.callbackPaths.includes('MainMenuUpdate shutdownComplete->original CreditsMenuInit')
        && payload.callbackPaths.includes('CreditsMenuUpdate real callback'),
        'W3D window layout script smoke did not execute original MainMenu/Skirmish/CreditsMenu callback paths');
      expect(typeof payload.covered === 'string' && payload.covered.includes('.wnd parser'),
        'W3D window layout script smoke did not prove parser coverage');
      expect(typeof payload.covered === 'string' && payload.covered.includes('Win32BIGFileSystem WindowZH.big'),
        'W3D window layout script smoke did not prove WindowZH.big archive-backed loading');
      expect(typeof payload.covered === 'string' && payload.covered.includes('Shell::showShell/Shell::push MainMenu.wnd'),
        'W3D window layout script smoke did not prove original Shell::showShell/Shell::push MainMenu ownership');
      expect(typeof payload.covered === 'string' && payload.covered.includes('original MainMenuInit first-run state mutation'),
        'W3D window layout script smoke did not report original MainMenuInit state mutation');
      expect(typeof payload.covered === 'string' && payload.covered.includes('MainMenuSystem input-focus handling'),
        'W3D window layout script smoke did not report original MainMenuSystem input-focus execution');
      expect(typeof payload.covered === 'string' && payload.covered.includes('MainMenuUpdate first idle frame'),
        'W3D window layout script smoke did not report original MainMenuUpdate idle-frame execution');
      expect(typeof payload.covered === 'string' && payload.covered.includes('MessageStream MSG_NEW_GAME argument queueing'),
        'W3D window layout script smoke did not report original Skirmish ButtonStart MSG_NEW_GAME coverage');
      expect(typeof payload.covered === 'string' && payload.covered.includes('MessageStream::propagateMessages handoff to CommandList'),
        'W3D window layout script smoke did not report original MessageStream-to-CommandList handoff coverage');
      expect(typeof payload.covered === 'string' && payload.covered.includes('CreditsManager load from INIZH.big'),
        'W3D window layout script smoke did not report original CreditsManager INI loading');
    },
  },
  {
    name: 'gamelogic-new-game-dispatch',
    file: 'gamelogic-new-game-dispatch-smoke.cjs',
    validate(payload) {
      expect(payload.ok === true, 'GameLogic new-game runtime smoke did not report ok');
      expect(payload.path === 'gamelogic-new-game-dispatch-runtime',
        'GameLogic new-game runtime smoke emitted the wrong path');
      expect(payload.source === 'GeneralsMD original GlobalData.cpp/PlayerList.cpp/Player.cpp/GameLogic.cpp/GameLogicDispatch.cpp/ScriptEngine.cpp',
        'GameLogic new-game runtime smoke did not link the original GlobalData/PlayerList/GameLogic sources');
      expect(payload.message === 'MSG_NEW_GAME' && payload.playerLookupIndex === 0,
        'GameLogic new-game runtime smoke did not process the expected MSG_NEW_GAME player lookup');
      expect(payload.playerCount === 1 && payload.neutralPlayerOwned === true,
        'GameLogic new-game runtime smoke did not prove original PlayerList neutral-player ownership');
      expect(payload.difficulty === 2
          && payload.blankLayoutCreates === 2
          && payload.shellActive === false
          && payload.shellScreenCount === 1
          && payload.shellLayoutShutdowns === 1
          && payload.fpsLimit === 55
          && payload.useFpsLimit === true,
        'GameLogic new-game runtime smoke did not prove prepareNewGame/FPS side effects');
      expect(payload.gameMode === 'GAME_SKIRMISH'
          && payload.loadingMap === true
          && payload.rankPoints === 7
          && payload.mapName === 'Maps\\Smoke\\Skirmish.map'
          && payload.pristineMapName === 'Maps\\Smoke\\Skirmish.map',
        'GameLogic new-game runtime smoke did not prove startNewGame first-call deferral state');
      expect(payload.runtimeBoundaries?.includes('focused in-memory BlankWindow layout adapter')
          && !payload.runtimeBoundaries?.includes('focused linker wrap for PlayerList::getNthPlayer before MSG_NEW_GAME switch')
          && !payload.runtimeBoundaries?.includes('shim GlobalData bridge')
          && !payload.runtimeBoundaries?.includes('focused Shell::hideShell')
          && !payload.runtimeBoundaries?.includes('focused ScriptEngine::setGlobalDifficulty'),
        'GameLogic new-game runtime smoke did not report its focused ownership boundaries');
      expect(payload.originalOwners?.includes('GlobalData TheWritableGlobalData')
          && payload.originalOwners?.includes('PlayerList::getNthPlayer neutral player')
          && payload.originalOwners?.includes('ScriptEngine::setGlobalDifficulty')
          && payload.originalOwners?.includes('Shell::push seeded BlankWindow')
          && payload.originalOwners?.includes('Shell::hideShell'),
        'GameLogic new-game runtime smoke did not report original GlobalData/PlayerList/ScriptEngine/Shell ownership');
    },
  },
];

const sourceResults = sourceChecks.map(runSourceCheck);
const results = steps.map(runSmoke);
const browserResults = browserChecks.map(runSourceCheck);

console.log(JSON.stringify({
  ok: true,
  path: 'startup-vertical',
  covered: [
    'browser wasm original GameEngine.cpp startup frontier',
    'original Win32GameEngine lifetime',
    'original GameEngine.cpp constructor/destructor lifetime with global TheGameEngine ownership',
    'original MilesAudioManager openDevice',
    'browser boot ownership of GameEngine.cpp line 434 createAudioManager: original MilesAudioManager construction, real AudioManager::init() INI loads, isMusicAlreadyLoaded music-archive check, openDevice through the browser MSS shim, and real destructor teardown',
    'original W3DGameWindowManager window and gadget ownership',
    'original WindowLayout .wnd parsing through W3DFunctionLexicon layout-init lookup',
    'real WindowZH.big message-box layout loading with original callback ownership',
    'original Shell::showShell/Shell::push loading MainMenu.wnd from WindowZH.big',
    'original W3DMainMenuInit executing original MainMenuInit first-run state mutation',
    'original MainMenuSystem input-focus handling',
    'original MainMenuUpdate first idle frame under shell GameLogic state',
    'original ButtonUSA faction difficulty transition and ButtonDiffBack return through MainMenuSystem',
    'original ButtonLoadReplay dropdown and ButtonLoadReplayBack return through MainMenuSystem',
    'original ButtonCredits path through Shell::push into CreditsMenuInit/CreditsMenuUpdate with INIZH-backed Credits.ini',
    'browser boot constructs original W3DFunctionLexicon, verifies W3D device callback-name tables, and loads the non-network base GUI widget/input, IME draw, original GameWinBlockInput with the original SelectionTranslator symbol owner linked, original ExtendedMessageBoxSystem, original W3D MOTD system callback, original DifficultySelect system/input/init callbacks, original KeyboardOptionsMenu system/input/init/update/shutdown callbacks with original MetaEvent global ownership, original OptionsMenu system/input/init/update/shutdown callbacks with original OptionPreferences ownership, original SkirmishMapSelectMenu system/input/init/update/shutdown callbacks, original InGamePopupMessage system/input/init callbacks, original IdleWorkerSystem callback, original BeaconWindowInput callback, original ControlBarInput callback, original ReplayControl system/input callbacks, original ChallengeMenu callbacks, original PopupCommunicator callbacks, original MapSelectMenu callbacks, original ReplayMenu callbacks, original PopupReplay modal callbacks, original GameInfoWindowSystem lookup, and original MainMenu/Credits/Skirmish/SinglePlayer shell callback tables while the remaining layout graph remains the FunctionLexicon boundary',
    'browser boot constructs original W3DModuleFactory, runs W3DModuleFactory::init(), and proves public ModuleFactory lookups for representative base gameplay, client-update, and W3D draw modules',
    'browser boot constructs original W3DParticleSystemManager, runs ParticleSystemManager::init() against Data\\INI\\ParticleSystem.ini, and proves shipped particle template lookups through the public manager API',
    'source-pinned original GameLogic MSG_NEW_GAME dispatch frontier after CommandList handoff',
    'runtime original GameLogic::processCommandList dispatch of MSG_NEW_GAME through prepareNewGame, original GlobalData TheWritableGlobalData, original PlayerList::getNthPlayer neutral-player ownership, original ScriptEngine::setGlobalDifficulty, original Shell::hideShell, and first-call startNewGame(FALSE) deferral',
  ],
  nextRequired: [
    'replace the remaining base FunctionLexicon layout/HUD callback registrations, including PopupReplay score-screen-dependent System/Update and broader ControlBarSystem/LeftHUDInput callbacks, so GameEngine.cpp line 446 can become fully runtime-owned',
    'advance the next vertical startup path outside the already-proven shell menu slice',
    'advance the post-particle startup data stores toward createThingFactory once createFunctionLexicon is fully owned',
    'supply base Generals Window.big and replace the focused runtime in-memory BlankWindow adapter before continuing deferred startNewGame into terrain/player/script load',
  ],
  sourceChecks: sourceResults.map(result => result.name),
  browserChecks: browserResults.map(result => result.name),
  smokes: results.map(result => result.name),
}));
