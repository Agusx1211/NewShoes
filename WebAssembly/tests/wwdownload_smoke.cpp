#include <cstdio>
#include <string>

#include "WWDownload/Download.h"
#include "WWDownload/downloaddefs.h"
#include "WWDownload/urlBuilder.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

class SmokeDownloadListener : public IDownload
{
public:
	HRESULT OnError(int) override
	{
		++errors;
		return S_OK;
	}

	HRESULT OnEnd() override
	{
		++ends;
		return S_OK;
	}

	HRESULT OnQueryResume() override
	{
		++resume_queries;
		return DOWNLOADEVENT_DONOTRESUME;
	}

	HRESULT OnProgressUpdate(int, int, int, int) override
	{
		++progress_updates;
		return S_OK;
	}

	HRESULT OnStatusUpdate(int) override
	{
		++status_updates;
		return S_OK;
	}

	int errors = 0;
	int ends = 0;
	int resume_queries = 0;
	int progress_updates = 0;
	int status_updates = 0;
};

bool exerciseUrlBuilderDefaults()
{
	std::string game_patch_url;
	std::string map_patch_url;
	std::string config_url;
	std::string motd_url;
	FormatURLFromRegistry(game_patch_url, map_patch_url, config_url, motd_url);

	return expect(game_patch_url == "http://servserv.generals.ea.com/servserv/GeneralsZH/english-0.txt",
						 "default game patch URL changed") &&
		expect(map_patch_url == "http://servserv.generals.ea.com/servserv/GeneralsZH/maps-0.txt",
					 "default map patch URL changed") &&
		expect(config_url == "http://servserv.generals.ea.com/servserv/GeneralsZH/config.txt",
					 "default config URL changed") &&
		expect(motd_url == "http://servserv.generals.ea.com/servserv/GeneralsZH/MOTD-english.txt",
					 "default MOTD URL changed");
}

bool exerciseIdleDownloadState()
{
	SmokeDownloadListener listener;
	CDownload download(&listener);

	const bool idle_ok =
		expect(download.PumpMessages() == DOWNLOAD_SUCCEEDED, "idle download pump failed") &&
		expect(download.Abort() == S_OK, "idle download abort failed") &&
		expect(listener.errors == 0, "idle download reported errors") &&
		expect(listener.ends == 0, "idle download ended unexpectedly") &&
		expect(listener.resume_queries == 0, "idle download queried resume unexpectedly") &&
		expect(listener.progress_updates == 0, "idle download reported progress unexpectedly") &&
		expect(listener.status_updates == 0, "idle download reported status unexpectedly");
	return idle_ok;
}
}

int main()
{
	const bool ok = exerciseUrlBuilderDefaults() && exerciseIdleDownloadState();
	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"WWDownload\",\"compiled\":\"Download,FTP,registry,urlBuilder\",\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
