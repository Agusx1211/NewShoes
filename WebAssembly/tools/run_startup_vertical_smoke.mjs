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
      expect(payload.createGameEngine?.line === 1125,
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
      expect(payload.runtimeTargetBoundary?.bridgeBuffer?.smokeDeferralHookLine > 0
          && payload.runtimeTargetBoundary.bridgeBuffer.installLine > 0
          && payload.runtimeTargetBoundary.bridgeBuffer.loadBridgesProofLine > 0
          && payload.runtimeTargetBoundary?.bridgeLikeMapObjects?.scanFunctionLine > 0
          && payload.runtimeTargetBoundary.bridgeLikeMapObjects.classificationLine > 0
          && payload.runtimeTargetBoundary.bridgeLikeMapObjects.scanCallLine > 0
          && payload.runtimeTargetBoundary.bridgeLikeMapObjects.noCandidateProofLine > 0
          && payload.runtimeTargetBoundary.bridgeLikeMapObjects.radarRefreshTerrainLine > 0
          && payload.runtimeTargetBoundary?.pathfinder?.newMapLine > 0
          && payload.runtimeTargetBoundary.pathfinder.gridProofLine > 0,
        'GameLogic new-game dispatch frontier did not prove startup W3DBridgeBuffer, bridge-like scan, Radar::refreshTerrain, and Pathfinder::newMap ownership');
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
      expect(payload.archiveBackedStartup.functionLexiconRuntime?.status === 'base_function_lexicon_remaining_callback_groups_deferred',
        'Archive-backed startup boot did not report the expected remaining FunctionLexicon callback frontier');
      expect(payload.archiveBackedStartup.functionLexiconRuntime?.missingCallbackGroupCount === 13
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups?.saveLoadMenu === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.quitMenu === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.popupReplayScoreState === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.scoreScreen === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.controlBarCommandHud === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.generalsExpPoints === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.lanMenus === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.inGameNetworkMenus === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.hostJoinNetworkPopups === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.onlineOverlayAndBattleHonors === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.wolShellMenus === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.networkDirectConnect === true
          && payload.archiveBackedStartup.functionLexiconRuntime.missingCallbackGroups.downloadMenu === true,
        'Archive-backed startup boot did not report the expected missing FunctionLexicon owner groups');
      expect(payload.archiveBackedStartup.functionLexiconRuntime?.lookups?.popupReplayInput === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.popupReplayInit === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.popupReplayShutdown === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.controlBarInput === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.controlBarObserverSystem === true
          && payload.archiveBackedStartup.functionLexiconRuntime.lookups.gameInfoWindowInit === true
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
        'Archive-backed startup boot did not prove PopupReplay modal, ControlBar input, ControlBarObserver, GameWinBlockInput, MOTD, OptionsMenu, and SkirmishMapSelectMenu callback lookups');
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
      expect(payload.archiveBackedStartup.objectIniRuntime?.ok === true
          && payload.archiveBackedStartup.objectIniRuntime.stage === 'done'
          && payload.archiveBackedStartup.objectIniRuntime.objectIniFileCount === 43
          && payload.archiveBackedStartup.objectIniRuntime.objectIniFilesLoaded === 43
          && payload.archiveBackedStartup.objectIniRuntime.templateCount >= 1800
          && payload.archiveBackedStartup.objectIniRuntime.thingFactoryIsW3D === true
          && payload.archiveBackedStartup.objectIniRuntime.hasW3DModelDraw === true
          && payload.archiveBackedStartup.objectIniRuntime.hasDestroyDie === true
          && payload.archiveBackedStartup.objectIniRuntime.hasAIUpdateInterface === true
          && payload.archiveBackedStartup.objectIniRuntime.lookups?.some((entry) =>
            entry.name === 'AmericaVehicleHumvee'
            && entry.found === true
            && entry.side === 'America'
            && entry.buildCost === 700
            && entry.isVehicle === true
            && entry.isSelectable === true)
          && payload.archiveBackedStartup.objectIniRuntime.lookups?.some((entry) =>
            entry.name === 'GLAInfantryRebel'
            && entry.found === true
            && entry.side === 'GLA'
            && entry.buildCost === 150
            && entry.isInfantry === true
            && entry.isSelectable === true),
        'Archive-backed startup boot did not prove W3DThingFactory object-template ownership');
      expect(payload.realEngineInit?.initReturned === true,
        'Real GameEngine::init() lifecycle run did not complete');
      expect(payload.realEngineInit?.subsystemCompletedCount === 43,
        'Real GameEngine::init() did not complete all 43 subsystems');
      expect(payload.realEngineInit?.quittingAfterInit === false,
        'Real GameEngine::init() set quitting');
      expect(payload.realEngineInit?.framesCompleted >= 5,
        'Real GameEngine::update() frames did not complete');
      expect(payload.realEngineInit?.keyboard?.down?.ready === true
          && payload.realEngineInit.keyboard.down.pendingDInputKeys === 0
          && payload.realEngineInit.keyboard.down.eventCount >= 1
          && payload.realEngineInit.keyboard.down.firstKey === 0x1e
          && (payload.realEngineInit.keyboard.down.firstState & 0x0002) !== 0,
        'Real lifecycle keyboard keydown did not reach original DirectInputKeyboard');
      expect(payload.realEngineInit?.keyboard?.up?.ready === true
          && payload.realEngineInit.keyboard.up.pendingDInputKeys === 0
          && payload.realEngineInit.keyboard.up.eventCount >= 1
          && payload.realEngineInit.keyboard.up.firstKey === 0x1e
          && (payload.realEngineInit.keyboard.up.firstState & 0x0001) !== 0,
        'Real lifecycle keyboard keyup did not reach original DirectInputKeyboard');
      const singlePlayerMenu =
        payload.realEngineInit?.menuClick?.singlePlayer?.clientState?.mainMenu;
      expect(payload.realEngineInit?.menuClick?.singlePlayer?.clientState?.transition?.finished === true
          && singlePlayerMenu?.underButtonUSACenter?.window?.id === singlePlayerMenu?.buttonUSA?.id,
        'Real Single Player menu transition did not align ButtonUSA hit-testing with the rendered menu state');
      const difficultyMenu = payload.realEngineInit?.menuClick?.clientState?.mainMenu;
      expect(payload.realEngineInit?.menuClick?.clientState?.transition?.finished === true
          && difficultyMenu?.mapBorderDifficulty?.managerHidden === false
          && difficultyMenu?.staticTextSelectDifficulty?.managerHidden === false
          && difficultyMenu?.underButtonEasyCenter?.window?.id === difficultyMenu?.buttonEasy?.id,
        'Real ButtonUSA transition did not align difficulty-control hit-testing with the rendered menu state');
      const campaignStartDebug =
        payload.realEngineInit?.campaignStart?.clientState?.mainMenu?.debug;
      expect(payload.realEngineInit?.campaignStart?.target?.decoratedName === 'MainMenu.wnd:ButtonEasy'
          && campaignStartDebug?.lastCDPresent === 1
          && campaignStartDebug?.lastPrepareDifficulty === 0
          && campaignStartDebug?.lastSetupDifficulty === 0
          && campaignStartDebug?.lastPendingFile?.length > 0
          && campaignStartDebug.lastPendingFile === campaignStartDebug.lastSetupMap
          && campaignStartDebug?.lastNewGameMode === 0
          && campaignStartDebug?.lastNewGameDifficulty === 0
          && campaignStartDebug?.doGameStartCount > 0,
        'Real ButtonEasy click did not reach original campaign setup and MSG_NEW_GAME queueing',
        payload.realEngineInit?.campaignStart);
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
      expect(typeof payload.source === 'string'
          && payload.source.includes('GlobalData.cpp/INI.cpp/INIGameData.cpp/INIAiData.cpp/INIMultiplayer.cpp/UserPreferences.cpp/MultiplayerSettings.cpp/Science.cpp/PlayerTemplate.cpp/FunctionLexicon.cpp/PlayerList.cpp/Player.cpp/AI.cpp/AIPathfind.cpp/AIPlayer.cpp/GhostObject.cpp/Weapon.cpp/GameLogic.cpp/GameLogicDispatch.cpp')
          && payload.source.includes('GameState.cpp/TerrainTypes.cpp/Radar.cpp/PartitionManager.cpp/ScriptEngine.cpp')
          && payload.source.includes('GameWindowManagerScript.cpp/HeaderTemplate.cpp')
          && payload.source.includes('TerrainRoads.cpp/TerrainLogic.cpp/W3DTerrainLogic.cpp/WorldHeightMap.cpp/TerrainVisual.cpp/SidesList.cpp/ThingFactory.cpp'),
        'GameLogic new-game runtime smoke did not link the original GlobalData/INI/AI/PlayerList/GameLogic/Radar/Partition/WindowLayout/Terrain parser sources');
      expect(payload.message === 'MSG_NEW_GAME' && payload.playerLookupIndex === 0,
        'GameLogic new-game runtime smoke did not process the expected MSG_NEW_GAME player lookup');
      expect(payload.playerCount === 11
          && payload.populatedPlayerCount === payload.validatedSides
          && payload.validatedSides === 11
          && payload.neutralPlayerOwned === true
          && payload.localPlayerIndex === 2
          && payload.localPlayerSide === 'GLA'
          && payload.localDefaultTeam === 'teamThePlayer'
          && payload.neutralDefaultTeam === 'team',
        'GameLogic new-game runtime smoke did not prove original PlayerList/TeamFactory side population');
      expect(payload.difficulty === 2
          && payload.blankLayoutCreates === 2
          && payload.shellActive === false
          && payload.shellScreenCount === 1
          && payload.shellLayoutShutdowns === 0
          && payload.fpsLimit === 55
          && payload.useFpsLimit === true,
        'GameLogic new-game runtime smoke did not prove prepareNewGame/FPS side effects');
      expect(payload.blankLayoutArchive === 'artifacts/real-assets/Window.big'
          && payload.blankWindowArchiveLoaded === true
          && payload.blankWindowFileExists === true
          && payload.seedBlankWindowArchiveLayout === true
          && payload.prepareBlankWindowArchiveLayout === true
          && payload.blankWindowRoot === 'BlankWindow.wnd:BlankWindow'
          && payload.blankWindowRootGeometry?.x === 0
          && payload.blankWindowRootGeometry?.y === 0
          && payload.blankWindowRootGeometry?.width === 800
          && payload.blankWindowRootGeometry?.height === 600,
        'GameLogic new-game runtime smoke did not prove archive-backed BlankWindow.wnd loading');
      expect(payload.gameMode === 'GAME_SKIRMISH'
          && payload.loadingMap === true
          && payload.rankPoints === 7
          && payload.mapName === 'Maps\\MD_GLA03\\MD_GLA03.map'
          && payload.pristineMapName === 'Maps\\MD_GLA03\\MD_GLA03.map',
        'GameLogic new-game runtime smoke did not prove startNewGame first-call deferral state');
      expect(payload.mapArchive === 'artifacts/real-assets/MapsZH.big'
          && payload.mapArchiveLoaded === true
          && payload.mapFileExists === true
          && payload.zhIniArchive === 'artifacts/real-assets/INIZH.big'
          && payload.zhIniArchiveLoaded === true
          && payload.baseIniArchive === 'artifacts/real-assets/INI.big'
          && payload.baseIniArchiveLoaded === true
          && payload.playerTemplateDefaultIniFileExists === true
          && payload.playerTemplateIniFileExists === true
          && payload.gameDataDefaultIniFileExists === true
          && payload.gameDataIniFileExists === true
          && payload.multiplayerDefaultIniFileExists === true
          && payload.multiplayerIniFileExists === true
          && payload.aiDataDefaultIniFileExists === true
          && payload.aiDataIniFileExists === true
          && payload.startupPlayerTemplateCount === 15
          && payload.startupMultiplayerColorCount === 8
          && payload.startupPartitionCellSize === 40
          && payload.startupAiTeamSeconds === 10
          && payload.terrainLoadMap === 'Maps\\MD_GLA03\\MD_GLA03.map'
          && payload.terrainLoadReturned === true
          && payload.terrainSourceFilename === 'Maps\\MD_GLA03\\MD_GLA03.map'
          && payload.terrainVisualLoadCalled === true
          && payload.terrainVisualLoadCalls === 1
          && payload.terrainVisualLoadPath === 'Maps\\MD_GLA03\\MD_GLA03.map'
          && payload.terrainMapObjects > 0
          && payload.terrainWaypoints > 0
          && payload.terrainRoadPoint1Objects > 0
          && payload.terrainRoadPoint2Objects === payload.terrainRoadPoint1Objects
          && payload.terrainBridgePoint1Objects === 0
          && payload.terrainBridgePoint2Objects === payload.terrainBridgePoint1Objects
          && payload.terrainSides === 11
          && payload.terrainTeams === 97
          && payload.terrainSideScriptsBeforeNewMap === 465
          && payload.sidesValidateModified === false
          && payload.validatedTeams === 97
          && payload.sideScriptsBeforeScriptNewMap === 465
          && payload.sideScriptsAfterScriptNewMap === 465
          && payload.radarLeftHudWindowInstalled === true
          && payload.radarWindowLookupCount === 1
          && payload.radarWindowOwned === true
          && payload.radarExtent?.hiX === 3800
          && payload.radarExtent?.hiY === 3800
          && payload.radarXSample > 29
          && payload.radarXSample < 30
          && payload.radarYSample > 29
          && payload.radarYSample < 30
          && payload.radarToWorldCenterOk === true
          && payload.worldToRadarCenterOk === true
          && payload.radarCenterWorld?.x === 1900
          && payload.radarCenterWorld?.y === 1900
          && payload.terrainCenterRadar?.x === 64
          && payload.terrainCenterRadar?.y === 64
          && payload.victoryCachePlayerPtrsCalls === 1
          && payload.victoryConditions === 1
          && payload.gameLogicWidthBeforePartition === 0
          && payload.gameLogicHeightBeforePartition === 0
          && payload.gameLogicWidthAfterPartition === 3800
          && payload.gameLogicHeightAfterPartition === 3800
          && payload.partitionCellSize === 40
          && payload.expectedPartitionCellCountX === payload.partitionCellCountX
          && payload.expectedPartitionCellCountY === payload.partitionCellCountY
          && payload.partitionCellCountX === 96
          && payload.partitionCellCountY === 96
          && payload.partitionTotalCells === 9216
          && payload.displayClearShroudCalls === 1
          && payload.radarClearShroudCalls === 1
          && payload.displaySetShroudCalls === payload.partitionTotalCells
          && payload.radarSetShroudCalls === payload.partitionTotalCells
          && payload.displayShroudedSetCalls === payload.partitionTotalCells
          && payload.radarShroudedSetCalls === payload.partitionTotalCells
          && payload.displayFoggedSetCalls === 0
          && payload.radarFoggedSetCalls === 0
          && payload.displayClearSetCalls === 0
          && payload.radarClearSetCalls === 0
          && payload.ghostObjectManagerOwned === true
          && payload.ghostLocalPlayerIndexBefore === 0
          && payload.ghostLocalPlayerIndexAfterSet === payload.localPlayerIndex
          && payload.ghostResetCalled === true
          && payload.terrainRoadCollectionOwned === true
          && payload.terrainTypeCollectionOwned === true
          && payload.terrainRenderMapOpened === true
          && payload.terrainRenderMapLoaded === true
          && payload.terrainRenderObjectOwned === true
          && payload.terrainRenderMapAttached === true
          && payload.terrainRenderMapWidth === 480
          && payload.terrainRenderMapHeight === 480
          && payload.terrainRoadBufferInstalled === true
          && payload.terrainRoadBufferInitialized === true
          && payload.terrainRoadBufferMapAttached === true
          && payload.terrainRoadSegmentCapacity === 0
          && payload.terrainRoadSegmentsAfterNewMap >= payload.terrainRoadSegmentsBeforeNewMap
          && payload.terrainRoadBufferUpdateBuffers === true
          && payload.terrainBridgeBufferInstalled === true
          && payload.terrainBridgeBufferInitialized === true
          && payload.terrainBridgeBufferBridgesBeforeNewMap === 0
          && payload.terrainBridgeBufferBridgesAfterNewMap === payload.terrainBridgePoint1Objects
          && payload.terrainBridgeBufferVerticesAfterNewMap === 0
          && payload.terrainBridgeBufferIndicesAfterNewMap === 0
          && payload.terrainLogicBridgesBeforeNewMap === 0
          && payload.terrainLogicBridgesAfterNewMap === payload.terrainBridgePoint1Objects
          && payload.terrainBridgeDamageStatesChangedBeforeNewMap === false
          && payload.terrainBridgeDamageStatesChangedAfterNewMap === true
          && payload.terrainNewMapCalled === true
          && payload.terrainWaterGridCallsAfterNewMap === payload.terrainWaterGridCallsBeforeNewMap + 1
          && payload.terrainWaterGridLastEnable === payload.terrainWaveGuideWaypointPresent
          && Math.abs(payload.terrainFirstWaypointZAfterNewMap - payload.terrainFirstWaypointGroundHeightAfterNewMap) < 0.001
          && payload.terrainTimeOfDayNotified === true
          && payload.terrainExtent?.hiX === 3800
          && payload.terrainExtent?.hiY === 3800
          && payload.bridgeLikeMapObjectDefaultTemplateAvailable === false
          && payload.bridgeLikeMapObjectScanCalled === true
          && payload.bridgeLikeMapObjectsScanned === payload.terrainMapObjects
          && payload.bridgeLikeMapObjectsSkippedSpecialTerrainObjects === payload.bridgeLikeMapObjectsSpecialFlagExpected
          && payload.bridgeLikeMapObjectsSpecialFlagExpected === payload.terrainRoadPoint1Objects + payload.terrainRoadPoint2Objects + payload.terrainBridgePoint1Objects + payload.terrainBridgePoint2Objects
          && payload.bridgeLikeMapObjectsWithoutThingTemplate === payload.terrainMapObjects - payload.bridgeLikeMapObjectsSkippedSpecialTerrainObjects
          && payload.bridgeLikeMapObjectsNonBridgeLikeTemplates === 0
          && payload.bridgeLikeMapObjectBridgeTemplates === 0
          && payload.bridgeLikeMapObjectWalkOnWallTemplates === 0
          && payload.bridgeLikeMapObjectCandidates === 0
          && payload.bridgeLikeMapObjectScanAccounted === payload.bridgeLikeMapObjectsScanned
          && payload.bridgeLikeMapObjectCreationDeferred === true
          && payload.radarRefreshTerrainCallsAfterBridgeScan === payload.radarRefreshTerrainCallsBeforeBridgeScan + 1
          && payload.radarRefreshTerrainAfterBridgeScan === true
          && payload.pathfinderOwned === true
          && payload.pathfinderNewMapCalled === true
          && payload.pathfinderNewMapOrderedAfterBridgeScan === true
          && payload.pathfinderExpectedExtentX > 0
          && payload.pathfinderExpectedExtentY > 0
          && payload.pathfinderExtentXAfterNewMap === payload.pathfinderExpectedExtentX
          && payload.pathfinderExtentYAfterNewMap === payload.pathfinderExpectedExtentY
          && payload.pathfinderCenterGroundCellReady === true,
        'GameLogic new-game runtime smoke did not prove original W3DTerrainLogic/INI/player/script/Radar/Partition/GhostObject/W3DBridgeBuffer/bridge-like-scan/Pathfinder MD_GLA03 load ownership');
      expect(payload.runtimeBoundaries?.includes('InGameUI client-quiet remains focused UI boundary')
          && payload.runtimeBoundaries?.includes('OptionPreferences user preference getters remain focused non-network browser preference boundary')
          && payload.runtimeBoundaries?.includes('bridge-like map-object creation remains focused ThingFactory/Object ownership boundary after ordered no-candidate startup scan')
          && !payload.runtimeBoundaries?.includes('focused in-memory BlankWindow layout adapter')
          && !payload.runtimeBoundaries?.includes('focused linker wrap for PlayerList::getNthPlayer before MSG_NEW_GAME switch')
          && !payload.runtimeBoundaries?.includes('deferred terrain/player/script load after archive-backed BlankWindow')
          && !payload.runtimeBoundaries?.includes('shim GlobalData bridge')
          && !payload.runtimeBoundaries?.includes('focused Shell::hideShell')
          && !payload.runtimeBoundaries?.includes('focused ScriptEngine::setGlobalDifficulty'),
        'GameLogic new-game runtime smoke did not report its focused ownership boundaries');
      expect(payload.originalOwners?.includes('GlobalData TheWritableGlobalData')
          && payload.originalOwners?.includes('PlayerList::getNthPlayer neutral player')
          && payload.originalOwners?.includes('ScriptEngine::setGlobalDifficulty')
          && payload.originalOwners?.includes('HeaderTemplateManager empty template lookup')
          && payload.originalOwners?.includes('Shell::push seeded BlankWindow')
          && payload.originalOwners?.includes('GameWindowManager::winCreateLayout BlankWindow archive parse')
          && payload.originalOwners?.includes('Shell::hideShell')
          && payload.originalOwners?.includes('Win32BIGFileSystem MapsZH.big map archive')
          && payload.originalOwners?.includes('Win32BIGFileSystem INIZH.big and INI.big startup data archives')
          && payload.originalOwners?.includes('INI::load Default/GameData.ini, GameData.ini, Multiplayer.ini, Science.ini, AIData.ini, and PlayerTemplate.ini')
          && payload.originalOwners?.includes('GlobalData::parseGameDataDefinition production partition cell size')
          && payload.originalOwners?.includes('WeaponBonusSet::parseWeaponBonusSetPtr GameData parser')
          && payload.originalOwners?.includes('MultiplayerSettings shipped color table')
          && payload.originalOwners?.includes('ScienceStore shipped science table')
          && payload.originalOwners?.includes('AI shipped AIData table')
          && payload.originalOwners?.includes('PlayerTemplateStore shipped player templates')
          && payload.originalOwners?.includes('W3DTerrainLogic::loadMap(false) MD_GLA03 map parse')
          && payload.originalOwners?.includes('TerrainLogic::loadMap TerrainVisual::load handoff')
          && payload.originalOwners?.includes('WorldHeightMap logical map-object list')
          && payload.originalOwners?.includes('SidesList::ParseSidesDataChunk')
          && payload.originalOwners?.includes('SidesList::validateSides')
          && payload.originalOwners?.includes('AIPlayer construction for non-human sides')
          && payload.originalOwners?.includes('TeamFactory::reset/initFromSides')
          && payload.originalOwners?.includes('PlayerList::newGame side population')
          && payload.originalOwners?.includes('ScriptEngine::newMap side script scan')
          && payload.originalOwners?.includes('Radar::newMap terrain extent and LeftHUD ownership')
          && payload.originalOwners?.includes('GameLogic width/height from terrain extent')
          && payload.originalOwners?.includes('PartitionManager::init loaded-map cell grid')
          && payload.originalOwners?.includes('PartitionManager::refreshShroudForLocalPlayer display/radar shroud refresh')
          && payload.originalOwners?.includes('GhostObjectManager local-player index and reset')
          && payload.originalOwners?.includes('TerrainTypeCollection empty texture-class lookup for render heightmap parsing')
          && payload.originalOwners?.includes('TerrainRoadCollection empty road table for W3DTerrainLogic::newMap road-buffer handoff')
          && payload.originalOwners?.includes('W3DTerrainLogic::newMap road-buffer handoff and TerrainLogic waypoint/water setup')
          && payload.originalOwners?.includes('W3DBridgeBuffer::loadBridges empty MD_GLA03 bridge scan')
          && payload.originalOwners?.includes('GameLogic bridge-like map-object scan ordered after terrain newMap')
          && payload.originalOwners?.includes('Radar::refreshTerrain after bridge-like map-object scan')
          && payload.originalOwners?.includes('Pathfinder::newMap terrain grid allocation/classification ordered after bridge-like scan'),
        'GameLogic new-game runtime smoke did not report original GlobalData/INI/AI/PlayerList/ScriptEngine/Shell/GameWindowManager/Terrain/Partition ownership');
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
    'browser DOM keyboard events feed the browser DirectInput scan-code queue and real GameClient::update proves KEY_A down/up through original DirectInputKeyboard',
    'real MainMenu default, Single Player, and USA difficulty transitions finish before the next click, aligning engine hit-testing with the rendered menu state',
    'real ButtonEasy campaign difficulty click passes the browser asset-backed original CD check, runs prepareCampaignGame/setupGameStart, sets the pending campaign map, and reaches doGameStart MSG_NEW_GAME queueing through the real startup lifecycle',
    'original ButtonUSA faction difficulty transition and ButtonDiffBack return through MainMenuSystem',
    'original ButtonLoadReplay dropdown and ButtonLoadReplayBack return through MainMenuSystem',
    'original ButtonCredits path through Shell::push into CreditsMenuInit/CreditsMenuUpdate with INIZH-backed Credits.ini',
    'browser boot constructs original W3DFunctionLexicon, verifies W3D device callback-name tables, loads the owned base GUI/widget/shell callback tables including passive GameInfoWindow system/init names, and reports the remaining FunctionLexicon callback owner groups as structured startup state',
    'browser boot constructs original W3DModuleFactory, runs W3DModuleFactory::init(), and proves public ModuleFactory lookups for representative base gameplay, client-update, and W3D draw modules',
    'browser boot constructs original W3DParticleSystemManager, runs ParticleSystemManager::init() against Data\\INI\\ParticleSystem.ini, and proves shipped particle template lookups through the public manager API',
    'archive-backed startup mounts all shipped Object INI definitions and proves original W3DThingFactory parses representative unit templates through the real ThingFactory/INI path while the first unowned factory remains createFunctionLexicon',
    'source-pinned original GameLogic MSG_NEW_GAME dispatch frontier after CommandList handoff',
    'runtime original GameLogic::processCommandList dispatch of MSG_NEW_GAME through prepareNewGame, base Window.big archive-backed BlankWindow parsing, original GlobalData TheWritableGlobalData, original PlayerList::getNthPlayer neutral-player ownership, original ScriptEngine::setGlobalDifficulty, original Shell::hideShell, first-call startNewGame(FALSE) deferral, MapsZH.big MD_GLA03 promotion, INIZH/INI startup data plus default and Zero Hour GameData.ini parsing, original W3DTerrainLogic::loadMap(false), WorldHeightMap object/waypoint/sides parsing, SidesList::validateSides, AIPlayer construction, TeamFactory::initFromSides, PlayerList::newGame, ScriptEngine::newMap, Radar::newMap, GameLogic width/height copying, PartitionManager::init/refreshShroudForLocalPlayer, GhostObjectManager local-player index/reset, TerrainRoadCollection/TerrainTypeCollection render-map setup, original W3DTerrainLogic::newMap road-buffer and W3DBridgeBuffer::loadBridges handoff, TerrainLogic waypoint/water setup, the ordered post-terrain bridge-like map-object no-candidate scan, Radar::refreshTerrain, and original Pathfinder::newMap grid allocation/classification',
  ],
  nextRequired: [
    'replace the remaining base FunctionLexicon callback owner groups, starting with non-network owners such as PopupReplay score-screen-dependent System/Update, QuitMenuSystem, ScoreScreen, and broader ControlBarSystem/LeftHUDInput callbacks only when their real owners are runtime-owned',
    'continue the real ButtonEasy campaign start beyond MSG_NEW_GAME queueing into map load/rendering through the full real lifecycle',
    'advance the post-particle startup data stores toward createThingFactory once createFunctionLexicon is fully owned',
    'load real object templates into gamelogic-new-game-dispatch-smoke and promote the bridge-like map-object creation branch when a map supplies bridge or walk-on-wall templates, then continue the original ordered startNewGame sequence beyond Pathfinder::newMap',
  ],
  sourceChecks: sourceResults.map(result => result.name),
  browserChecks: browserResults.map(result => result.name),
  smokes: results.map(result => result.name),
}));
