#include "mfc/browser_mfc.h"
#include "d3dx8.h"

#include <emscripten/threading.h>

#include <cstring>
#include <deque>

extern "C" void BrowserWorldBuilderSetRecentFiles(const char *paths);

namespace {

#if defined(__EMSCRIPTEN_PTHREADS__)
extern "C" void BrowserMfcPumpPlatformEvents() __attribute__((weak));
#endif

browser_mfc::Host *activeHost = nullptr;
CWinApp *activeApplication = nullptr;
std::unordered_map<browser_mfc::WindowId, CWnd *> windowObjects;
CWnd desktopWindow(1);

struct PostedMessage {
	CWnd *target = nullptr;
	browser_mfc::WindowId window = 0;
	UINT message = 0;
	WPARAM wParam = 0;
	LPARAM lParam = 0;
};

std::deque<PostedMessage> postedMessages;
std::vector<CString> recentFiles;
UINT maximumRecentFiles = 4;

void publishRecentFiles()
{
	std::string payload;
	for (const CString &path : recentFiles) {
		if (!payload.empty()) payload.push_back('\n');
		payload += path.GetString();
	}
	BrowserWorldBuilderSetRecentFiles(payload.c_str());
}

int recentFileIndex(UINT commandId)
{
	return commandId >= ID_FILE_MRU_FILE1 &&
		commandId <= ID_FILE_MRU_FILE16
		? static_cast<int>(commandId - ID_FILE_MRU_FILE1)
		: -1;
}

class BrowserD3DXFont final : public ID3DXFont {
public:
	BrowserD3DXFont(IDirect3DDevice8 *device, const LOGFONT &font) :
		m_device(device),
		m_font(font)
	{
		m_device->AddRef();
	}

	int DrawText(
		LPCSTR text,
		int count,
		RECT *rect,
		DWORD format,
		D3DCOLOR color) override
	{
		if (text == nullptr || rect == nullptr) return 0;
		const int actualCount = count < 0
			? static_cast<int>(std::strlen(text))
			: count;
		return browser_mfc::host().drawText(
			0,
			std::string(text, static_cast<std::size_t>(actualCount)),
			CRect(*rect),
			static_cast<UINT>(format),
			static_cast<DWORD>(color),
			true,
			true,
			0,
			&m_font);
	}

	ULONG AddRef() override
	{
		return ++m_referenceCount;
	}

	ULONG Release() override
	{
		const ULONG remaining = --m_referenceCount;
		if (remaining == 0) delete this;
		return remaining;
	}

private:
	~BrowserD3DXFont() override
	{
		m_device->Release();
	}

	IDirect3DDevice8 *m_device = nullptr;
	LOGFONT m_font;
	ULONG m_referenceCount = 1;
};

[[noreturn]] void missingHost()
{
	throw std::runtime_error("The browser MFC host is not installed");
}

}

HRESULT BrowserMfcD3DXCreateFont(
	IDirect3DDevice8 *device,
	const LOGFONT *font,
	ID3DXFont **result)
{
	if (result == nullptr) return E_FAIL;
	*result = nullptr;
	if (device == nullptr || font == nullptr) return E_FAIL;
	auto *created = new (std::nothrow) BrowserD3DXFont(device, *font);
	if (created == nullptr) return E_FAIL;
	*result = created;
	return D3D_OK;
}

CWnd CWnd::wndTopMost((std::numeric_limits<browser_mfc::WindowId>::max)());

namespace browser_mfc {

void setHost(Host *host)
{
	activeHost = host;
}

Host &host()
{
	if (activeHost == nullptr) missingHost();
	return *activeHost;
}

void postMessage(
	CWnd &target,
	WindowId window,
	UINT message,
	WPARAM wParam,
	LPARAM lParam)
{
	postedMessages.push_back({&target, window, message, wParam, lParam});
}

void pumpPostedMessages()
{
	while (!postedMessages.empty()) {
		const PostedMessage posted = postedMessages.front();
		postedMessages.pop_front();

		if (posted.target != nullptr) {
			posted.target->WindowProc(
				posted.message,
				posted.wParam,
				posted.lParam);
		}
	}
}

int runModalLoop(int &modalResult)
{
#if defined(__EMSCRIPTEN_PTHREADS__)
	while (modalResult == 0) {
		if (BrowserMfcPumpPlatformEvents != nullptr) {
			BrowserMfcPumpPlatformEvents();
		}
		pumpPostedMessages();
		emscripten_thread_sleep(1);
	}
#endif
	return modalResult;
}

void registerWindowObject(WindowId window, CWnd *object)
{
	if (window != 0 && object != nullptr) windowObjects[window] = object;
}

void unregisterWindowObject(WindowId window, CWnd *object)
{
	const auto found = windowObjects.find(window);
	if (found != windowObjects.end() && found->second == object) {
		windowObjects.erase(found);
	}
}

CWnd *findWindowObject(WindowId window)
{
	const auto found = windowObjects.find(window);
	return found == windowObjects.end() ? nullptr : found->second;
}

[[noreturn]] void failUnsupported(const char *operation)
{
	throw UnsupportedOperation(std::string(operation) + " is not implemented by the browser MFC host");
}

}

