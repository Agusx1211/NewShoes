#include "mfc/browser_mfc.h"

#include <emscripten.h>
#include <emscripten/em_asm.h>
#include <emscripten/threading.h>

#include <array>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <pthread.h>
#include <string>

namespace {

#if defined(__EMSCRIPTEN_PTHREADS__)

enum class PlatformActionKind {
	LaunchGame,
	PublishReport,
};

struct PlatformAction {
	PlatformActionKind kind;
	std::string path;
};

pthread_mutex_t g_platformActionMutex = PTHREAD_MUTEX_INITIALIZER;
std::deque<PlatformAction> g_platformActions;

bool enqueuePlatformAction(PlatformActionKind kind, const char *path)
{
	if (path == nullptr || *path == '\0') return false;
	pthread_mutex_lock(&g_platformActionMutex);
	g_platformActions.push_back({ kind, path });
	pthread_mutex_unlock(&g_platformActionMutex);
	return true;
}

#endif

void wb_dom_initialize()
{
	MAIN_THREAD_EM_ASM({
		if (!Module.worldBuilderMfcHost) {
			throw new Error("World Builder browser host script was not installed");
		}
		Module.worldBuilderMfcHost.initialize();
	});
}

double wb_dom_number(
	const char *method,
	const char *string0,
	const char *string1,
	double number0,
	double number1,
	double number2,
	double number3,
	double number4,
	double number5,
	double number6,
	double number7)
{
	return MAIN_THREAD_EM_ASM_DOUBLE({
		return Number(Module.worldBuilderMfcHost.number(
			UTF8ToString($0),
			UTF8ToString($1),
			UTF8ToString($2),
			[$3, $4, $5, $6, $7, $8, $9, $10],
		)) || 0;
	}, method, string0, string1, number0, number1, number2, number3,
		number4, number5, number6, number7);
}

char *wb_dom_string(
	const char *method,
	const char *string0,
	const char *string1,
	double number0,
	double number1,
	double number2,
	double number3)
{
	return reinterpret_cast<char *>(MAIN_THREAD_EM_ASM_INT({
		const result = Module.worldBuilderMfcHost.string(
			UTF8ToString($0),
			UTF8ToString($1),
			UTF8ToString($2),
			[$3, $4, $5, $6],
		);
		const value = String(result == null ? "" : result);
		return stringToNewUTF8(value);
	}, method, string0, string1, number0, number1, number2, number3));
}

void wb_dom_rect(
	const char *method,
	unsigned int window,
	int *result)
{
	MAIN_THREAD_EM_ASM({
		const value = Module.worldBuilderMfcHost.rect(
			UTF8ToString($0),
			$1 >>> 0,
		);
		HEAP32[($2 >> 2) + 0] = Number(value && value.left) | 0;
		HEAP32[($2 >> 2) + 1] = Number(value && value.top) | 0;
		HEAP32[($2 >> 2) + 2] = Number(value && value.right) | 0;
		HEAP32[($2 >> 2) + 3] = Number(value && value.bottom) | 0;
	}, method, window, result);
}

void wb_dom_polygon(
	unsigned int window,
	const CPoint *points,
	unsigned int count,
	int penStyle,
	int penWidth,
	unsigned int penColor,
	int fill,
	unsigned int fillColor)
{
	MAIN_THREAD_EM_ASM({
		const values = [];
		for (let index = 0; index < $2; index += 1) {
			const offset = ($1 >> 2) + index * 2;
			values.push({
				x: HEAP32[offset],
				y: HEAP32[offset + 1],
			});
		}
		Module.worldBuilderMfcHost.drawPolygon($0 >>> 0, values, {
			penStyle: $3,
			penWidth: $4,
			penColor: $5 >>> 0,
			fill: $6 !== 0,
			fillColor: $7 >>> 0,
		});
	}, window, points, count, penStyle, penWidth, penColor, fill, fillColor);
}

int wb_dom_draw_text(
	unsigned int window,
	const char *value,
	int left,
	int top,
	int right,
	int bottom,
	unsigned int format,
	unsigned int textColor,
	int textColorIsArgb,
	int transparentBackground,
	unsigned int backgroundColor,
	int fontHeight,
	int fontWeight,
	int fontItalic,
	const char *fontFace)
{
	return MAIN_THREAD_EM_ASM_INT({
		return Module.worldBuilderMfcHost.drawText(
			$0 >>> 0,
			UTF8ToString($1),
			{ left: $2, top: $3, right: $4, bottom: $5 },
			{
				format: $6 >>> 0,
				textColor: $7 >>> 0,
				textColorIsArgb: $8 !== 0,
				transparentBackground: $9 !== 0,
				backgroundColor: $10 >>> 0,
				fontHeight: $11,
				fontWeight: $12,
				fontItalic: $13 !== 0,
				fontFace: UTF8ToString($14),
			},
		) | 0;
	}, window, value, left, top, right, bottom, format, textColor,
		textColorIsArgb, transparentBackground, backgroundColor, fontHeight,
		fontWeight, fontItalic, fontFace);
}

int wb_dom_stretch_dibits(
	unsigned int window,
	int destinationLeft,
	int destinationTop,
	int destinationRight,
	int destinationBottom,
	int sourceLeft,
	int sourceTop,
	int sourceRight,
	int sourceBottom,
	const void *pixels,
	unsigned int pixelBytes,
	int bitmapWidth,
	int bitmapHeight,
	int bitmapBitCount,
	unsigned int colorUse,
	unsigned int rasterOperation)
{
	return MAIN_THREAD_EM_ASM_INT({
		const bytes = HEAPU8.slice($9, $9 + $10);
		return Module.worldBuilderMfcHost.stretchDibits(
			$0 >>> 0,
			{ left: $1, top: $2, right: $3, bottom: $4 },
			{ left: $5, top: $6, right: $7, bottom: $8 },
			bytes,
			{
				width: $11,
				height: $12,
				bitCount: $13,
				colorUse: $14 >>> 0,
				rasterOperation: $15 >>> 0,
			},
		) | 0;
	}, window, destinationLeft, destinationTop, destinationRight,
		destinationBottom, sourceLeft, sourceTop, sourceRight, sourceBottom,
		pixels, pixelBytes, bitmapWidth, bitmapHeight, bitmapBitCount,
		colorUse, rasterOperation);
}

void wb_dom_uint_vector(
	const char *method,
	unsigned int owner,
	const unsigned int *values,
	unsigned int count)
{
	MAIN_THREAD_EM_ASM({
		Module.worldBuilderMfcHost.uintVector(
			UTF8ToString($0),
			$1 >>> 0,
			Array.from(HEAPU32.subarray($2 >> 2, ($2 >> 2) + $3)),
		);
	}, method, owner, values, count);
}

int wb_dom_run_modal(unsigned int dialog)
{
	return MAIN_THREAD_EM_ASM_INT({
		return Module.worldBuilderMfcHost.runModal($0 >>> 0) | 0;
	}, dialog);
}

#if defined(__EMSCRIPTEN_PTHREADS__)

void waitForMainThreadDialog(std::atomic<int> &done)
{
	while (done.load(std::memory_order_acquire) == 0) {
		emscripten_futex_wait(
			reinterpret_cast<void *>(&done),
			0,
			100);
	}
}

int wb_dom_run_message_box(
	const char *text,
	const char *caption,
	unsigned int type,
	unsigned int parent)
{
	std::atomic<int> done{0};
	int result = IDCANCEL;
	MAIN_THREAD_ASYNC_EM_ASM({
		Promise.resolve(Module.worldBuilderMfcHost.runMessageBox({
			text: UTF8ToString($0),
			caption: UTF8ToString($1),
			type: $2 >>> 0,
			parent: $3 >>> 0,
		})).then((value) => {
			HEAP32[$4 >> 2] = Number(value) | 0;
		}).catch(() => {
			HEAP32[$4 >> 2] = 2;
		}).finally(() => {
			Atomics.store(HEAP32, $5 >> 2, 1);
			Atomics.notify(HEAP32, $5 >> 2);
		});
	}, text, caption, type, parent, &result, &done);
	waitForMainThreadDialog(done);
	return result;
}

unsigned int wb_dom_track_popup_menu(
	unsigned int menu,
	unsigned int flags,
	int screenX,
	int screenY,
	unsigned int owner)
{
	std::atomic<int> done{0};
	unsigned int result = 0;
	MAIN_THREAD_ASYNC_EM_ASM({
		Promise.resolve(Module.worldBuilderMfcHost.trackPopupMenuAsync(
			$0 >>> 0,
			$1 >>> 0,
			$2,
			$3,
			$4 >>> 0,
		)).then((value) => {
			HEAPU32[$5 >> 2] = Number(value) >>> 0;
		}).finally(() => {
			Atomics.store(HEAP32, $6 >> 2, 1);
			Atomics.notify(HEAP32, $6 >> 2);
		});
	}, menu, flags, screenX, screenY, owner, &result, &done);
	waitForMainThreadDialog(done);
	return result;
}

int wb_dom_run_color_dialog(
	unsigned int initialColor,
	unsigned int flags,
	unsigned int parent,
	unsigned int *chosenColor)
{
	std::atomic<int> done{0};
	int result = IDCANCEL;
	MAIN_THREAD_ASYNC_EM_ASM({
		Promise.resolve(Module.worldBuilderMfcHost.runColorDialog({
			initialColor: $0 >>> 0,
			flags: $1 >>> 0,
			parent: $2 >>> 0,
		})).then((value) => {
			HEAPU32[$3 >> 2] = Number(value && value.color) >>> 0;
			HEAP32[$4 >> 2] = Number(value && value.result) | 0;
		}).catch(() => {
			HEAP32[$4 >> 2] = 2;
		}).finally(() => {
			Atomics.store(HEAP32, $5 >> 2, 1);
			Atomics.notify(HEAP32, $5 >> 2);
		});
	}, initialColor, flags, parent, chosenColor, &result, &done);
	waitForMainThreadDialog(done);
	return result;
}

char *wb_dom_run_file_dialog(
	int openFile,
	const char *defaultExtension,
	const char *initialFilename,
	unsigned int flags,
	const char *filter,
	unsigned int parent,
	int *dialogResult)
{
	constexpr int kMaximumPathBytes = 4096;
	char path[kMaximumPathBytes] = {};
	std::atomic<int> done{0};
	*dialogResult = IDCANCEL;
	MAIN_THREAD_ASYNC_EM_ASM({
		Promise.resolve(Module.worldBuilderMfcHost.runFileDialog({
			openFile: $0 !== 0,
			defaultExtension: UTF8ToString($1),
			initialFilename: UTF8ToString($2),
			flags: $3 >>> 0,
			filter: UTF8ToString($4),
			parent: $5 >>> 0,
		})).then((value) => {
			HEAP32[$6 >> 2] = Number(value && value.result) | 0;
			stringToUTF8(String(value && value.path ? value.path : ""), $7, $8);
		}).catch(() => {
			HEAP32[$6 >> 2] = 2;
			HEAPU8[$7] = 0;
		}).finally(() => {
			Atomics.store(HEAP32, $9 >> 2, 1);
			Atomics.notify(HEAP32, $9 >> 2);
		});
	}, openFile, defaultExtension, initialFilename, flags, filter, parent,
		dialogResult, path, kMaximumPathBytes, &done);
	waitForMainThreadDialog(done);
	const std::size_t bytes = std::strlen(path) + 1;
	char *copy = static_cast<char *>(std::malloc(bytes));
	if (copy != nullptr) std::memcpy(copy, path, bytes);
	return copy;
}

int wb_dom_file_written(const char *path)
{
	std::atomic<int> done{0};
	int result = 0;
	MAIN_THREAD_ASYNC_EM_ASM({
		Promise.resolve(Module.worldBuilderMfcHost.fileWritten(
			UTF8ToString($0),
		)).then((value) => {
			HEAP32[$1 >> 2] = value ? 1 : 0;
		}).finally(() => {
			Atomics.store(HEAP32, $2 >> 2, 1);
			Atomics.notify(HEAP32, $2 >> 2);
		});
	}, path, &result, &done);
	waitForMainThreadDialog(done);
	return result;
}

extern "C" int BrowserWorldBuilderLaunchGame(const char *mapPath)
{
	return enqueuePlatformAction(
		PlatformActionKind::LaunchGame,
		mapPath) ? 1 : 0;
}

extern "C" int BrowserWorldBuilderPublishReport(const char *path)
{
	return enqueuePlatformAction(
		PlatformActionKind::PublishReport,
		path) ? 1 : 0;
}

extern "C" void BrowserWorldBuilderSetRecentFiles(const char *paths)
{
	MAIN_THREAD_EM_ASM({
		Module.worldBuilderMfcHost.setRecentFiles(
			UTF8ToString($0).split("\n").filter(Boolean),
		);
	}, paths ? paths : "");
}

extern "C" void BrowserWorldBuilderReportJumpStage(const char *stage)
{
	MAIN_THREAD_EM_ASM({
		const value = UTF8ToString($0);
		globalThis.worldBuilderJumpToGameStage = value;
		console.debug("[world-builder] Jump to Game", value);
	}, stage);
}

#else

EM_ASYNC_JS(int, wb_dom_run_message_box, (
	const char *text,
	const char *caption,
	unsigned int type,
	unsigned int parent), {
	return Number(await Module.worldBuilderMfcHost.runMessageBox({
		text: UTF8ToString(text),
		caption: UTF8ToString(caption),
		type: type >>> 0,
		parent: parent >>> 0,
	})) | 0;
});

EM_ASYNC_JS(unsigned int, wb_dom_track_popup_menu, (
	unsigned int menu,
	unsigned int flags,
	int screenX,
	int screenY,
	unsigned int owner), {
	return Number(await Module.worldBuilderMfcHost.trackPopupMenuAsync(
		menu >>> 0,
		flags >>> 0,
		screenX,
		screenY,
		owner >>> 0,
	)) >>> 0;
});

EM_ASYNC_JS(int, wb_dom_run_color_dialog, (
	unsigned int initialColor,
	unsigned int flags,
	unsigned int parent,
	unsigned int *chosenColor), {
	const result = await Module.worldBuilderMfcHost.runColorDialog({
		initialColor: initialColor >>> 0,
		flags: flags >>> 0,
		parent: parent >>> 0,
	});
	HEAPU32[chosenColor >> 2] = Number(result && result.color) >>> 0;
	return Number(result && result.result) | 0;
});

EM_ASYNC_JS(char *, wb_dom_run_file_dialog, (
	int openFile,
	const char *defaultExtension,
	const char *initialFilename,
	unsigned int flags,
	const char *filter,
	unsigned int parent,
	int *dialogResult), {
	const result = await Module.worldBuilderMfcHost.runFileDialog({
		openFile: openFile !== 0,
		defaultExtension: UTF8ToString(defaultExtension),
		initialFilename: UTF8ToString(initialFilename),
		flags: flags >>> 0,
		filter: UTF8ToString(filter),
		parent: parent >>> 0,
	});
	HEAP32[dialogResult >> 2] = Number(result && result.result) | 0;
	return stringToNewUTF8(String(result && result.path ? result.path : ""));
});

EM_ASYNC_JS(int, wb_dom_file_written, (const char *path), {
	return await Module.worldBuilderMfcHost.fileWritten(
		UTF8ToString(path),
	) ? 1 : 0;
});

extern "C" int BrowserWorldBuilderLaunchGame(const char *mapPath)
{
	if (mapPath == nullptr || *mapPath == '\0') return 0;
	return EM_ASM_INT({
		return Module.worldBuilderMfcHost.launchGameForMap(
			UTF8ToString($0),
		) ? 1 : 0;
	}, mapPath);
}

extern "C" int BrowserWorldBuilderPublishReport(const char *path)
{
	if (path == nullptr || *path == '\0') return 0;
	return EM_ASM_INT({
		return Module.worldBuilderMfcHost.publishReport(
			UTF8ToString($0),
		) ? 1 : 0;
	}, path);
}

extern "C" void BrowserWorldBuilderSetRecentFiles(const char *paths)
{
	EM_ASM({
		Module.worldBuilderMfcHost.setRecentFiles(
			UTF8ToString($0).split("\n").filter(Boolean),
		);
	}, paths ? paths : "");
}

extern "C" void BrowserWorldBuilderReportJumpStage(const char *stage)
{
	EM_ASM({
		const value = UTF8ToString($0);
		globalThis.worldBuilderJumpToGameStage = value;
		console.debug("[world-builder] Jump to Game", value);
	}, stage);
}

#endif

extern "C" EMSCRIPTEN_KEEPALIVE
int BrowserWorldBuilderPollPlatformActions()
{
#if defined(__EMSCRIPTEN_PTHREADS__)
	std::deque<PlatformAction> pending;
	pthread_mutex_lock(&g_platformActionMutex);
	pending.swap(g_platformActions);
	pthread_mutex_unlock(&g_platformActionMutex);

	for (const PlatformAction &action : pending) {
		EM_ASM({
			const kind = $0;
			const path = UTF8ToString($1);
			if (kind === 0) {
				Module.worldBuilderMfcHost.launchGameForMap(path);
			} else {
				Module.worldBuilderMfcHost.publishReport(path);
			}
		}, static_cast<int>(action.kind), action.path.c_str());
	}
	return static_cast<int>(pending.size());
#else
	return 0;
#endif
}

double number(
	const char *method,
	const std::string &string0 = {},
	const std::string &string1 = {},
	double number0 = 0,
	double number1 = 0,
	double number2 = 0,
	double number3 = 0,
	double number4 = 0,
	double number5 = 0,
	double number6 = 0,
	double number7 = 0)
{
	return wb_dom_number(
		method,
		string0.c_str(),
		string1.c_str(),
		number0,
		number1,
		number2,
		number3,
		number4,
		number5,
		number6,
		number7);
}

std::string stringValue(
	const char *method,
	const std::string &string0 = {},
	const std::string &string1 = {},
	double number0 = 0,
	double number1 = 0,
	double number2 = 0,
	double number3 = 0)
{
	char *value = wb_dom_string(
		method,
		string0.c_str(),
		string1.c_str(),
		number0,
		number1,
		number2,
		number3);
	if (value == nullptr) return {};
	std::string result(value);
	std::free(value);
	return result;
}

std::uintptr_t opaqueValue(const void *value)
{
	return reinterpret_cast<std::uintptr_t>(value);
}

template<typename T>
T opaqueHandle(double value)
{
	return reinterpret_cast<T>(static_cast<std::uintptr_t>(value));
}

class BrowserDomMfcHost final : public browser_mfc::Host {
public:
	BrowserDomMfcHost()
	{
		wb_dom_initialize();
	}

