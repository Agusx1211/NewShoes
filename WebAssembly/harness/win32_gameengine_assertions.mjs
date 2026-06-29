export function assertWin32GameEngineProbe(probe, context) {
  if (!probe?.ok
      || probe.source !== "GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp"
      || probe.originalHeader !== "GeneralsMD/Code/GameEngineDevice/Include/Win32Device/Common/Win32GameEngine.h"
      || probe.service !== "Win32GameEngine::serviceWindowsOS"
      || probe.serviceHelper !== "cnc_port_win32_service_windows_os_message_pump"
      || probe.constructorBoundary !== "Win32GameEngine construction requires linked GameEngine vtable/typeinfo and owned startup singleton lifetime"
      || probe.destructorBoundary !== "GameEngine::~GameEngine owns full startup singleton lifetime"
      || probe.nextRequired !== "ownedGameEngineSingletonLifetime"
      || probe.registerWindowClass !== true
      || probe.windowCreated !== true
      || probe.constructionSkipped !== true
      || probe.destructorSkipped !== true) {
    throw new Error(`${context} Win32GameEngine source/header boundary mismatch: ${JSON.stringify(probe)}`);
  }

  const errorMode = probe.errorMode;
  if (errorMode?.beforeConstructorContract !== 64
      || errorMode.constructorPrevious !== 64
      || errorMode.afterConstructorContract !== errorMode.constructorMode
      || errorMode.constructorMode !== 1
      || errorMode.beforeManualRestore !== errorMode.constructorMode
      || errorMode.afterManualRestore !== errorMode.previous) {
    throw new Error(`${context} Win32GameEngine error-mode contract mismatch: ${JSON.stringify(errorMode)}`);
  }

  const messagePump = probe.messagePump;
  if (messagePump?.queued !== true
      || messagePump.queueBeforeService !== 1
      || messagePump.queueAfterService !== 0
      || messagePump.createMessages !== 1
      || messagePump.userMessages !== 1
      || messagePump.destroyMessages !== 1
      || messagePump.seenMessage !== 1090
      || messagePump.seenWParam !== 0x1234
      || messagePump.seenLParam !== 0x5678
      || messagePump.seenMessageTime !== 24680) {
    throw new Error(`${context} Win32GameEngine message pump mismatch: ${JSON.stringify(messagePump)}`);
  }
}