const browser_mfc::MessageMap &browser_mfc::MessageTarget::browserStaticMessageMap()
{
	static const browser_mfc::MessageMap map;
	return map;
}

const browser_mfc::MessageMap &browser_mfc::MessageTarget::browserMessageMap() const
{
	return browserStaticMessageMap();
}

bool browser_mfc::MessageTarget::browserDispatchMessage(browser_mfc::Message &message)
{
	const browser_mfc::MessageMap *map = &browserMessageMap();
	while (map != nullptr) {
		for (std::size_t index = 0; index < map->entryCount; ++index) {
			const browser_mfc::MessageEntry &entry = map->entries[index];
			if (entry.kind != message.kind ||
				message.id < entry.firstId ||
				message.id > entry.lastId) {
				continue;
			}
			if ((message.kind == browser_mfc::MessageKind::Control ||
					message.kind == browser_mfc::MessageKind::Notify) &&
				entry.notification != message.notification) {
				continue;
			}
			return entry.handler != nullptr && entry.handler(*this, message);
		}
		map = map->baseMap == nullptr ? nullptr : &map->baseMap();
	}
	return false;
}

bool browser_mfc::MessageTarget::browserCanDispatchMessage(
	const browser_mfc::Message &message) const
{
	const browser_mfc::MessageMap *map = &browserMessageMap();
	while (map != nullptr) {
		for (std::size_t index = 0; index < map->entryCount; ++index) {
			const browser_mfc::MessageEntry &entry = map->entries[index];
			if (entry.kind != message.kind ||
				message.id < entry.firstId ||
				message.id > entry.lastId) {
				continue;
			}
			if ((message.kind == browser_mfc::MessageKind::Control ||
					message.kind == browser_mfc::MessageKind::Notify) &&
				entry.notification != message.notification) {
				continue;
			}
			return entry.handler != nullptr;
		}
		map = map->baseMap == nullptr ? nullptr : &map->baseMap();
	}
	return false;
}

BOOL CString::LoadString(UINT resourceId)
{
	*this = browser_mfc::host().loadString(resourceId);
	return TRUE;
}

void CString::Format(UINT formatResourceId, ...)
{
	const std::string format = browser_mfc::host().loadString(formatResourceId);
	va_list arguments;
	va_start(arguments, formatResourceId);
	formatV(format.c_str(), arguments);
	va_end(arguments);
}

CWnd *CWnd::GetDlgItem(int controlId)
{
	const auto existing = m_childObjects.find(controlId);
	if (existing != m_childObjects.end()) return existing->second;
	const auto childId = browser_mfc::host().findControl(
		browserWindowId(),
		static_cast<UINT>(controlId));
	if (childId == 0) return nullptr;
	std::unique_ptr<CWnd> child;
	switch (browser_mfc::host().controlKind(childId)) {
		case browser_mfc::ControlKind::Button:
			child = std::make_unique<CButton>();
			break;
		case browser_mfc::ControlKind::Edit:
			child = std::make_unique<CEdit>();
			break;
		case browser_mfc::ControlKind::RichEdit:
			child = std::make_unique<CRichEditCtrl>();
			break;
		case browser_mfc::ControlKind::Static:
			child = std::make_unique<CStatic>();
			break;
		case browser_mfc::ControlKind::ComboBox:
			child = std::make_unique<CComboBox>();
			break;
		case browser_mfc::ControlKind::ListBox:
			child = std::make_unique<CListBox>();
			break;
		case browser_mfc::ControlKind::ListControl:
			child = std::make_unique<CListCtrl>();
			break;
		case browser_mfc::ControlKind::TreeControl:
			child = std::make_unique<CTreeCtrl>();
			break;
		case browser_mfc::ControlKind::Slider:
			child = std::make_unique<CSliderCtrl>();
			break;
		case browser_mfc::ControlKind::ScrollBar:
			child = std::make_unique<CScrollBar>();
			break;
		case browser_mfc::ControlKind::Progress:
			child = std::make_unique<CProgressCtrl>();
			break;
		case browser_mfc::ControlKind::StatusBar:
			child = std::make_unique<CStatusBar>();
			break;
		case browser_mfc::ControlKind::ToolBar:
			child = std::make_unique<CToolBar>();
			break;
		case browser_mfc::ControlKind::Generic:
			child = std::make_unique<CWnd>();
			break;
	}
	child->attachBrowserWindow(childId, this, static_cast<UINT>(controlId));
	CWnd *result = child.get();
	m_ownedChildren.push_back(std::move(child));
	return result;
}