	browser_mfc::WindowId createDialog(
		UINT resourceId,
		browser_mfc::WindowId parent) override
	{
		return static_cast<browser_mfc::WindowId>(
			number("createDialog", {}, {}, resourceId, parent));
	}

	browser_mfc::WindowId createControl(
		browser_mfc::ControlKind kind,
		browser_mfc::WindowId parent,
		UINT controlId,
		const CRect &rect,
		DWORD style) override
	{
		return static_cast<browser_mfc::WindowId>(number(
			"createControl",
			{},
			{},
			static_cast<int>(kind),
			parent,
			controlId,
			rect.left,
			rect.top,
			rect.right,
			rect.bottom,
			style));
	}

	browser_mfc::WindowId createWindow(
		const std::string &className,
		const std::string &windowName,
		DWORD style,
		const CRect &rect,
		browser_mfc::WindowId parent,
		UINT controlId) override
	{
		return static_cast<browser_mfc::WindowId>(number(
			"createWindow",
			className,
			windowName,
			style,
			rect.left,
			rect.top,
			rect.right,
			rect.bottom,
			parent,
			controlId));
	}

	browser_mfc::WindowId createWindowEx(
		DWORD extendedStyle,
		const std::string &className,
		const std::string &windowName,
		DWORD style,
		const CRect &rect,
		browser_mfc::WindowId parent,
		std::uintptr_t menuOrControlId) override
	{
		return static_cast<browser_mfc::WindowId>(number(
			"createWindowEx",
			className,
			windowName,
			extendedStyle,
			style,
			rect.left,
			rect.top,
			rect.right,
			rect.bottom,
			parent,
			menuOrControlId));
	}

