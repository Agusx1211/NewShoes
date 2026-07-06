#include <cstddef>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "GameClient/GameText.h"
#include "GameNetwork/DownloadManager.h"

class GameLogic;
class Display;

SubsystemInterfaceList *TheSubsystemList = nullptr;
GameLogic *TheGameLogic = nullptr;
Display *TheDisplay = nullptr;
HWND ApplicationHWnd = NULL;
const Char *g_strFile = "Data\\Generals.str";
const Char *g_csfFile = "Data\\%s\\Generals.csf";

namespace {
struct SmokeFileEntry
{
	std::string name;
	std::vector<char> payload;
};

class SmokeFile : public File
{
public:
	SmokeFile() : m_position(0) {}

	void setPayload(const std::vector<char> &payload)
	{
		m_data = payload;
		m_position = 0;
	}

	Int read(void *buffer, Int bytes) override
	{
		if (buffer == nullptr || bytes <= 0) {
			return 0;
		}
		const Int remaining = static_cast<Int>(m_data.size()) - m_position;
		const Int bytes_to_read = remaining <= 0 ? 0 : (bytes < remaining ? bytes : remaining);
		if (bytes_to_read > 0) {
			std::memcpy(buffer, m_data.data() + m_position, static_cast<std::size_t>(bytes_to_read));
			m_position += bytes_to_read;
		}
		return bytes_to_read;
	}

	Int write(const void *, Int) override { return -1; }

	Int seek(Int bytes, seekMode mode = CURRENT) override
	{
		Int base = 0;
		if (mode == CURRENT) {
			base = m_position;
		} else if (mode == END) {
			base = static_cast<Int>(m_data.size());
		}

		const Int limit = static_cast<Int>(m_data.size());
		const Int next = base + bytes;
		m_position = next < 0 ? 0 : (next > limit ? limit : next);
		return m_position;
	}

	void nextLine(Char *buf = nullptr, Int bufSize = 0) override
	{
		if (buf != nullptr && bufSize > 0) {
			buf[0] = 0;
		}
	}

	Bool scanInt(Int &) override { return FALSE; }
	Bool scanReal(Real &) override { return FALSE; }
	Bool scanString(AsciiString &) override { return FALSE; }

	char *readEntireAndClose() override
	{
		char *buffer = NEW char[m_data.size() + 1];
		if (buffer != nullptr) {
			std::memcpy(buffer, m_data.data(), m_data.size());
			buffer[m_data.size()] = 0;
		}
		close();
		return buffer;
	}

	File *convertToRAMFile() override { return this; }

private:
	std::vector<char> m_data;
	Int m_position;
};

class SmokeLocalFileSystem : public LocalFileSystem
{
public:
	void addFile(const char *filename, const std::vector<char> &payload)
	{
		m_entries.push_back({ filename != nullptr ? filename : "", payload });
	}

	void init() override {}
	void reset() override {}
	void update() override {}

	File *openFile(const Char *filename, Int access = 0) override
	{
		const SmokeFileEntry *entry = findEntry(filename);
		if (entry == nullptr) {
			return nullptr;
		}

		m_file.close();
		m_file.setPayload(entry->payload);
		return m_file.open(filename, access) ? &m_file : nullptr;
	}

	Bool doesFileExist(const Char *filename) const override
	{
		return findEntry(filename) != nullptr;
	}

	void getFileListInDirectory(
		const AsciiString &,
		const AsciiString &,
		const AsciiString &,
		FilenameList &,
		Bool) const override {}

	Bool getFileInfo(const AsciiString &, FileInfo *) const override { return FALSE; }
	Bool createDirectory(AsciiString) override { return FALSE; }

private:
	const SmokeFileEntry *findEntry(const Char *filename) const
	{
		if (filename == nullptr) {
			return nullptr;
		}
		for (const SmokeFileEntry &entry : m_entries) {
			if (entry.name == filename) {
				return &entry;
			}
		}
		return nullptr;
	}

	std::vector<SmokeFileEntry> m_entries;
	SmokeFile m_file;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

std::vector<char> payloadFromString(const char *text)
{
	std::vector<char> payload;
	if (text != nullptr) {
		payload.assign(text, text + std::strlen(text));
	}
	return payload;
}

bool exerciseDownloadManager()
{
	SmokeLocalFileSystem local_file_system;
	local_file_system.addFile(g_strFile, payloadFromString(
		"FTP:StatusIdle\n"
		"\"Idle\"\n"
		"END\n"
		"FTP:StatusConnecting\n"
		"\"Connecting\"\n"
		"END\n"
		"FTP:StatusDone\n"
		"\"Done\"\n"
		"END\n"
		"FTP:TCPError\n"
		"\"TCP Error\"\n"
		"END\n"));
	FileSystem file_system;

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	TheFileSystem = &file_system;
	TheLocalFileSystem = &local_file_system;

	GameTextInterface *game_text = CreateGameTextInterface();
	TheGameText = game_text;
	game_text->init();

	DownloadManager manager;
	const bool initial_ok =
		expect(std::wcscmp(manager.getStatusString().str(), L"Idle") == 0,
			"DownloadManager initial status did not use GameText") &&
		expect(!manager.isDone() && !manager.isOk() && !manager.wasError(),
			"DownloadManager initial state flags changed") &&
		expect(manager.update() == DOWNLOAD_SUCCEEDED, "DownloadManager idle update failed") &&
		expect(manager.getLastLocalFile().isEmpty(), "DownloadManager idle last local file should be empty");

	manager.queueFileForDownload(
		AsciiString("server.example"),
		AsciiString("anonymous"),
		AsciiString("password"),
		AsciiString("remote.dat"),
		AsciiString("download\\remote.dat"),
		AsciiString("Registry\\Root"),
		FALSE);
	const bool queue_ok =
		expect(manager.isFileQueuedForDownload(), "DownloadManager queue did not accept file") &&
		expect(manager.downloadNextQueuedFile() == S_OK, "DownloadManager queued download start failed") &&
		expect(!manager.isFileQueuedForDownload(), "DownloadManager queue did not pop started file") &&
		expect(manager.getLastLocalFile() == AsciiString("download\\remote.dat"),
			"DownloadManager did not preserve queued local file");

	manager.OnStatusUpdate(DOWNLOADSTATUS_CONNECTING);
	const bool status_ok =
		expect(std::wcscmp(manager.getStatusString().str(), L"Connecting") == 0,
			"DownloadManager status callback did not use GameText");

	manager.OnError(DOWNLOADEVENT_TCPERROR);
	const bool error_ok =
		expect(manager.isDone() && manager.wasError() && !manager.isOk(),
			"DownloadManager error flags changed") &&
		expect(std::wcscmp(manager.getErrorString().str(), L"TCP Error") == 0,
			"DownloadManager error callback did not use GameText");

	TheGameText = old_game_text;
	delete game_text;
	TheLocalFileSystem = old_local_file_system;
	TheFileSystem = old_file_system;

	return initial_ok && queue_ok && status_ok && error_ok;
}
}

int main()
{
	initMemoryManager();
	const bool ok = exerciseDownloadManager();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameNetwork/DownloadManager\",\"compiled\":\"DownloadManager with GameText and WWDownload\",\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