void CWnd::GetWindowText(CString &value) const
{
	value = browser_mfc::host().getWindowText(browserWindowId());
}

int CWnd::GetWindowText(char *buffer, int maximum) const
{
	if (buffer == nullptr || maximum <= 0) return 0;
	const std::string value = browser_mfc::host().getWindowText(browserWindowId());
	const auto count = std::min(value.size(), static_cast<std::size_t>(maximum - 1));
	std::memcpy(buffer, value.data(), count);
	buffer[count] = '\0';
	return static_cast<int>(count);
}

void CWnd::SetWindowText(LPCTSTR value)
{
	browser_mfc::host().setWindowText(browserWindowId(), value ? value : "");
}

void CWnd::ScreenToClient(RECT *rect) const
{
	if (rect == nullptr) return;
	POINT topLeft = {rect->left, rect->top};
	POINT bottomRight = {rect->right, rect->bottom};
	browser_mfc::host().screenToClient(browserWindowId(), topLeft);
	browser_mfc::host().screenToClient(browserWindowId(), bottomRight);
	rect->left = topLeft.x;
	rect->top = topLeft.y;
	rect->right = bottomRight.x;
	rect->bottom = bottomRight.y;
}

void CWnd::ScreenToClient(POINT *point) const
{
	if (point != nullptr) browser_mfc::host().screenToClient(browserWindowId(), *point);
}

void CWnd::ClientToScreen(RECT *rect) const
{
	if (rect == nullptr) return;
	POINT topLeft = {rect->left, rect->top};
	POINT bottomRight = {rect->right, rect->bottom};
	browser_mfc::host().clientToScreen(browserWindowId(), topLeft);
	browser_mfc::host().clientToScreen(browserWindowId(), bottomRight);
	rect->left = topLeft.x;
	rect->top = topLeft.y;
	rect->right = bottomRight.x;
	rect->bottom = bottomRight.y;
}

void CWnd::ClientToScreen(POINT *point) const
{
	if (point != nullptr) browser_mfc::host().clientToScreen(browserWindowId(), *point);
}

LRESULT CWnd::WindowProc(UINT nativeMessage, WPARAM wParam, LPARAM lParam)
{
	if (nativeMessage == WM_COMMAND) {
		if (OnCommand(wParam, lParam)) return 1;
		return browser_mfc::host().deliverNativeMessage(
			browserWindowId(), nativeMessage, wParam, lParam);
	}
	if (nativeMessage == WM_NOTIFY) {
		LRESULT result = 0;
		if (OnNotify(wParam, lParam, &result)) return result;
		return browser_mfc::host().deliverNativeMessage(
			browserWindowId(), nativeMessage, wParam, lParam);
	}

	browser_mfc::Message message;
	message.kind = browser_mfc::MessageKind::Window;
	message.id = nativeMessage;
	message.uint0 = static_cast<UINT>(wParam);
	message.payload = reinterpret_cast<void *>(lParam);

	switch (nativeMessage) {
		case WM_KEYDOWN:
		case WM_KEYUP:
			message.uint1 = static_cast<UINT>(lParam & 0xffff);
			message.uint2 = static_cast<UINT>(
				(static_cast<std::uintptr_t>(lParam) >> 16) & 0xffff);
			break;
		case WM_MOVE:
			message.int0 = static_cast<SHORT>(LOWORD(lParam));
			message.int1 = static_cast<SHORT>(HIWORD(lParam));
			break;
		case WM_MOUSEMOVE:
		case WM_LBUTTONDOWN:
		case WM_LBUTTONUP:
		case WM_MBUTTONDOWN:
		case WM_MBUTTONUP:
		case WM_RBUTTONDOWN:
		case WM_RBUTTONUP:
			message.uint0 = static_cast<UINT>(wParam);
			message.point = CPoint(
				static_cast<SHORT>(LOWORD(lParam)),
				static_cast<SHORT>(HIWORD(lParam)));
			break;
		case WM_MOUSEWHEEL:
			message.uint0 = LOWORD(wParam);
			message.short0 = static_cast<SHORT>(HIWORD(wParam));
			message.point = CPoint(
				static_cast<SHORT>(LOWORD(lParam)),
				static_cast<SHORT>(HIWORD(lParam)));
			break;
		case WM_HSCROLL:
		case WM_VSCROLL:
			message.uint0 = LOWORD(wParam);
			message.uint1 = HIWORD(wParam);
			message.object = browser_mfc::findWindowObject(
				static_cast<browser_mfc::WindowId>(
					static_cast<std::uintptr_t>(lParam)));
			break;
		case WM_SHOWWINDOW:
			message.bool0 = wParam != 0 ? TRUE : FALSE;
			message.uint0 = static_cast<UINT>(lParam);
			break;
		case WM_SIZE:
			message.int0 = static_cast<int>(LOWORD(lParam));
			message.int1 = static_cast<int>(HIWORD(lParam));
			break;
		case WM_TIMER:
			message.uint0 = static_cast<UINT>(wParam);
			break;
		default:
			break;
	}

	if (browserDispatchMessage(message)) return message.result;
	if (nativeMessage == WM_CLOSE) {
		OnClose();
		return 0;
	}
	return browser_mfc::host().deliverNativeMessage(
		browserWindowId(),
		nativeMessage,
		wParam,
		lParam);
}