	browser_mfc::WindowId createFrame(
		UINT resourceId,
		DWORD style,
		browser_mfc::WindowId parent) override
	{
		return static_cast<browser_mfc::WindowId>(
			number("createFrame", {}, {}, resourceId, style, parent));
	}

	browser_mfc::WindowId createDialogBar(
		UINT resourceId,
		DWORD style,
		browser_mfc::WindowId parent,
		UINT controlId) override
	{
		return static_cast<browser_mfc::WindowId>(number(
			"createDialogBar", {}, {}, resourceId, style, parent, controlId));
	}

	browser_mfc::WindowId findControl(
		browser_mfc::WindowId parent,
		UINT controlId) override
	{
		return static_cast<browser_mfc::WindowId>(
			number("findControl", {}, {}, parent, controlId));
	}

	browser_mfc::ControlKind controlKind(
		browser_mfc::WindowId window) const override
	{
		return static_cast<browser_mfc::ControlKind>(
			static_cast<int>(number("controlKind", {}, {}, window)));
	}

	std::string getWindowText(
		browser_mfc::WindowId window) const override
	{
		return stringValue("getWindowText", {}, {}, window);
	}

	void setWindowText(
		browser_mfc::WindowId window,
		const std::string &value) override
	{
		number("setWindowText", value, {}, window);
	}

