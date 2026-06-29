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
        'Startup browser frontier smoke did not prove createAudioManager as the first unowned factory');
      expect(payload.originalEngineStartup?.deviceFactoryFrontier?.firstUnownedInitLine === 434,
        'Startup browser frontier smoke did not prove createAudioManager line 434');
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
        && payload.archiveLayouts.includes('Menus/MainMenu.wnd'),
        'W3D window layout script smoke did not load real WindowZH message-box/MainMenu layouts');
      expect(Array.isArray(payload.shellLayouts)
        && payload.shellLayouts.includes('Menus/MainMenu.wnd'),
        'W3D window layout script smoke did not prove original Shell::push MainMenu.wnd ownership');
      expect(Array.isArray(payload.callbackOwners)
        && payload.callbackOwners.includes('MessageBoxSystem')
        && payload.callbackOwners.includes('QuitMessageBoxSystem')
        && payload.callbackOwners.includes('PassMessagesToParentSystem'),
        'W3D window layout script smoke did not prove real message-box callback ownership');
      expect(Array.isArray(payload.shellCallbackNames)
        && payload.shellCallbackNames.includes('W3DMainMenuInit')
        && payload.shellCallbackNames.includes('MainMenuSystem')
        && payload.shellCallbackNames.includes('MainMenuShutdown'),
        'W3D window layout script smoke did not prove MainMenu.wnd callback-name binding');
      expect(Array.isArray(payload.callbackPaths)
        && payload.callbackPaths.includes('W3DMainMenuInit->MainMenuInit'),
        'W3D window layout script smoke did not execute original W3DMainMenuInit to the MainMenuInit boundary');
      expect(typeof payload.covered === 'string' && payload.covered.includes('.wnd parser'),
        'W3D window layout script smoke did not prove parser coverage');
      expect(typeof payload.covered === 'string' && payload.covered.includes('Win32BIGFileSystem WindowZH.big'),
        'W3D window layout script smoke did not prove WindowZH.big archive-backed loading');
      expect(typeof payload.covered === 'string' && payload.covered.includes('Shell::showShell/Shell::push MainMenu.wnd'),
        'W3D window layout script smoke did not prove original Shell::showShell/Shell::push MainMenu ownership');
      expect(typeof payload.covered === 'string' && payload.covered.includes('W3DMainMenuInit to MainMenuInit boundary'),
        'W3D window layout script smoke did not report original W3DMainMenuInit/MainMenuInit execution');
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
    'original GameEngine.cpp constructor/destructor lifetime',
    'original MilesAudioManager openDevice',
    'original W3DGameWindowManager window and gadget ownership',
    'original WindowLayout .wnd parsing through W3DFunctionLexicon layout-init lookup',
    'real WindowZH.big message-box layout loading with original callback ownership',
    'original Shell::showShell/Shell::push loading MainMenu.wnd from WindowZH.big',
    'original W3DMainMenuInit executing to the MainMenuInit boundary',
  ],
  nextRequired: [
    'advance original GameEngine.cpp init singleton ownership before createAudioManager',
    'advance GUI ownership from W3DMainMenuInit into first safe original MainMenu.cpp runtime behavior',
    'prove W3DModuleFactory module-template lookup through the original public API at runtime',
  ],
  sourceChecks: sourceResults.map(result => result.name),
  browserChecks: browserResults.map(result => result.name),
  smokes: results.map(result => result.name),
}));