BOOL CWnd::OnCommand(WPARAM wParam, LPARAM lParam)
{
	if (lParam == 0) {
		return OnCmdMsg(
			LOWORD(wParam),
			CN_COMMAND,
			nullptr,
			nullptr);
	}
	browser_mfc::Message message;
	message.kind = browser_mfc::MessageKind::Control;
	message.id = LOWORD(wParam);
	message.notification = HIWORD(wParam);
	message.payload = reinterpret_cast<void *>(lParam);
	return browserDispatchMessage(message) ? TRUE : FALSE;
}

BOOL CWnd::OnNotify(WPARAM wParam, LPARAM lParam, LRESULT *result)
{
	const auto *header = reinterpret_cast<const NMHDR *>(lParam);
	if (header == nullptr) return FALSE;
	browser_mfc::Message message;
	message.kind = browser_mfc::MessageKind::Notify;
	message.id = static_cast<UINT>(wParam);
	message.notification = header->code;
	message.payload = reinterpret_cast<void *>(lParam);
	const bool handled = browserDispatchMessage(message);
	if (handled && result != nullptr) *result = message.result;
	return handled ? TRUE : FALSE;
}

CWnd *CWnd::SetFocus()
{
	browser_mfc::host().setFocus(browserWindowId());
	return this;
}

CWnd *CWnd::GetDesktopWindow()
{
	return &desktopWindow;
}

BOOL CWnd::ShowWindow(int command)
{
	const BOOL previous =
		browser_mfc::host().showWindow(browserWindowId(), command) ? TRUE : FALSE;
	WindowProc(WM_SHOWWINDOW, command == SW_HIDE ? FALSE : TRUE, 0);
	return previous;
}

CDC *CWnd::GetDC()
{
	return new CClientDC(this);
}

int CWnd::ReleaseDC(CDC *deviceContext)
{
	if (deviceContext == nullptr) return 0;
	delete deviceContext;
	return 1;
}

BOOL CWnd::DestroyWindow()
{
	const auto window = browserWindowId();
	postedMessages.erase(
		std::remove_if(
			postedMessages.begin(),
			postedMessages.end(),
			[window](const PostedMessage &message) {
				return message.window == window;
			}),
		postedMessages.end());
	WindowProc(WM_DESTROY, 0, 0);
	const BOOL destroyed =
		browser_mfc::host().destroyWindow(window) ? TRUE : FALSE;
	if (destroyed) PostNcDestroy();
	return destroyed;
}

BOOL CWnd::EnableWindow(BOOL enabled)
{
	const BOOL previous = IsWindowEnabled();
	browser_mfc::host().setEnabled(browserWindowId(), enabled != FALSE);
	return previous;
}

void CWnd::GetClientRect(RECT *rect) const
{
	if (rect != nullptr) *rect = browser_mfc::host().clientRect(browserWindowId());
}

void CWnd::GetWindowRect(RECT *rect) const
{
	if (rect != nullptr) *rect = browser_mfc::host().windowRect(browserWindowId());
}

int CWnd::MessageBox(LPCTSTR text, LPCTSTR, UINT type)
{
	return AfxMessageBox(text, type);
}

CDialog::CDialog(UINT resourceId, CWnd *parent) :
	m_resourceId(resourceId),
	m_parent(parent)
{}

CDialog::~CDialog()
{
	if (browserWindowId() != 0) {
		browser_mfc::host().destroyWindow(browserWindowId());
	}
}

BOOL CDialog::Create(UINT resourceId, CWnd *parent)
{
	m_resourceId = resourceId;
	m_parent = parent;
	const auto parentId = parent ? parent->browserWindowId() : 0;
	attachBrowserWindow(
		browser_mfc::host().createDialog(resourceId, parentId),
		parent);
	if (browserWindowId() == 0) return FALSE;
	return OnInitDialog();
}

BOOL CDialog::OnCommand(WPARAM wParam, LPARAM lParam)
{
	if (CWnd::OnCommand(wParam, lParam)) return TRUE;
	if (lParam != 0 && HIWORD(wParam) == BN_CLICKED) {
		switch (LOWORD(wParam)) {
			case IDOK:
				OnOK();
				return TRUE;
			case IDCANCEL:
				OnCancel();
				return TRUE;
			default:
				break;
		}
	}
	return FALSE;
}