	int addItem(
		browser_mfc::WindowId window,
		const std::string &value) override
	{
		return static_cast<int>(number("addItem", value, {}, window));
	}

	int insertItem(
		browser_mfc::WindowId window,
		int index,
		const std::string &value) override
	{
		return static_cast<int>(
			number("insertItem", value, {}, window, index));
	}

	int deleteItem(browser_mfc::WindowId window, int index) override
	{
		return static_cast<int>(number("deleteItem", {}, {}, window, index));
	}

	void resetItems(browser_mfc::WindowId window) override
	{
		number("resetItems", {}, {}, window);
	}

	int itemCount(browser_mfc::WindowId window) const override
	{
		return static_cast<int>(number("itemCount", {}, {}, window));
	}

	int selectedItem(browser_mfc::WindowId window) const override
	{
		return static_cast<int>(number("selectedItem", {}, {}, window));
	}

	int setSelectedItem(browser_mfc::WindowId window, int index) override
	{
		return static_cast<int>(
			number("setSelectedItem", {}, {}, window, index));
	}

	std::string itemText(
		browser_mfc::WindowId window,
		int index) const override
	{
		return stringValue("itemText", {}, {}, window, index);
	}

	DWORD_PTR itemData(
		browser_mfc::WindowId window,
		int index) const override
	{
		return static_cast<DWORD_PTR>(
			number("itemData", {}, {}, window, index));
	}

	int setItemData(
		browser_mfc::WindowId window,
		int index,
		DWORD_PTR value) override
	{
		return static_cast<int>(
			number("setItemData", {}, {}, window, index, value));
	}

	int itemSelected(
		browser_mfc::WindowId window,
		int index) const override
	{
		return static_cast<int>(
			number("itemSelected", {}, {}, window, index));
	}

	int setItemSelected(
		browser_mfc::WindowId window,
		int index,
		bool selected) override
	{
		return static_cast<int>(number(
			"setItemSelected", {}, {}, window, index, selected));
	}

	int findItem(
		browser_mfc::WindowId window,
		int startAfter,
		const std::string &value,
		bool exact) const override
	{
		return static_cast<int>(number(
			"findItem", value, {}, window, startAfter, exact));
	}

	void setHorizontalExtent(
		browser_mfc::WindowId window,
		int pixels) override
	{
		number("setHorizontalExtent", {}, {}, window, pixels);
	}

	int insertListColumn(
		browser_mfc::WindowId window,
		int index,
		const std::string &heading,
		int format,
		int width,
		int subItem) override
	{
		return static_cast<int>(number(
			"insertListColumn",
			heading,
			{},
			window,
			index,
			format,
			width,
			subItem));
	}

	bool setListItemText(
		browser_mfc::WindowId window,
		int item,
		int subItem,
		const std::string &value) override
	{
		return number(
			"setListItemText", value, {}, window, item, subItem) != 0;
	}

	bool ensureListItemVisible(
		browser_mfc::WindowId window,
		int item,
		bool partialOk) override
	{
		return number(
			"ensureListItemVisible", {}, {}, window, item, partialOk) != 0;
	}

	int checkState(browser_mfc::WindowId window) const override
	{
		return static_cast<int>(number("checkState", {}, {}, window));
	}

	UINT buttonState(browser_mfc::WindowId window) const override
	{
		return static_cast<UINT>(number("buttonState", {}, {}, window));
	}

	void setCheckState(browser_mfc::WindowId window, int state) override
	{
		number("setCheckState", {}, {}, window, state);
	}

	void setControlRange(
		browser_mfc::WindowId window,
		int minimum,
		int maximum) override
	{
		number("setControlRange", {}, {}, window, minimum, maximum);
	}

	int controlPosition(browser_mfc::WindowId window) const override
	{
		return static_cast<int>(number("controlPosition", {}, {}, window));
	}

	int setControlPosition(
		browser_mfc::WindowId window,
		int position) override
	{
		return static_cast<int>(
			number("setControlPosition", {}, {}, window, position));
	}

	void setControlTickFrequency(
		browser_mfc::WindowId window,
		int frequency) override
	{
		number("setControlTickFrequency", {}, {}, window, frequency);
	}

