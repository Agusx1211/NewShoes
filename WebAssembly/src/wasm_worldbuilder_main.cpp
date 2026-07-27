#include "StdAfx.h"

#include "Common/FileSystem.h"
#include "Common/file.h"
#include "WHeightMapEdit.h"
#include "WorldBuilder.h"
#include "WorldBuilderDoc.h"

#include <emscripten.h>
#include <emscripten/em_asm.h>

#include <atomic>
#include <ctime>
#include <cstdint>
#include <deque>
#include <exception>
#include <pthread.h>
#include <string>
#include <unordered_map>
#include <utility>

class WebBrowser;
WebBrowser *TheWebBrowser = nullptr;

extern "C" void BrowserMfcInstallDomHost();
extern "C" void cnc_port_d3d8_set_present_bridge(int enabled);

namespace {

enum class ApplicationState : int {
	Idle = 0,
	Starting = 1,
	Running = 2,
	Failed = 3,
};

enum class UiEventKind {
	Command,
	Control,
	Notify,
	WindowMessage,
	Pointer,
	Key,
	QueryCommand,
};

struct UiEvent {
	UiEventKind kind = UiEventKind::Command;
	unsigned int window = 0;
	unsigned int id = 0;
	int notification = 0;
	unsigned int number0 = 0;
	unsigned int number1 = 0;
	unsigned int object = 0;
	std::intptr_t parameter = 0;
	unsigned int action = 0;
	int x = 0;
	int y = 0;
	int screenX = 0;
	int screenY = 0;
	std::string text;
};

constexpr std::size_t kMaximumQueuedUiEvents = 4096;

std::atomic<ApplicationState> g_applicationState{ApplicationState::Idle};
pthread_mutex_t g_uiEventMutex = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t g_uiEventCondition = PTHREAD_COND_INITIALIZER;
std::deque<UiEvent> g_uiEvents;
std::unordered_map<std::uint64_t, unsigned int> g_commandStates;
std::atomic<unsigned int> g_droppedUiEvents{0};
std::atomic<unsigned int> g_framePresentationPermit{1};

void reportStartupResult(bool success, const char *message)
{
	MAIN_THREAD_EM_ASM({
		const success = $0 !== 0;
		const detail = UTF8ToString($1);
		const status = document.querySelector("[data-world-builder-status]");
		if (status) status.textContent = detail;
		document.documentElement.dataset.worldBuilderReady = success ? "true" : "false";
		globalThis.dispatchEvent(new CustomEvent(
			success ? "worldbuilderready" : "worldbuildererror",
			{ detail },
		));
	}, success ? 1 : 0, message);
}

void reportStartupProgress(const char *message)
{
	MAIN_THREAD_EM_ASM({
		const status = document.querySelector("[data-world-builder-status]");
		if (status) status.textContent = UTF8ToString($0);
	}, message);
}

std::uint64_t commandStateKey(unsigned int window, unsigned int command)
{
	return (static_cast<std::uint64_t>(window) << 32) | command;
}

bool enqueueUiEvent(const UiEvent &event)
{
	pthread_mutex_lock(&g_uiEventMutex);

	if (event.kind == UiEventKind::Pointer && event.id == WM_MOUSEMOVE) {
		for (auto iterator = g_uiEvents.rbegin(); iterator != g_uiEvents.rend(); ++iterator) {
			if (iterator->kind == UiEventKind::Pointer &&
				iterator->window == event.window &&
				iterator->id == WM_MOUSEMOVE) {
				*iterator = event;
				pthread_cond_signal(&g_uiEventCondition);
				pthread_mutex_unlock(&g_uiEventMutex);
				return true;
			}
		}
	}

	if (event.kind == UiEventKind::QueryCommand) {
		for (auto iterator = g_uiEvents.rbegin(); iterator != g_uiEvents.rend(); ++iterator) {
			if (iterator->kind == UiEventKind::QueryCommand &&
				iterator->window == event.window &&
				iterator->id == event.id) {
				*iterator = event;
				pthread_cond_signal(&g_uiEventCondition);
				pthread_mutex_unlock(&g_uiEventMutex);
				return true;
			}
		}
	}

	if (event.kind == UiEventKind::WindowMessage &&
		(event.id == WM_PAINT || event.id == WM_TIMER)) {
		for (auto iterator = g_uiEvents.rbegin(); iterator != g_uiEvents.rend(); ++iterator) {
			if (iterator->kind == UiEventKind::WindowMessage &&
				iterator->window == event.window &&
				iterator->id == event.id &&
				(event.id != WM_TIMER || iterator->number0 == event.number0)) {
				*iterator = event;
				pthread_cond_signal(&g_uiEventCondition);
				pthread_mutex_unlock(&g_uiEventMutex);
				return true;
			}
		}
	}

	if (g_uiEvents.size() >= kMaximumQueuedUiEvents) {
		g_droppedUiEvents.fetch_add(1);
		pthread_mutex_unlock(&g_uiEventMutex);
		return false;
	}
	if (event.kind == UiEventKind::QueryCommand) {
		g_uiEvents.push_back(event);
	} else {
		// MFC command UI updates are idle work. Keep real input responsive when
		// a menu or toolbar refresh has queued several state probes.
		const auto firstQuery = std::find_if(
			g_uiEvents.begin(),
			g_uiEvents.end(),
			[](const UiEvent &queued) {
				return queued.kind == UiEventKind::QueryCommand;
			});
		g_uiEvents.insert(firstQuery, event);
	}
	pthread_cond_signal(&g_uiEventCondition);
	pthread_mutex_unlock(&g_uiEventMutex);
	return true;
}

CWnd *windowObject(unsigned int window)
{
	return browser_mfc::findWindowObject(
		static_cast<browser_mfc::WindowId>(window));
}

CDocument *documentForWindow(CWnd *window)
{
	if (auto *view = dynamic_cast<CView *>(window)) {
		return view->GetDocument();
	}
	for (CWnd *ancestor = window; ancestor != nullptr;
		ancestor = ancestor->GetParent()) {
		if (auto *frame = dynamic_cast<CFrameWnd *>(ancestor)) {
			return frame->GetActiveDocument();
		}
	}
	return nullptr;
}

void reportOriginalRuntimeState(
	CWnd *target,
	UiEventKind kind,
	unsigned int message)
{
	auto *document = dynamic_cast<CWorldBuilderDoc *>(
		documentForWindow(target));
	WorldHeightMapEdit *heightMap =
		document != nullptr ? document->GetHeightMap() : nullptr;
	std::uint32_t heightHash = 2166136261u;
	std::uint32_t heightSum = 0;
	unsigned int heightMinimum = 0;
	unsigned int heightMaximum = 0;
	int width = 0;
	int height = 0;
	if (heightMap != nullptr) {
		width = heightMap->getXExtent();
		height = heightMap->getYExtent();
		const int count = width > 0 && height > 0 ? width * height : 0;
		const UnsignedByte *data = heightMap->getDataPtr();
		if (data != nullptr && count > 0) {
			heightMinimum = data[0];
			heightMaximum = data[0];
			for (int index = 0; index < count; ++index) {
				const unsigned int value = data[index];
				heightHash = (heightHash ^ value) * 16777619u;
				heightSum += value;
				if (value < heightMinimum) heightMinimum = value;
				if (value > heightMaximum) heightMaximum = value;
			}
		}
	}

	Tool *currentTool = WbApp() != nullptr ? WbApp()->getCurTool() : nullptr;
	const bool moundToolActive =
		currentTool != nullptr &&
		dynamic_cast<MoundTool *>(currentTool) != nullptr;
	MAIN_THREAD_ASYNC_EM_ASM(({
		let state = globalThis.worldBuilderOriginalRuntimeState;
		if (!state) {
			state = { sequence: 0, events: [] };
			globalThis.worldBuilderOriginalRuntimeState = state;
		}
		const event = {
			sequence: ++state.sequence,
			kind: $0,
			message: $1 >>> 0,
			target: $2 >>> 0,
			documentAddress: $3 >>> 0,
			hasDocument: $4 !== 0,
			modified: $5 !== 0,
			heightMap: {
				width: $6,
				height: $7,
				hash: $8 >>> 0,
				sum: $9 >>> 0,
				minimum: $10 >>> 0,
				maximum: $11 >>> 0,
			},
			tool: {
				mound: $12 !== 0,
				moundWidth: $13,
				moundFeather: $14,
				moundHeight: $15,
			},
		};
		state.latest = event;
		state.events.push(event);
		if (state.events.length > 256) state.events.shift();
		}), static_cast<int>(kind), message,
		target != nullptr ? target->browserWindowId() : 0,
		static_cast<unsigned int>(
			reinterpret_cast<std::uintptr_t>(document)),
		document != nullptr ? 1 : 0,
		document != nullptr && document->IsModified() ? 1 : 0,
		width,
		height,
		heightHash,
		heightSum,
		heightMinimum,
		heightMaximum,
		moundToolActive ? 1 : 0,
		MoundTool::getWidth(),
		MoundTool::getFeather(),
		MoundTool::getMoundHeight());
}

void dispatchUiEvent(const UiEvent &event)
{
	CWnd *target = windowObject(event.window);
	if (target == nullptr) return;

	switch (event.kind) {
		case UiEventKind::Command:
			target->WindowProc(
				WM_COMMAND,
				MAKEWPARAM(event.id, CN_COMMAND),
				0);
			reportOriginalRuntimeState(target, event.kind, event.id);
			break;
		case UiEventKind::Control:
			target->WindowProc(
				WM_COMMAND,
				MAKEWPARAM(event.id, event.notification),
				static_cast<LPARAM>(event.object));
			break;
		case UiEventKind::Notify: {
			NMHDR header = {};
			header.hwndFrom = reinterpret_cast<HWND>(
				static_cast<std::uintptr_t>(event.number0));
			header.idFrom = event.id;
			header.code = static_cast<UINT>(event.notification);
			if (header.code == TVN_BEGINLABELEDIT ||
				header.code == TVN_ENDLABELEDIT) {
				TV_DISPINFO notification = {};
				notification.hdr = header;
				notification.item.hItem = reinterpret_cast<HTREEITEM>(
					static_cast<std::uintptr_t>(event.object));
				notification.item.lParam = event.parameter;
				notification.item.pszText = event.text.empty()
					? nullptr
					: const_cast<char *>(event.text.c_str());
				target->WindowProc(
					WM_NOTIFY,
					event.id,
					reinterpret_cast<LPARAM>(&notification));
			} else {
				NM_TREEVIEW notification = {};
				notification.hdr = header;
				notification.action = event.action;
				notification.itemOld.hItem = reinterpret_cast<HTREEITEM>(
					static_cast<std::uintptr_t>(event.object));
				notification.itemOld.lParam = event.parameter;
				notification.itemNew = notification.itemOld;
				notification.itemNew.pszText = event.text.empty()
					? nullptr
					: const_cast<char *>(event.text.c_str());
				target->WindowProc(
					WM_NOTIFY,
					event.id,
					reinterpret_cast<LPARAM>(&notification));
			}
			break;
		}
		case UiEventKind::WindowMessage: {
			WPARAM wParam = event.number0;
			LPARAM lParam = event.number1;
			switch (event.id) {
				case WM_SIZE:
					lParam = MAKELPARAM(event.number1, event.object);
					break;
				case WM_HSCROLL:
				case WM_VSCROLL:
					wParam = MAKEWPARAM(event.number0, event.number1);
					lParam = static_cast<LPARAM>(event.object);
					break;
				default:
					break;
			}
			target->WindowProc(event.id, wParam, lParam);
			break;
		}
		case UiEventKind::Pointer:
			WasmWin32Input::SetCursorPosition(event.screenX, event.screenY);
			target->WindowProc(
				event.id,
				event.number0,
				MAKELPARAM(
					static_cast<unsigned short>(event.x),
					static_cast<unsigned short>(event.y)));
			if (event.id != WM_MOUSEMOVE) {
				reportOriginalRuntimeState(target, event.kind, event.id);
			}
			break;
		case UiEventKind::Key:
			target->WindowProc(
				event.id,
				event.number0,
				MAKELPARAM(event.number1, event.object));
			break;
		case UiEventKind::QueryCommand: {
			CCmdUI state;
			CDocument *document = documentForWindow(target);
			BOOL handled = target->OnCmdMsg(
				event.id,
				CN_UPDATE_COMMAND_UI,
				&state,
				nullptr);
			if (!handled) {
				AFX_CMDHANDLERINFO handlerInfo;
				handled = target->OnCmdMsg(
					event.id,
					CN_COMMAND,
					nullptr,
					&handlerInfo);
				state.Enable(handled);
			}
			const unsigned int encoded =
				(handled ? 1u : 0u) |
				(state.enabled() ? 2u : 0u) |
				(state.checked() ? 4u : 0u);
			pthread_mutex_lock(&g_uiEventMutex);
			g_commandStates[commandStateKey(event.window, event.id)] = encoded;
			pthread_mutex_unlock(&g_uiEventMutex);
			MAIN_THREAD_ASYNC_EM_ASM({
				if (Module.worldBuilderMfcHost) {
					Module.worldBuilderMfcHost.commandStateUpdated(
						$0 >>> 0,
						$1 >>> 0,
						$2 >>> 0,
						$3 !== 0,
						$4 !== 0,
						$5 >>> 0,
						$6 >>> 0,
					);
				}
			}, event.window, event.id, encoded,
				document != nullptr ? 1 : 0,
				document != nullptr && document->IsModified() ? 1 : 0,
				static_cast<unsigned int>(
					reinterpret_cast<std::uintptr_t>(document)),
				event.number0);
			break;
		}
	}
}

void pumpPlatformEvents()
{
	std::deque<UiEvent> pending;
	std::deque<UiEvent> deferredQueries;
	pthread_mutex_lock(&g_uiEventMutex);
	pending.swap(g_uiEvents);
	pthread_mutex_unlock(&g_uiEventMutex);

	const auto isWindowMessage = [](const UiEvent &event, unsigned int message) {
		return event.kind == UiEventKind::WindowMessage &&
			event.id == message;
	};
	unsigned int queryCount = 0;
	constexpr unsigned int kMaximumQueriesPerPump = 8;
	for (const UiEvent &event : pending) {
		if (!isWindowMessage(event, WM_TIMER) &&
			!isWindowMessage(event, WM_PAINT)) {
			if (event.kind == UiEventKind::QueryCommand &&
				queryCount >= kMaximumQueriesPerPump) {
				deferredQueries.push_back(event);
			} else {
				dispatchUiEvent(event);
				if (event.kind == UiEventKind::QueryCommand) ++queryCount;
			}
		}
	}
	for (const UiEvent &event : pending) {
		if (isWindowMessage(event, WM_TIMER)) dispatchUiEvent(event);
	}
	for (const UiEvent &event : pending) {
		if (isWindowMessage(event, WM_PAINT)) dispatchUiEvent(event);
	}
	if (!deferredQueries.empty()) {
		pthread_mutex_lock(&g_uiEventMutex);
		for (const UiEvent &event : deferredQueries) {
			const auto newerRequest = std::find_if(
				g_uiEvents.begin(),
				g_uiEvents.end(),
				[&event](const UiEvent &queued) {
					return queued.kind == UiEventKind::QueryCommand &&
						queued.window == event.window &&
						queued.id == event.id;
				});
			if (newerRequest == g_uiEvents.end()) {
				g_uiEvents.push_back(event);
			}
		}
		pthread_cond_signal(&g_uiEventCondition);
		pthread_mutex_unlock(&g_uiEventMutex);
	}
	browser_mfc::pumpPostedMessages();
}

void runApplicationMessageLoop()
{
	while (g_applicationState.load() == ApplicationState::Running) {
		pthread_mutex_lock(&g_uiEventMutex);
		if (g_uiEvents.empty()) {
			timespec deadline = {};
			clock_gettime(CLOCK_REALTIME, &deadline);
			deadline.tv_nsec += 16 * 1000 * 1000;
			if (deadline.tv_nsec >= 1000 * 1000 * 1000) {
				deadline.tv_sec += 1;
				deadline.tv_nsec -= 1000 * 1000 * 1000;
			}
			pthread_cond_timedwait(
				&g_uiEventCondition,
				&g_uiEventMutex,
				&deadline);
		}
		pthread_mutex_unlock(&g_uiEventMutex);
		pumpPlatformEvents();
	}
}

void *runWorldBuilder(void *)
{
	try {
		CWinApp *application = AfxGetApp();
		if (application == nullptr) {
			g_applicationState.store(ApplicationState::Failed);
			reportStartupResult(
				false,
				"The original World Builder application object is missing");
			return nullptr;
		}
		cnc_port_d3d8_set_present_bridge(1);
		if (!application->InitInstance()) {
			g_applicationState.store(ApplicationState::Failed);
			reportStartupResult(
				false,
				"Original World Builder startup was cancelled or failed");
			return nullptr;
		}
		g_applicationState.store(ApplicationState::Running);
		reportStartupResult(true, "Original World Builder is running");
		// This pthread owns the original application and its MFC objects. Keep
		// their message pump on that thread, independent of graphics cadence.
		runApplicationMessageLoop();
	} catch (const std::exception &error) {
		g_applicationState.store(ApplicationState::Failed);
		reportStartupResult(false, error.what());
	} catch (...) {
		g_applicationState.store(ApplicationState::Failed);
		reportStartupResult(
			false,
			"Original World Builder startup failed with an unknown error");
	}
	return nullptr;
}

}