void CDialog::OnOK()
{
	m_modalResult = IDOK;
	browser_mfc::host().closeDialog(browserWindowId(), m_modalResult);
}

void CDialog::OnCancel()
{
	m_modalResult = IDCANCEL;
	browser_mfc::host().closeDialog(browserWindowId(), m_modalResult);
}

INT_PTR CDialog::DoModal()
{
	if (browserWindowId() == 0) {
		const auto parentId = m_parent ? m_parent->browserWindowId() : 0;
		attachBrowserWindow(
			browser_mfc::host().createDialog(m_resourceId, parentId),
			m_parent);
	}
	OnInitDialog();
	const int requestedResult = browser_mfc::host().runModal(browserWindowId());
	if (m_modalResult != 0) return m_modalResult;
#if defined(__EMSCRIPTEN_PTHREADS__)
	browser_mfc::runModalLoop(m_modalResult);
#else
	if (requestedResult == IDOK) {
		OnOK();
	} else {
		OnCancel();
	}
#endif
	return m_modalResult;
}

namespace {

constexpr UINT kPropertyPageCommandBase = 0xe900;

}

BOOL CPropertySheet::activatePage(std::size_t pageIndex)
{
	if (pageIndex >= m_pages.size()) return FALSE;
	if (pageIndex == m_activePage) return TRUE;
	if (!m_pages[m_activePage]->OnKillActive()) return FALSE;
	if (!m_pages[pageIndex]->OnSetActive()) {
		m_pages[m_activePage]->OnSetActive();
		return FALSE;
	}
	m_activePage = pageIndex;
	browser_mfc::host().selectPropertyPage(
		browserWindowId(),
		static_cast<unsigned int>(pageIndex));
	return TRUE;
}

BOOL CPropertySheet::applyPages()
{
	if (!m_pages.empty() && !m_pages[m_activePage]->OnKillActive()) return FALSE;
	for (std::size_t index = 0; index < m_pages.size(); ++index) {
		if (!m_pages[index]->OnApply()) {
			m_activePage = index;
			m_pages[index]->OnSetActive();
			browser_mfc::host().selectPropertyPage(
				browserWindowId(),
				static_cast<unsigned int>(index));
			return FALSE;
		}
	}
	return TRUE;
}

BOOL CPropertySheet::OnCommand(WPARAM wParam, LPARAM lParam)
{
	const UINT command = LOWORD(wParam);
	if (command == IDOK) {
		if (!applyPages()) return TRUE;
		m_modalResult = IDOK;
		browser_mfc::host().closeDialog(browserWindowId(), m_modalResult);
		return TRUE;
	}
	if (command == IDCANCEL) {
		m_modalResult = IDCANCEL;
		browser_mfc::host().closeDialog(browserWindowId(), m_modalResult);
		return TRUE;
	}
	if (command >= kPropertyPageCommandBase &&
		command < kPropertyPageCommandBase + m_pages.size()) {
		activatePage(command - kPropertyPageCommandBase);
		return TRUE;
	}
	return CWnd::OnCommand(wParam, lParam);
}

INT_PTR CPropertySheet::DoModal()
{
	if (browserWindowId() == 0) {
		attachBrowserWindow(
			browser_mfc::host().createPropertySheet(
				m_caption,
				m_parent ? m_parent->browserWindowId() : 0),
			m_parent);
	}
	if (browserWindowId() == 0 || m_pages.empty()) return IDCANCEL;
	for (CPropertyPage *page : m_pages) {
		if (!page->Create(page->browserResourceId(), this)) return IDCANCEL;
		browser_mfc::host().addPropertyPage(
			browserWindowId(),
			page->browserWindowId(),
			page->browserResourceId());
	}
	m_activePage = 0;
	if (!m_pages.front()->OnSetActive()) return IDCANCEL;
	browser_mfc::host().selectPropertyPage(browserWindowId(), 0);
	const int requestedResult = browser_mfc::host().runModal(browserWindowId());
#if defined(__EMSCRIPTEN_PTHREADS__)
	browser_mfc::runModalLoop(m_modalResult);
#else
	if (requestedResult == IDOK) {
		if (applyPages()) m_modalResult = IDOK;
	} else {
		m_modalResult = requestedResult != 0 ? requestedResult : IDCANCEL;
	}
#endif
	return m_modalResult;
}