	CHARRANGE textSelection(browser_mfc::WindowId window) const override
	{
		return {
			static_cast<LONG>(number("textSelectionStart", {}, {}, window)),
			static_cast<LONG>(number("textSelectionEnd", {}, {}, window)),
		};
	}

	void setTextSelection(
		browser_mfc::WindowId window,
		const CHARRANGE &selection) override
	{
		number(
			"setTextSelection",
			{},
			{},
			window,
			selection.cpMin,
			selection.cpMax);
	}

	DWORD richEditEventMask(browser_mfc::WindowId window) const override
	{
		return static_cast<DWORD>(
			number("richEditEventMask", {}, {}, window));
	}

	void setRichEditEventMask(
		browser_mfc::WindowId window,
		DWORD mask) override
	{
		number("setRichEditEventMask", {}, {}, window, mask);
	}

	bool setRichEditDefaultFormat(
		browser_mfc::WindowId window,
		const browser_mfc::RichTextFormat &format) override
	{
		return setRichTextFormat("setRichEditDefaultFormat", window, format);
	}

	bool setRichEditSelectionFormat(
		browser_mfc::WindowId window,
		const browser_mfc::RichTextFormat &format) override
	{
		return setRichTextFormat("setRichEditSelectionFormat", window, format);
	}

	void beginPaint(browser_mfc::WindowId window) override
	{
		number("beginPaint", {}, {}, window);
	}

	void endPaint(browser_mfc::WindowId window) override
	{
		number("endPaint", {}, {}, window);
	}

	void fillRectangle(
		browser_mfc::WindowId window,
		const CRect &rect,
		COLORREF color) override
	{
		number(
			"fillRectangle",
			{},
			{},
			window,
			rect.left,
			rect.top,
			rect.right,
			rect.bottom,
			color);
	}

	void drawLine(
		browser_mfc::WindowId window,
		const CPoint &from,
		const CPoint &to,
		int penStyle,
		int penWidth,
		COLORREF color) override
	{
		number(
			"drawLine",
			{},
			{},
			window,
			from.x,
			from.y,
			to.x,
			to.y,
			penStyle,
			penWidth,
			color);
	}

	void drawEllipse(
		browser_mfc::WindowId window,
		const CRect &bounds,
		int penStyle,
		int penWidth,
		COLORREF penColor,
		bool fill,
		COLORREF fillColor) override
	{
		number(
			"drawEllipse",
			std::to_string(fillColor),
			fill ? "1" : "0",
			window,
			bounds.left,
			bounds.top,
			bounds.right,
			bounds.bottom,
			penStyle,
			penWidth,
			penColor);
	}

	void drawPolygon(
		browser_mfc::WindowId window,
		const std::vector<CPoint> &points,
		int penStyle,
		int penWidth,
		COLORREF penColor,
		bool fill,
		COLORREF fillColor) override
	{
		wb_dom_polygon(
			window,
			points.data(),
			static_cast<unsigned int>(points.size()),
			penStyle,
			penWidth,
			penColor,
			fill ? 1 : 0,
			fillColor);
	}

	int drawText(
		browser_mfc::WindowId window,
		const std::string &value,
		const CRect &bounds,
		UINT format,
		DWORD textColor,
		bool textColorIsArgb,
		bool transparentBackground,
		COLORREF backgroundColor,
		const LOGFONT *font) override
	{
		const LOGFONT fallback = {};
		const LOGFONT &selected = font ? *font : fallback;
		return wb_dom_draw_text(
			window,
			value.c_str(),
			bounds.left,
			bounds.top,
			bounds.right,
			bounds.bottom,
			format,
			textColor,
			textColorIsArgb ? 1 : 0,
			transparentBackground ? 1 : 0,
			backgroundColor,
			selected.lfHeight,
			selected.lfWeight,
			selected.lfItalic,
			selected.lfFaceName);
	}

	int stretchDibits(
		browser_mfc::WindowId window,
		const CRect &destination,
		const CRect &source,
		const void *pixels,
		std::size_t pixelBytes,
		const BITMAPINFO &bitmapInfo,
		UINT colorUse,
		DWORD rasterOperation) override
	{
		return wb_dom_stretch_dibits(
			window,
			destination.left,
			destination.top,
			destination.right,
			destination.bottom,
			source.left,
			source.top,
			source.right,
			source.bottom,
			pixels,
			static_cast<unsigned int>(pixelBytes),
			bitmapInfo.bmiHeader.biWidth,
			bitmapInfo.bmiHeader.biHeight,
			bitmapInfo.bmiHeader.biBitCount,
			colorUse,
			rasterOperation);
	}

	CRect windowRect(browser_mfc::WindowId window) const override
	{
		return readRect("windowRect", window);
	}

	CRect clientRect(browser_mfc::WindowId window) const override
	{
		return readRect("clientRect", window);
	}

	DWORD windowStyle(browser_mfc::WindowId window) const override
	{
		return static_cast<DWORD>(number("windowStyle", {}, {}, window));
	}

	bool setWindowPosition(
		browser_mfc::WindowId window,
		browser_mfc::WindowId insertAfter,
		int x,
		int y,
		int width,
		int height,
		UINT flags) override
	{
		return number(
			"setWindowPosition",
			{},
			{},
			window,
			insertAfter,
			x,
			y,
			width,
			height,
			flags) != 0;
	}

	bool redrawWindow(
		browser_mfc::WindowId window,
		const CRect *updateRect,
		UINT flags) override
	{
		const CRect bounds = updateRect ? *updateRect : CRect();
		return number(
			"redrawWindow",
			{},
			{},
			window,
			updateRect ? 1 : 0,
			bounds.left,
			bounds.top,
			bounds.right,
			bounds.bottom,
			flags) != 0;
	}

	bool updateRect(
		browser_mfc::WindowId window,
		CRect &updateRect) const override
	{
		if (number("hasUpdateRect", {}, {}, window) == 0) return false;
		updateRect = readRect("updateRect", window);
		return true;
	}

	void setScrollRange(
		browser_mfc::WindowId window,
		int scrollBar,
		int minimum,
		int maximum,
		bool redraw) override
	{
		number(
			"setScrollRange",
			{},
			{},
			window,
			scrollBar,
			minimum,
			maximum,
			redraw);
	}

	int setScrollPosition(
		browser_mfc::WindowId window,
		int scrollBar,
		int position,
		bool redraw) override
	{
		return static_cast<int>(number(
			"setScrollPosition",
			{},
			{},
			window,
			scrollBar,
			position,
			redraw));
	}

