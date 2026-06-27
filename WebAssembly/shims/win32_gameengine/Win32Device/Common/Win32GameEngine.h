#pragma once

#include "Common/GameAudio.h"
#include "Common/GameEngine.h"
#include "GameLogic/GameLogic.h"

class Win32GameEngine : public GameEngine
{
public:
	Win32GameEngine();
	virtual ~Win32GameEngine();

	virtual void init(void);
	virtual void reset(void);
	virtual void update(void);
	virtual void serviceWindowsOS(void);

protected:
	virtual LocalFileSystem *createLocalFileSystem(void) { return nullptr; }
	virtual ArchiveFileSystem *createArchiveFileSystem(void) { return nullptr; }
	virtual GameLogic *createGameLogic(void) { return nullptr; }
	virtual GameClient *createGameClient(void) { return nullptr; }
	virtual ModuleFactory *createModuleFactory(void) { return nullptr; }
	virtual ThingFactory *createThingFactory(void) { return nullptr; }
	virtual FunctionLexicon *createFunctionLexicon(void) { return nullptr; }
	virtual Radar *createRadar(void) { return nullptr; }
	virtual WebBrowser *createWebBrowser(void) { return nullptr; }
	virtual ParticleSystemManager *createParticleSystemManager(void) { return nullptr; }
	virtual AudioManager *createAudioManager(void) { return nullptr; }

	UINT m_previousErrorMode;
};