void AfxLoadRecentFileList(UINT maxRecentFiles)
{
	maximumRecentFiles = std::min<UINT>(maxRecentFiles, 16);
	recentFiles.clear();
	for (UINT index = 0; index < maximumRecentFiles; ++index) {
		const std::string entry = "File" + std::to_string(index + 1);
		const std::string path = browser_mfc::host().readProfileString(
			"Recent File List",
			entry,
			"");
		if (path.empty() ||
			GetFileAttributes(path.c_str()) == INVALID_FILE_ATTRIBUTES) {
			continue;
		}
		recentFiles.emplace_back(path);
	}
	publishRecentFiles();
}

void AfxRememberRecentFile(LPCTSTR path)
{
	if (path == nullptr || *path == '\0' || maximumRecentFiles == 0) return;
	CString remembered(path);
	recentFiles.erase(
		std::remove_if(
			recentFiles.begin(),
			recentFiles.end(),
			[&remembered](const CString &candidate) {
				return candidate.CompareNoCase(remembered) == 0;
			}),
		recentFiles.end());
	recentFiles.insert(recentFiles.begin(), remembered);
	if (recentFiles.size() > maximumRecentFiles) {
		recentFiles.resize(maximumRecentFiles);
	}
	for (UINT index = 0; index < maximumRecentFiles; ++index) {
		const std::string entry = "File" + std::to_string(index + 1);
		browser_mfc::host().writeProfileString(
			"Recent File List",
			entry,
			index < recentFiles.size()
				? recentFiles[index].GetString()
				: "");
	}
	publishRecentFiles();
}

CWinApp::CWinApp()
{
	if (activeApplication != nullptr) {
		throw std::runtime_error("Only one CWinApp can own the browser MFC realm");
	}
	activeApplication = this;
	char *profileName = static_cast<char *>(std::malloc(1));
	if (profileName == nullptr) throw std::bad_alloc();
	profileName[0] = '\0';
	m_pszProfileName = profileName;
}

BOOL CDocument::OnCmdMsg(
	UINT commandId,
	int notificationCode,
	void *extra,
	AFX_CMDHANDLERINFO *handlerInfo)
{
	browser_mfc::Message message;
	message.kind = notificationCode == CN_UPDATE_COMMAND_UI
		? browser_mfc::MessageKind::CommandUpdate
		: browser_mfc::MessageKind::Command;
	message.id = commandId;
	message.notification = static_cast<UINT>(notificationCode);
	message.payload = extra;
	if (handlerInfo != nullptr) {
		if (browserCanDispatchMessage(message)) return TRUE;
		if (notificationCode != CN_COMMAND) return FALSE;
		return commandId == ID_FILE_SAVE ||
			commandId == ID_FILE_SAVE_AS ||
			commandId == ID_FILE_CLOSE;
	}
	if (browserDispatchMessage(message)) return TRUE;

	if (notificationCode == CN_UPDATE_COMMAND_UI && extra != nullptr) {
		auto *command = static_cast<CCmdUI *>(extra);
		switch (commandId) {
			case ID_FILE_SAVE:
				command->Enable(IsModified());
				return TRUE;
			case ID_FILE_SAVE_AS:
			case ID_FILE_CLOSE:
				command->Enable(TRUE);
				return TRUE;
			default:
				break;
		}
	}

	if (notificationCode != CN_COMMAND) return FALSE;
	switch (commandId) {
		case ID_FILE_SAVE:
			DoFileSave();
			return TRUE;
		case ID_FILE_SAVE_AS:
			DoSave(nullptr, TRUE);
			return TRUE;
		case ID_FILE_CLOSE: {
			if (!SaveModified()) return TRUE;
			std::vector<CFrameWnd *> frames;
			for (CView *view : m_views) {
				CFrameWnd *frame = view ? view->GetParentFrame() : nullptr;
				if (frame != nullptr &&
					std::find(frames.begin(), frames.end(), frame) == frames.end()) {
					frames.push_back(frame);
				}
			}
			for (CFrameWnd *frame : frames) frame->DestroyWindow();
			return TRUE;
		}
		default:
			return FALSE;
	}
}