	void scrollWindow(
		browser_mfc::WindowId window,
		int deltaX,
		int deltaY) override
	{
		number("scrollWindow", {}, {}, window, deltaX, deltaY);
	}

	void printWindow(
		browser_mfc::WindowId window,
		bool preview) override
	{
		number("printWindow", {}, {}, window, preview);
	}

	void screenToClient(
		browser_mfc::WindowId window,
		POINT &point) const override
	{
		const CRect converted = readRectWithPoint(
			"screenToClient", window, point);
		point.x = converted.left;
		point.y = converted.top;
	}

	void clientToScreen(
		browser_mfc::WindowId window,
		POINT &point) const override
	{
		const CRect converted = readRectWithPoint(
			"clientToScreen", window, point);
		point.x = converted.left;
		point.y = converted.top;
	}

	bool showWindow(
		browser_mfc::WindowId window,
		int command) override
	{
		return number("showWindow", {}, {}, window, command) != 0;
	}

	bool isWindowVisible(
		browser_mfc::WindowId window) const override
	{
		return number("isWindowVisible", {}, {}, window) != 0;
	}

	bool isWindowMinimized(
		browser_mfc::WindowId window) const override
	{
		return number("isWindowMinimized", {}, {}, window) != 0;
	}

	void setEnabled(
		browser_mfc::WindowId window,
		bool enabled) override
	{
		number("setEnabled", {}, {}, window, enabled);
	}

	bool isEnabled(browser_mfc::WindowId window) const override
	{
		return number("isEnabled", {}, {}, window) != 0;
	}

	browser_mfc::WindowId setCapture(
		browser_mfc::WindowId window) override
	{
		return static_cast<browser_mfc::WindowId>(
			number("setCapture", {}, {}, window));
	}

	bool releaseCapture() override
	{
		return number("releaseCapture", {}, {}) != 0;
	}

	browser_mfc::WindowId capturedWindow() const override
	{
		return static_cast<browser_mfc::WindowId>(
			number("capturedWindow", {}, {}));
	}

	HTREEITEM insertTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM parent,
		HTREEITEM insertAfter,
		const std::string &text,
		LPARAM parameter,
		UINT state,
		int image,
		int selectedImage) override
	{
		return opaqueHandle<HTREEITEM>(number(
			"insertTreeItem",
			text,
			{},
			tree,
			opaqueValue(parent),
			opaqueValue(insertAfter),
			parameter,
			state,
			image,
			selectedImage));
	}