extern "C" {

// Called by the nested CDialog::DoModal loop on the World Builder pthread.
void BrowserMfcPumpPlatformEvents()
{
	pumpPlatformEvents();
}

int BrowserWorldBuilderPlaySound(const char *filename, unsigned int flags)
{
	if (filename == nullptr || *filename == '\0' || TheFileSystem == nullptr) {
		return 0;
	}

	File *file = TheFileSystem->openFile(filename, File::READ | File::BINARY);
	if (file == nullptr) return 0;

	const int byteCount = file->size();
	if (byteCount <= 0) {
		file->close();
		return 0;
	}

	char *bytes = file->readEntireAndClose();
	if (bytes == nullptr) return 0;
	MAIN_THREAD_EM_ASM({
		const payload = HEAPU8.slice($0, $0 + $1);
		Module.worldBuilderMfcHost.playSoundBytes(
			payload,
			UTF8ToString($2),
			$3 >>> 0,
		);
	}, bytes, byteCount, filename, flags);
	delete[] bytes;
	return 1;
}

EMSCRIPTEN_KEEPALIVE
int BrowserWorldBuilderStart()
{
	ApplicationState expected = ApplicationState::Idle;
	if (!g_applicationState.compare_exchange_strong(
			expected, ApplicationState::Starting)) {
		return -1;
	}

	pthread_t thread;
	pthread_attr_t attributes;
	pthread_attr_init(&attributes);
	pthread_attr_setdetachstate(&attributes, PTHREAD_CREATE_DETACHED);
	const int result = pthread_create(
		&thread,
		&attributes,
		runWorldBuilder,
		nullptr);
	pthread_attr_destroy(&attributes);
	if (result != 0) {
		g_applicationState.store(ApplicationState::Failed);
		reportStartupResult(false, "Could not start the World Builder worker");
	}
	return result;
}

EMSCRIPTEN_KEEPALIVE
int BrowserWorldBuilderState()
{
	return static_cast<int>(g_applicationState.load());
}

EMSCRIPTEN_KEEPALIVE
int BrowserWorldBuilderTakeFramePresentationPermit()
{
	unsigned int available = 1;
	return g_framePresentationPermit.compare_exchange_strong(available, 0)
		? 1
		: 0;
}

EMSCRIPTEN_KEEPALIVE
void BrowserWorldBuilderReleaseFramePresentationPermit()
{
	g_framePresentationPermit.store(1);
}

EMSCRIPTEN_KEEPALIVE
int BrowserMfcDispatchCommand(unsigned int window, unsigned int command)
{
	return enqueueUiEvent({
		UiEventKind::Command,
		window,
		command,
	}) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int BrowserMfcDispatchControl(
	unsigned int parent,
	unsigned int control,
	unsigned int notification,
	unsigned int child)
{
	UiEvent event;
	event.kind = UiEventKind::Control;
	event.window = parent;
	event.id = control;
	event.notification = static_cast<int>(notification);
	event.object = child;
	return enqueueUiEvent(event) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int BrowserMfcDispatchNotify(
	unsigned int parent,
	unsigned int control,
	int notificationCode,
	unsigned int child,
	unsigned int treeItem,
	int itemParameter,
	unsigned int action,
	const char *text)
{
	UiEvent event;
	event.kind = UiEventKind::Notify;
	event.window = parent;
	event.id = control;
	event.notification = notificationCode;
	event.number0 = child;
	event.object = treeItem;
	event.parameter = itemParameter;
	event.action = action;
	event.text = text ? text : "";
	return enqueueUiEvent(event) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int BrowserMfcDispatchWindowMessage(
	unsigned int window,
	unsigned int message,
	unsigned int number0,
	unsigned int number1,
	unsigned int object)
{
	UiEvent event;
	event.kind = UiEventKind::WindowMessage;
	event.window = window;
	event.id = message;
	event.number0 = number0;
	event.number1 = number1;
	event.object = object;
	return enqueueUiEvent(event) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int BrowserMfcDispatchPointer(
	unsigned int window,
	unsigned int message,
	unsigned int flags,
	int x,
	int y,
	int screenX,
	int screenY)
{
	UiEvent event;
	event.kind = UiEventKind::Pointer;
	event.window = window;
	event.id = message;
	event.number0 = flags;
	event.x = x;
	event.y = y;
	event.screenX = screenX;
	event.screenY = screenY;
	return enqueueUiEvent(event) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int BrowserMfcDispatchKey(
	unsigned int window,
	unsigned int message,
	unsigned int key,
	unsigned int repetitions,
	unsigned int flags)
{
	UiEvent event;
	event.kind = UiEventKind::Key;
	event.window = window;
	event.id = message;
	event.number0 = key;
	event.number1 = repetitions;
	event.object = flags;
	return enqueueUiEvent(event) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
unsigned int BrowserMfcUpdateCommandUi(
	unsigned int window,
	unsigned int command,
	unsigned int requestToken)
{
	const std::uint64_t key = commandStateKey(window, command);
	pthread_mutex_lock(&g_uiEventMutex);
	const auto found = g_commandStates.find(key);
	const unsigned int state =
		found != g_commandStates.end() ? found->second : 0u;
	pthread_mutex_unlock(&g_uiEventMutex);

	UiEvent event;
	event.kind = UiEventKind::QueryCommand;
	event.window = window;
	event.id = command;
	event.number0 = requestToken;
	enqueueUiEvent(event);
	return state;
}

EMSCRIPTEN_KEEPALIVE
void BrowserMfcPumpMessages()
{
	// Browser events are queued for the original application's pthread. The
	// browser main thread must never invoke original MFC handlers directly.
	pthread_cond_signal(&g_uiEventCondition);
}

}

int main()
{
	try {
		BrowserMfcInstallDomHost();
		reportStartupProgress(
			"Original World Builder runtime ready; preparing the game library");
		return 0;
	} catch (const std::exception &error) {
		g_applicationState.store(ApplicationState::Failed);
		reportStartupResult(false, error.what());
		return 1;
	} catch (...) {
		g_applicationState.store(ApplicationState::Failed);
		reportStartupResult(
			false,
			"World Builder browser platform initialization failed");
		return 2;
	}
}