BOOL CWinApp::OnCmdMsg(
	UINT commandId,
	int notificationCode,
	void *extra,
	AFX_CMDHANDLERINFO *handlerInfo)
{
	browser_mfc::Message message;
	message.kind = notificationCode == CN_UPDATE_COMMAND_UI
		? browser_mfc::MessageKind::CommandUpdate
		: browser_mfc::MessageKind::Command;
	message.id = commandId;
	message.notification = static_cast<UINT>(notificationCode);
	message.payload = extra;
	const int recentIndex = recentFileIndex(commandId);
	if (handlerInfo != nullptr) {
		if (browserCanDispatchMessage(message)) return TRUE;
		return notificationCode == CN_COMMAND &&
			(commandId == ID_APP_EXIT ||
				(recentIndex >= 0 &&
					static_cast<UINT>(recentIndex) < maximumRecentFiles));
	}
	if (browserDispatchMessage(message)) return TRUE;
	if (notificationCode == CN_UPDATE_COMMAND_UI &&
		recentIndex >= 0 &&
		static_cast<UINT>(recentIndex) < maximumRecentFiles &&
		extra != nullptr) {
		static_cast<CCmdUI *>(extra)->Enable(
			static_cast<std::size_t>(recentIndex) < recentFiles.size());
		return TRUE;
	}
	if (notificationCode == CN_COMMAND &&
		recentIndex >= 0 &&
		static_cast<std::size_t>(recentIndex) < recentFiles.size()) {
		const CString path = recentFiles[recentIndex];
		OpenDocumentFile(path);
		return TRUE;
	}
	if (notificationCode == CN_COMMAND && commandId == ID_APP_EXIT) {
		if (m_pMainWnd != nullptr) m_pMainWnd->SendMessage(WM_CLOSE);
		return TRUE;
	}
	return FALSE;
}

CWinApp::~CWinApp()
{
	for (CDocTemplate *documentTemplate : m_documentTemplates) {
		delete documentTemplate;
	}
	m_documentTemplates.clear();
	std::free(const_cast<char *>(m_pszProfileName));
	m_pszProfileName = nullptr;
	if (activeApplication == this) activeApplication = nullptr;
}

void CWinApp::ParseCommandLine(CCommandLineInfo &commandLine)
{
	const std::string launchPath = browser_mfc::host().launchDocumentPath();
	if (launchPath.empty()) {
		commandLine.m_nShellCommand = CCommandLineInfo::FileNew;
		commandLine.m_strFileName.Empty();
	} else {
		commandLine.m_nShellCommand = CCommandLineInfo::FileOpen;
		commandLine.m_strFileName = launchPath;
	}
}

BOOL CWinApp::ProcessShellCommand(CCommandLineInfo &commandLine)
{
	switch (commandLine.m_nShellCommand) {
		case CCommandLineInfo::FileNew:
			return OpenDocumentFile(nullptr) != nullptr ? TRUE : FALSE;
		case CCommandLineInfo::FileOpen:
			return OpenDocumentFile(commandLine.m_strFileName) != nullptr ? TRUE : FALSE;
		case CCommandLineInfo::FileNothing:
			return TRUE;
	}
	return FALSE;
}

CDocument *CWinApp::OpenDocumentFile(LPCTSTR filename)
{
	if (m_documentTemplates.empty()) return nullptr;
	CFrameWnd *frame = nullptr;
	CDocument *document =
		m_documentTemplates.front()->OpenDocumentFile(filename, &frame);
	if (document != nullptr && frame != nullptr) m_pMainWnd = frame;
	return document;
}

void CWinApp::OnFileNew()
{
	OpenDocumentFile(nullptr);
}

void CWinApp::OnFileOpen()
{
	CFileDialog dialog(
		TRUE,
		".map",
		nullptr,
		OFN_HIDEREADONLY,
		"Command & Conquer maps (*.map)|*.map||",
		m_pMainWnd);
	if (dialog.DoModal() == IDOK) OpenDocumentFile(dialog.GetPathName());
}

void CWinApp::OnFilePrintSetup()
{
	if (m_pMainWnd != nullptr) {
		browser_mfc::host().printWindow(m_pMainWnd->browserWindowId(), false);
	}
}

CWinApp *AfxGetApp()
{
	return activeApplication;
}

BOOL AfxRouteAppCommand(
	UINT commandId,
	int notificationCode,
	void *extra,
	AFX_CMDHANDLERINFO *handlerInfo)
{
	return activeApplication != nullptr
		? activeApplication->OnCmdMsg(
			commandId, notificationCode, extra, handlerInfo)
		: FALSE;
}

CWnd *AfxGetMainWnd()
{
	return activeApplication != nullptr && activeApplication->m_pMainWnd != nullptr
		? activeApplication->m_pMainWnd
		: CWnd::GetDesktopWindow();
}

HINSTANCE AfxGetInstanceHandle()
{
	return nullptr;
}

HINSTANCE AfxGetResourceHandle()
{
	return nullptr;
}

int AfxMessageBox(UINT resourceId, UINT type, UINT)
{
	CString text;
	text.LoadString(resourceId);
	return AfxMessageBox(text, type);
}

int AfxMessageBox(LPCTSTR text, UINT type, UINT)
{
	return browser_mfc::host().runMessageBox(
		text ? text : "",
		"World Builder",
		type,
		AfxGetMainWnd() ? AfxGetMainWnd()->browserWindowId() : 0);
}

extern "C" int BrowserWorldBuilderMessageBox(
	const char *text,
	const char *caption,
	unsigned int type)
{
	return browser_mfc::host().runMessageBox(
		text ? text : "",
		caption ? caption : "World Builder",
		type,
		AfxGetMainWnd() ? AfxGetMainWnd()->browserWindowId() : 0);
}