	bool readTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM item,
		std::string &text,
		LPARAM &parameter,
		UINT &state,
		int &image,
		int &selectedImage,
		int &childCount) const override
	{
		if (number(
			"treeItemExists", {}, {}, tree, opaqueValue(item)) == 0) {
			return false;
		}
		text = stringValue(
			"treeItemText", {}, {}, tree, opaqueValue(item));
		parameter = static_cast<LPARAM>(number(
			"treeItemParameter", {}, {}, tree, opaqueValue(item)));
		state = static_cast<UINT>(number(
			"treeItemState", {}, {}, tree, opaqueValue(item)));
		image = static_cast<int>(number(
			"treeItemImage", {}, {}, tree, opaqueValue(item)));
		selectedImage = static_cast<int>(number(
			"treeItemSelectedImage", {}, {}, tree, opaqueValue(item)));
		childCount = static_cast<int>(number(
			"treeItemChildCount", {}, {}, tree, opaqueValue(item)));
		return true;
	}

	bool writeTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM item,
		UINT mask,
		const std::string &text,
		LPARAM parameter,
		UINT state,
		UINT stateMask,
		int image,
		int selectedImage) override
	{
		return number(
			"writeTreeItem",
			text,
			{},
			tree,
			opaqueValue(item),
			mask,
			parameter,
			state,
			stateMask,
			image,
			selectedImage) != 0;
	}

	HTREEITEM firstTreeChild(
		browser_mfc::WindowId tree,
		HTREEITEM parent) const override
	{
		return opaqueHandle<HTREEITEM>(number(
			"firstTreeChild", {}, {}, tree, opaqueValue(parent)));
	}

	HTREEITEM nextTreeSibling(
		browser_mfc::WindowId tree,
		HTREEITEM item) const override
	{
		return opaqueHandle<HTREEITEM>(number(
			"nextTreeSibling", {}, {}, tree, opaqueValue(item)));
	}

	HTREEITEM parentTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM item) const override
	{
		return opaqueHandle<HTREEITEM>(number(
			"parentTreeItem", {}, {}, tree, opaqueValue(item)));
	}

	bool deleteTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM item) override
	{
		return number(
			"deleteTreeItem", {}, {}, tree, opaqueValue(item)) != 0;
	}

	void deleteAllTreeItems(browser_mfc::WindowId tree) override
	{
		number("deleteAllTreeItems", {}, {}, tree);
	}

	HTREEITEM selectedTreeItem(
		browser_mfc::WindowId tree) const override
	{
		return opaqueHandle<HTREEITEM>(
			number("selectedTreeItem", {}, {}, tree));
	}

	bool selectTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM item) override
	{
		return number(
			"selectTreeItem", {}, {}, tree, opaqueValue(item)) != 0;
	}

	bool selectTreeDropTarget(
		browser_mfc::WindowId tree,
		HTREEITEM item) override
	{
		return number(
			"selectTreeDropTarget", {}, {}, tree, opaqueValue(item)) != 0;
	}

	bool setTreeFirstVisibleItem(
		browser_mfc::WindowId tree,
		HTREEITEM item) override
	{
		return number(
			"setTreeFirstVisibleItem", {}, {}, tree, opaqueValue(item)) != 0;
	}

	HTREEITEM hitTestTreeItem(
		browser_mfc::WindowId tree,
		const CPoint &point,
		UINT &flags) const override
	{
		flags = static_cast<UINT>(
			number("treeHitTestFlags", {}, {}, tree, point.x, point.y));
		return opaqueHandle<HTREEITEM>(
			number("hitTestTreeItem", {}, {}, tree, point.x, point.y));
	}

	browser_mfc::WindowId beginTreeLabelEdit(
		browser_mfc::WindowId tree,
		HTREEITEM item) override
	{
		return static_cast<browser_mfc::WindowId>(number(
			"beginTreeLabelEdit", {}, {}, tree, opaqueValue(item)));
	}

	bool endTreeLabelEdit(
		browser_mfc::WindowId tree,
		bool cancel) override
	{
		return number("endTreeLabelEdit", {}, {}, tree, cancel) != 0;
	}

	browser_mfc::ImageListId createImageList(
		int width,
		int height,
		UINT flags,
		int initialCount,
		int growCount) override
	{
		return static_cast<browser_mfc::ImageListId>(number(
			"createImageList",
			{},
			{},
			width,
			height,
			flags,
			initialCount,
			growCount));
	}

	browser_mfc::ImageListId createImageListFromBitmap(
		UINT bitmapResourceId,
		int cellWidth,
		int growCount,
		COLORREF transparentColor) override
	{
		return static_cast<browser_mfc::ImageListId>(number(
			"createImageListFromBitmap",
			{},
			{},
			bitmapResourceId,
			cellWidth,
			growCount,
			transparentColor));
	}

	int addImageListIcon(
		browser_mfc::ImageListId images,
		HICON icon) override
	{
		return static_cast<int>(number(
			"addImageListIcon", {}, {}, images, opaqueValue(icon)));
	}

	browser_mfc::ImageListId setTreeImageList(
		browser_mfc::WindowId tree,
		browser_mfc::ImageListId images,
		int listType) override
	{
		return static_cast<browser_mfc::ImageListId>(
			number("setTreeImageList", {}, {}, tree, images, listType));
	}

	browser_mfc::WindowId createStatusBar(
		browser_mfc::WindowId parent) override
	{
		return static_cast<browser_mfc::WindowId>(
			number("createStatusBar", {}, {}, parent));
	}

	bool setStatusIndicators(
		browser_mfc::WindowId statusBar,
		const std::vector<UINT> &indicators) override
	{
		wb_dom_uint_vector(
			"setStatusIndicators",
			statusBar,
			indicators.data(),
			static_cast<unsigned int>(indicators.size()));
		return true;
	}

	browser_mfc::WindowId createToolBar(
		browser_mfc::WindowId parent,
		DWORD controlStyle,
		DWORD barStyle) override
	{
		return static_cast<browser_mfc::WindowId>(
			number("createToolBar", {}, {}, parent, controlStyle, barStyle));
	}

	bool loadToolBarResource(
		browser_mfc::WindowId toolbar,
		UINT resourceId) override
	{
		return number(
			"loadToolBarResource", {}, {}, toolbar, resourceId) != 0;
	}

	void enableDocking(
		browser_mfc::WindowId window,
		DWORD alignment) override
	{
		number("enableDocking", {}, {}, window, alignment);
	}

	void dockControlBar(
		browser_mfc::WindowId frame,
		browser_mfc::WindowId controlBar) override
	{
		number("dockControlBar", {}, {}, frame, controlBar);
	}

	void floatControlBar(
		browser_mfc::WindowId frame,
		browser_mfc::WindowId controlBar,
		const CPoint &screenPosition,
		DWORD alignment) override
	{
		number(
			"floatControlBar",
			{},
			{},
			frame,
			controlBar,
			screenPosition.x,
			screenPosition.y,
			alignment);
	}

	void saveBarState(
		browser_mfc::WindowId frame,
		const std::string &profileName) override
	{
		number("saveBarState", profileName, {}, frame);
	}

	void setFrameMessage(
		browser_mfc::WindowId frame,
		const std::string &message) override
	{
		number("setFrameMessage", message, {}, frame);
	}

	browser_mfc::MenuId loadMenuResource(UINT resourceId) override
	{
		return static_cast<browser_mfc::MenuId>(
			number("loadMenuResource", {}, {}, resourceId));
	}

	browser_mfc::MenuId submenu(
		browser_mfc::MenuId menu,
		int position) const override
	{
		return static_cast<browser_mfc::MenuId>(
			number("submenu", {}, {}, menu, position));
	}

	bool appendMenuItem(
		browser_mfc::MenuId menu,
		UINT flags,
		std::uintptr_t commandOrSubmenu,
		const std::string &text) override
	{
		return number(
			"appendMenuItem",
			text,
			{},
			menu,
			flags,
			commandOrSubmenu) != 0;
	}

	bool removeMenuItem(
		browser_mfc::MenuId menu,
		UINT item,
		UINT flags) override
	{
		return number("removeMenuItem", {}, {}, menu, item, flags) != 0;
	}

	int enableMenuItem(
		browser_mfc::MenuId menu,
		UINT item,
		UINT flags) override
	{
		return static_cast<int>(
			number("enableMenuItem", {}, {}, menu, item, flags));
	}

	int checkMenuItem(
		browser_mfc::MenuId menu,
		UINT item,
		UINT flags) override
	{
		return static_cast<int>(
			number("checkMenuItem", {}, {}, menu, item, flags));
	}

	UINT trackPopupMenu(
		browser_mfc::MenuId menu,
		UINT flags,
		int screenX,
		int screenY,
		browser_mfc::WindowId owner) override
	{
		return wb_dom_track_popup_menu(
			menu, flags, screenX, screenY, owner);
	}

	bool destroyMenu(browser_mfc::MenuId menu) override
	{
		return number("destroyMenu", {}, {}, menu) != 0;
	}

	bool destroyWindow(browser_mfc::WindowId window) override
	{
		return number("destroyWindow", {}, {}, window) != 0;
	}

	UINT setTimer(
		browser_mfc::WindowId window,
		UINT eventId,
		UINT milliseconds) override
	{
		return static_cast<UINT>(
			number("setTimer", {}, {}, window, eventId, milliseconds));
	}

	bool killTimer(
		browser_mfc::WindowId window,
		UINT eventId) override
	{
		return number("killTimer", {}, {}, window, eventId) != 0;
	}

	LRESULT deliverNativeMessage(
		browser_mfc::WindowId window,
		UINT message,
		WPARAM wParam,
		LPARAM lParam) override
	{
		return static_cast<LRESULT>(
			number("deliverNativeMessage", {}, {}, window, message, wParam, lParam));
	}

	void setFocus(browser_mfc::WindowId window) override
	{
		number("setFocus", {}, {}, window);
	}

	int runModal(browser_mfc::WindowId dialog) override
	{
		return wb_dom_run_modal(dialog);
	}

	browser_mfc::WindowId createPropertySheet(
		const std::string &caption,
		browser_mfc::WindowId parent) override
	{
		return static_cast<browser_mfc::WindowId>(
			number("createPropertySheet", caption, {}, parent));
	}

	void addPropertyPage(
		browser_mfc::WindowId propertySheet,
		browser_mfc::WindowId propertyPage,
		UINT resourceId) override
	{
		number(
			"addPropertyPage",
			{},
			{},
			propertySheet,
			propertyPage,
			resourceId);
	}

	void selectPropertyPage(
		browser_mfc::WindowId propertySheet,
		unsigned int pageIndex) override
	{
		number("selectPropertyPage", {}, {}, propertySheet, pageIndex);
	}

	void closeDialog(
		browser_mfc::WindowId dialog,
		int result) override
	{
		number("closeDialog", {}, {}, dialog, result);
	}

	std::string loadString(UINT resourceId) const override
	{
		return stringValue("loadString", {}, {}, resourceId);
	}

	std::string documentString(
		UINT resourceId,
		int stringIndex) const override
	{
		return stringValue(
			"documentString", {}, {}, resourceId, stringIndex);
	}

	HICON loadIcon(UINT resourceId) override
	{
		return opaqueHandle<HICON>(number("loadIcon", {}, {}, resourceId));
	}

	HANDLE loadImage(
		UINT resourceId,
		UINT imageType,
		int desiredWidth,
		int desiredHeight,
		UINT flags) override
	{
		return opaqueHandle<HANDLE>(number(
			"loadImage",
			{},
			{},
			resourceId,
			imageType,
			desiredWidth,
			desiredHeight,
			flags));
	}

	bool destroyImage(HANDLE image, UINT imageType) override
	{
		return number(
			"destroyImage", {}, {}, opaqueValue(image), imageType) != 0;
	}

	void drawIcon(
		browser_mfc::WindowId window,
		int x,
		int y,
		HICON icon,
		int width,
		int height,
		UINT flags) override
	{
		number(
			"drawIcon",
			{},
			{},
			window,
			x,
			y,
			opaqueValue(icon),
			width,
			height,
			flags);
	}

	COLORREF systemColor(int colorIndex) const override
	{
		return static_cast<COLORREF>(
			number("systemColor", {}, {}, colorIndex));
	}

	bool beep(DWORD frequency, DWORD durationMilliseconds) override
	{
		return number(
			"beep", {}, {}, frequency, durationMilliseconds) != 0;
	}

	bool initializeControls() override
	{
		return number("initializeControls") != 0;
	}

	std::string launchDocumentPath() const override
	{
		return stringValue("launchDocumentPath");
	}

	HCURSOR loadCursor(UINT resourceId) override
	{
		return opaqueHandle<HCURSOR>(
			number("loadCursor", {}, {}, resourceId));
	}

	bool destroyCursor(HCURSOR cursor) override
	{
		return number(
			"destroyCursor", {}, {}, opaqueValue(cursor)) != 0;
	}

	bool messageBeep(UINT type) override
	{
		return number("messageBeep", {}, {}, type) != 0;
	}

	int runMessageBox(
		const std::string &text,
		const std::string &caption,
		UINT type,
		browser_mfc::WindowId parent) override
	{
		return wb_dom_run_message_box(
			text.c_str(), caption.c_str(), type, parent);
	}

	int runColorDialog(
		COLORREF initialColor,
		DWORD flags,
		browser_mfc::WindowId parent,
		COLORREF &chosenColor) override
	{
		unsigned int resultColor = initialColor;
		const int result = wb_dom_run_color_dialog(
			initialColor, flags, parent, &resultColor);
		chosenColor = resultColor;
		return result;
	}

	int runFileDialog(
		bool openFile,
		const std::string &defaultExtension,
		const std::string &initialFilename,
		DWORD flags,
		const std::string &filter,
		browser_mfc::WindowId parent,
		std::string &selectedPath) override
	{
		int result = IDCANCEL;
		char *path = wb_dom_run_file_dialog(
			openFile ? 1 : 0,
			defaultExtension.c_str(),
			initialFilename.c_str(),
			flags,
			filter.c_str(),
			parent,
			&result);
		selectedPath = path ? path : "";
		std::free(path);
		return result;
	}

	bool fileWritten(const std::string &path) override
	{
		return wb_dom_file_written(path.c_str()) != 0;
	}

	bool playSound(
		const std::string &filename,
		DWORD flags) override
	{
		return number("playSound", filename, {}, flags) != 0;
	}

	int readProfileInt(
		const std::string &section,
		const std::string &entry,
		int defaultValue) const override
	{
		return static_cast<int>(number(
			"readProfileInt", section, entry, defaultValue));
	}

	std::string readProfileString(
		const std::string &section,
		const std::string &entry,
		const std::string &defaultValue) const override
	{
		return stringValue(
			"readProfileString",
			section + '\x1f' + entry,
			defaultValue);
	}

	bool writeProfileInt(
		const std::string &section,
		const std::string &entry,
		int value) override
	{
		return number("writeProfileInt", section, entry, value) != 0;
	}

	bool writeProfileString(
		const std::string &section,
		const std::string &entry,
		const std::string &value) override
	{
		return number(
			"writeProfileString",
			section + '\x1f' + entry,
			value) != 0;
	}

	int systemMetric(int metric) const override
	{
		return static_cast<int>(number("systemMetric", {}, {}, metric));
	}

	void uninitializeComApartment() override
	{
		number("uninitializeComApartment");
	}

