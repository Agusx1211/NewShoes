#include <iostream>

#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/Display.h"
#include "GameClient/GameFont.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"
#include "W3DDevice/GameClient/W3DGadget.h"
#include "W3DDevice/GameClient/W3DGameWindow.h"
#include "W3DDevice/GameClient/W3DGameWindowManager.h"

GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;

GameWindow *GameWindowManager::winCreateFromScript(AsciiString, WindowLayoutInfo *)
{
	return nullptr;
}

WindowLayout *GameWindowManager::winCreateLayout(AsciiString)
{
	return nullptr;
}

void GameWindowManager::freeStaticStrings()
{
}

WindowLayoutInfo::WindowLayoutInfo() :
	version(0),
	init(NULL),
	update(NULL),
	shutdown(NULL),
	initNameString(AsciiString::TheEmptyString),
	updateNameString(AsciiString::TheEmptyString),
	shutdownNameString(AsciiString::TheEmptyString)
{
	windows.clear();
}

namespace {

class SmokeFontLibrary : public FontLibrary
{
protected:
	Bool loadFontData(GameFont *font) override
	{
		if (font == nullptr) {
			return FALSE;
		}

		font->height = font->pointSize;
		font->fontData = nullptr;
		return TRUE;
	}
};

class SmokeDisplay : public Display
{
public:
	void doSmartAssetPurgeAndPreload(const char *) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpAssetUsage(const char *) override {}
#endif
	VideoBuffer *createVideoBuffer() override { return nullptr; }
	void setClipRegion(IRegion2D *region) override
	{
		if (region != nullptr) {
			m_clipRegion = *region;
		}
	}
	Bool isClippingEnabled() override { return m_clippingEnabled; }
	void enableClipping(Bool onoff) override { m_clippingEnabled = onoff; }
	void setTimeOfDay(TimeOfDay) override {}
	void createLightPulse(const Coord3D *, const RGBColor *, Real, Real, UnsignedInt, UnsignedInt) override {}
	void drawLine(Int, Int, Int, Int, Real, UnsignedInt) override { m_lineDraws++; }
	void drawLine(Int, Int, Int, Int, Real, UnsignedInt, UnsignedInt) override { m_lineDraws++; }
	void drawOpenRect(Int, Int, Int, Int, Real, UnsignedInt) override { m_openRectDraws++; }
	void drawFillRect(Int, Int, Int, Int, UnsignedInt) override { m_fillRectDraws++; }
	void drawRectClock(Int, Int, Int, Int, Int, UnsignedInt) override { m_rectClockDraws++; }
	void drawRemainingRectClock(Int, Int, Int, Int, Int, UnsignedInt) override { m_remainingRectClockDraws++; }
	void drawImage(const Image *, Int, Int, Int, Int, Color, DrawImageMode) override { m_imageDraws++; }
	void drawVideoBuffer(VideoBuffer *, Int, Int, Int, Int) override { m_videoBufferDraws++; }
	void clearShroud() override {}
	void setShroudLevel(Int, Int, CellShroudStatus) override {}
	void setBorderShroudLevel(UnsignedByte) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpModelAssets(const char *) override {}
#endif
	void preloadModelAssets(AsciiString) override {}
	void preloadTextureAssets(AsciiString) override {}
	void takeScreenShot() override {}
	void toggleMovieCapture() override {}
	void toggleLetterBox() override {}
	void enableLetterBox(Bool enable) override { m_letterBoxEnabled = enable; }
	Real getAverageFPS() override { return 0.0f; }
	Int getLastFrameDrawCalls() override
	{
		return m_lineDraws + m_openRectDraws + m_fillRectDraws + m_rectClockDraws +
			m_remainingRectClockDraws + m_imageDraws + m_videoBufferDraws;
	}

private:
	IRegion2D m_clipRegion = { { 0, 0 }, { 0, 0 } };
	Bool m_clippingEnabled = FALSE;
	Int m_lineDraws = 0;
	Int m_openRectDraws = 0;
	Int m_fillRectDraws = 0;
	Int m_rectClockDraws = 0;
	Int m_remainingRectClockDraws = 0;
	Int m_imageDraws = 0;
	Int m_videoBufferDraws = 0;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool exercise_w3d_window_manager()
{
	bool ok = true;

	GlobalData global_data;
	SubsystemInterfaceList subsystem_list;
	GlobalData *old_global_data = TheGlobalData;
	SubsystemInterfaceList *old_subsystem_list = TheSubsystemList;
	Display *old_display = TheDisplay;
	FontLibrary *old_font_library = TheFontLibrary;
	GameWindowManager *old_window_manager = TheWindowManager;

	TheGlobalData = &global_data;
	TheSubsystemList = &subsystem_list;

	{
		SmokeDisplay display;
		display.setWidth(800);
		display.setHeight(600);
		display.setBitDepth(32);
		display.setWindowed(TRUE);

		SmokeFontLibrary font_library;
		W3DGameWindowManager manager;

		TheDisplay = &display;
		TheFontLibrary = &font_library;
		TheWindowManager = &manager;

		ok = expect(manager.getDefaultDraw() == W3DGameWinDefaultDraw,
			"W3DGameWindowManager should expose the W3D default draw callback") && ok;
		ok = expect(manager.getPushButtonDrawFunc() == W3DGadgetPushButtonDraw,
			"W3DGameWindowManager should expose the W3D push-button draw callback") && ok;
		ok = expect(manager.getPushButtonImageDrawFunc() == W3DGadgetPushButtonImageDraw,
			"W3DGameWindowManager should expose the W3D push-button image draw callback") && ok;

		GameWindow *root = manager.winCreate(nullptr,
			WIN_STATUS_ENABLED,
			0,
			0,
			320,
			200,
			nullptr,
			nullptr);
		ok = expect(root != nullptr,
			"original W3DGameWindowManager::winCreate should allocate a real W3DGameWindow") && ok;
		if (root != nullptr) {
			ok = expect(root->winGetDrawFunc() == W3DGameWinDefaultDraw,
				"root W3DGameWindow should install the W3D default draw callback") && ok;
			ok = expect(manager.winGetWindowList() == root,
				"root W3DGameWindow should be linked into the original window list") && ok;

			WinInstanceData button_instance;
			button_instance.m_style = GWS_PUSH_BUTTON | GWS_MOUSE_TRACK;
			GameWindow *button = manager.gogoGadgetPushButton(root,
				WIN_STATUS_ENABLED,
				16,
				20,
				120,
				36,
				&button_instance,
				nullptr,
				FALSE);

			ok = expect(button != nullptr,
				"original gogoGadgetPushButton should allocate a W3D child gadget") && ok;
			if (button != nullptr) {
				ok = expect(button->winGetParent() == root,
					"W3D push-button gadget should be linked as a child of the root window") && ok;
				ok = expect(button->winGetDrawFunc() == W3DGadgetPushButtonDraw,
					"W3D push-button gadget should install the W3D draw callback") && ok;
				ok = expect(button->winGetInputFunc() == GadgetPushButtonInput,
					"W3D push-button gadget should keep the original push-button input callback") && ok;
			}

			manager.winDestroy(root);
			manager.update();
			ok = expect(manager.winGetWindowList() == nullptr,
				"destroying the root W3D window should clear the original window list") && ok;
		}
	}

	TheWindowManager = old_window_manager;
	TheFontLibrary = old_font_library;
	TheDisplay = old_display;
	TheSubsystemList = old_subsystem_list;
	TheGlobalData = old_global_data;

	return ok;
}

} // namespace

int main()
{
	initMemoryManager();
	const bool ok = exercise_w3d_window_manager();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"W3DGameWindowManager\",\"covered\":\"original W3DGameWindowManager winCreate W3DGameWindow allocation and W3D GadgetPushButton callback ownership\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
