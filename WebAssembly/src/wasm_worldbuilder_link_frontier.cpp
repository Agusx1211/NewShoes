#include "mfc/browser_mfc.h"

// World Builder intentionally does not initialize the legacy embedded WOL/IE
// browser subsystem. Keep the original process-global owner in its correct
// uninitialized state when shared GameClient objects reference it.
class WebBrowser;
WebBrowser *TheWebBrowser = nullptr;

// This executable is a link-completeness gate for the original application.
// The shipping browser entry installs the DOM/resource Host before calling
// CWorldBuilderApp::InitInstance; this diagnostic deliberately does not start
// the application.
int main(int argumentCount, char **)
{
	CWinApp *application = AfxGetApp();
	if (application == nullptr) return 1;
	if (argumentCount == 0) {
		if (!application->InitInstance()) return 2;
		return application->ExitInstance();
	}
	return 0;
}