private:
	bool setRichTextFormat(
		const char *operation,
		browser_mfc::WindowId window,
		const browser_mfc::RichTextFormat &format)
	{
		return number(
			operation,
			format.faceName,
			{},
			window,
			format.mask,
			format.effects,
			format.heightTwips,
			format.verticalOffsetTwips,
			format.textColor,
			format.characterSet,
			format.pitchAndFamily) != 0;
	}

	CRect readRect(
		const char *operation,
		browser_mfc::WindowId window) const
	{
		std::array<int, 4> result = {};
		wb_dom_rect(operation, window, result.data());
		return CRect(result[0], result[1], result[2], result[3]);
	}

	CRect readRectWithPoint(
		const char *operation,
		browser_mfc::WindowId window,
		const POINT &point) const
	{
		number("setCoordinateInput", {}, {}, point.x, point.y);
		return readRect(operation, window);
	}
};

BrowserDomMfcHost *browserHost = nullptr;

}

extern "C" void BrowserMfcInstallDomHost()
{
	if (browserHost != nullptr) return;
	browserHost = new BrowserDomMfcHost;
	browser_mfc::setHost(browserHost);
}

extern "C" void BrowserWorldBuilderSetCursor(
	std::uintptr_t cursor,
	const char *cursorFile)
{
	MAIN_THREAD_EM_ASM({
		Module.worldBuilderMfcHost.setCursor(
			$0 >>> 0,
			UTF8ToString($1),
		);
	}, cursor, cursorFile ? cursorFile : "");
}
