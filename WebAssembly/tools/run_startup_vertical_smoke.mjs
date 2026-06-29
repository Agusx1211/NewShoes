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
      return JSON.parse(line);
    } catch {
      break;
    }
  }
  fail(`${label} did not emit a JSON result`);
}

function runSmoke(step) {
  const executable = path.join(distRoot, step.file);
  const result = spawnSync(process.execPath, [executable], {
    cwd: wasmRoot,
    encoding: 'utf8',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
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

function expect(condition, message) {
  if (!condition) {
    fail(message);
  }
}

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
];

const results = steps.map(runSmoke);

console.log(JSON.stringify({
  ok: true,
  path: 'startup-vertical',
  covered: [
    'original Win32GameEngine lifetime',
    'original MilesAudioManager openDevice',
    'original W3DGameWindowManager window and gadget ownership',
  ],
  nextRequired: [
    'replace focused GameEngine lifetime owner with original GameEngine.cpp singleton ownership',
    'advance W3DFunctionLexicon with real .wnd and shell callback ownership',
    'prove W3DModuleFactory module-template lookup through the original public API',
  ],
  smokes: results.map(result => result.name),
}));