LPCTSTR AfxRegisterWndClass(UINT, HCURSOR, HBRUSH, HICON)
{
	return "ProjectNewShoesBrowserMfcWindow";
}

BOOL MessageBeep(UINT type)
{
	return browser_mfc::host().messageBeep(type) ? TRUE : FALSE;
}

BOOL Beep(DWORD frequency, DWORD durationMilliseconds)
{
	return browser_mfc::host().beep(frequency, durationMilliseconds)
		? TRUE
		: FALSE;
}

extern "C" int BrowserWorldBuilderPlaySound(
	const char *filename,
	unsigned int flags) __attribute__((weak));

BOOL PlaySound(LPCTSTR filename, HMODULE, DWORD flags)
{
	if (BrowserWorldBuilderPlaySound != nullptr) {
		return BrowserWorldBuilderPlaySound(filename ? filename : "", flags)
			? TRUE
			: FALSE;
	}
	return browser_mfc::host().playSound(filename ? filename : "", flags)
		? TRUE
		: FALSE;
}

BOOL DestroyCursor(HCURSOR cursor)
{
	return browser_mfc::host().destroyCursor(cursor) ? TRUE : FALSE;
}

BOOL Enable3dControlsStatic()
{
	return browser_mfc::host().initializeControls() ? TRUE : FALSE;
}

BOOL DestroyIcon(HICON icon)
{
	return browser_mfc::host().destroyImage(icon, IMAGE_ICON) ? TRUE : FALSE;
}

HANDLE LoadImage(
	HINSTANCE,
	LPCTSTR resource,
	UINT imageType,
	int desiredWidth,
	int desiredHeight,
	UINT flags)
{
	return browser_mfc::host().loadImage(
		static_cast<UINT>(reinterpret_cast<std::uintptr_t>(resource)),
		imageType,
		desiredWidth,
		desiredHeight,
		flags);
}

COLORREF GetSysColor(int colorIndex)
{
	return browser_mfc::host().systemColor(colorIndex);
}

BOOL DrawIconEx(
	HDC deviceContext,
	int x,
	int y,
	HICON icon,
	int width,
	int height,
	UINT,
	HBRUSH,
	UINT flags)
{
	if (deviceContext == nullptr || icon == nullptr) return FALSE;
	browser_mfc::host().drawIcon(
		static_cast<browser_mfc::WindowId>(
			reinterpret_cast<std::uintptr_t>(deviceContext)),
		x,
		y,
		icon,
		width,
		height,
		flags);
	return TRUE;
}

void CoUninitialize()
{
	browser_mfc::host().uninitializeComApartment();
}

int GetSystemMetrics(int metric)
{
	return browser_mfc::host().systemMetric(metric);
}

int StretchDIBits(
	HDC destination,
	int destinationX,
	int destinationY,
	int destinationWidth,
	int destinationHeight,
	int sourceX,
	int sourceY,
	int sourceWidth,
	int sourceHeight,
	const void *pixels,
	const BITMAPINFO *bitmapInfo,
	UINT colorUse,
	DWORD rasterOperation)
{
	if (destination == nullptr || pixels == nullptr || bitmapInfo == nullptr) return 0;
	const BITMAPINFOHEADER &header = bitmapInfo->bmiHeader;
	const std::size_t pixelBytes = header.biSizeImage != 0
		? static_cast<std::size_t>(header.biSizeImage)
		: static_cast<std::size_t>(std::abs(header.biWidth)) *
			static_cast<std::size_t>(std::abs(header.biHeight)) *
			static_cast<std::size_t>((header.biBitCount + 7) / 8);
	return browser_mfc::host().stretchDibits(
		static_cast<browser_mfc::WindowId>(
			reinterpret_cast<std::uintptr_t>(destination)),
		CRect(
			destinationX,
			destinationY,
			destinationX + destinationWidth,
			destinationY + destinationHeight),
		CRect(
			sourceX,
			sourceY,
			sourceX + sourceWidth,
			sourceY + sourceHeight),
		pixels,
		pixelBytes,
		*bitmapInfo,
		colorUse,
		rasterOperation);
}

HICON LoadIcon(HINSTANCE, LPCTSTR resource)
{
	return browser_mfc::host().loadIcon(
		static_cast<UINT>(reinterpret_cast<std::uintptr_t>(resource)));
}

BOOL TreeView_EndEditLabelNow(HWND tree, BOOL cancel)
{
	const auto treeId = static_cast<browser_mfc::WindowId>(
		reinterpret_cast<std::uintptr_t>(tree));
	return browser_mfc::host().endTreeLabelEdit(treeId, cancel != FALSE)
		? TRUE
		: FALSE;
}
