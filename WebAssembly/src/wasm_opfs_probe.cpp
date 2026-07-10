// wasm_opfs_probe.cpp — DISPOSABLE P2-prep proof probe (lane P2-prep; design:
// IDEAS.md "the browser as a 2003 PC", notes/p1-engine-thread.md "P2-prep
// results"). Driven by harness/p2_opfs_probe.{html,mjs} against the THREADED
// build (dist-threaded).
//
// What it proves: a pthread (the future engine thread) can do C-level
// open/read/lseek/close of a .big archive THROUGH the shims/io.h seam
// (_open/_read/_lseek/_close — the exact macros LocalFile.cpp uses) with the
// bytes served synchronously from OPFS FileSystemSyncAccessHandle reads in
// the worker realm — bypassing emscripten's pthread->main FS proxy entirely.
// It runs the same access patterns twice:
//
//   phase A "opfs":  a path under the registered intercept prefix
//                    (virtual fd -> realm-local __cncOpfsRead)
//   phase B "proxy": the same bytes staged in MEMFS (plain POSIX fd ->
//                    emscripten sync pthread->main FS proxy)
//
// so the summary yields the decisive OPFS-vs-proxy throughput comparison for
// P2 viability. Patterns per phase (mirroring Win32BIGFileSystem::
// openArchiveFile + Win32BIGFile/RAMFile):
//   1. 4-byte "BIGF" magic + header,
//   2. full TOC walk with byte-wise filename reads (the engine's real
//      ~60k-small-reads boot pattern),
//   3. random 64KB preads (lseek+read),
//   4. sequential full-file read in 1MB chunks (FNV-1a checksum),
//   5. largest-TOC-entry full read (RAMFile-style whole-inner-file read),
//   6. 5 deterministic sample ranges checksummed for page-side verification
//      against HTTP Range fetches.
//
// The pthread entry is THIS file's own (per lane rules it does not touch
// wasm_engine_thread_boot.cpp). Realm prep (opfs_realm_files.mjs staging via
// the threads_realm_stub setup command) must complete BEFORE
// cnc_port_opfs_probe_start(): with PTHREAD_POOL_SIZE=1 the probe thread
// lands on the prepped pool worker, and its EM_JS calls resolve against that
// worker realm's globalThis.__cncOpfs* functions.

#ifdef __EMSCRIPTEN__

#include <emscripten.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sys/stat.h>

#include <io.h> // the shims/io.h seam: _open/_read/_lseek/_close macros

#if defined(__EMSCRIPTEN_PTHREADS__)
#include <pthread.h>

#include <atomic>

namespace
{

constexpr int kSummaryCapacity = 32768;
constexpr int kSampleCount = 5;
constexpr unsigned int kRandomReadSize = 64 * 1024;
constexpr unsigned int kSequentialChunkSize = 1024 * 1024;
constexpr int kRandomReadCount = 512; // 512 x 64KB = 32MB of random preads

// 0 idle, 1 running, 2 done, 3 failed.
std::atomic<int> g_state{0};
char g_summary[kSummaryCapacity];
char g_opfs_path[512];
char g_proxy_path[512];

unsigned int fnv1a(unsigned int hash, const unsigned char *bytes, long long length)
{
	for (long long index = 0; index < length; ++index) {
		hash ^= bytes[index];
		hash *= 16777619u;
	}
	return hash;
}

// Deterministic LCG (numerical recipes constants) so the page/driver can
// reproduce the sampled offsets when verifying checksums.
unsigned int lcgNext(unsigned int &state)
{
	state = state * 1664525u + 1013904223u;
	return state;
}

struct PhaseResult
{
	bool attempted;
	bool ok;
	char error[256];
	int fd;
	int interceptActive; // 1 when the fd is a virtual OPFS fd
	long long fileSize;
	char magic[5];
	long long archiveSizeField; // LE u32 from the BIG header
	long long tocEntries;       // BE u32 from the BIG header
	double tocMs;               // full TOC walk (byte-wise names)
	long long tocReads;         // number of _read calls during the walk
	long long tocBytes;
	double randomMs;
	long long randomBytes;
	double sequentialMs;
	long long sequentialBytes;
	unsigned int fullFileFnv;
	char biggestName[256];
	long long biggestOffset;
	long long biggestSize;
	unsigned int biggestFnv;
	double biggestMs;
	long long sampleOffsets[kSampleCount];
	long long sampleLengths[kSampleCount];
	unsigned int sampleFnv[kSampleCount];
};

bool phaseFail(PhaseResult &result, const char *message)
{
	std::snprintf(result.error, sizeof(result.error), "%s", message);
	result.ok = false;
	return false;
}

unsigned int readBigEndianU32(const unsigned char *bytes)
{
	return (static_cast<unsigned int>(bytes[0]) << 24) |
		(static_cast<unsigned int>(bytes[1]) << 16) |
		(static_cast<unsigned int>(bytes[2]) << 8) |
		static_cast<unsigned int>(bytes[3]);
}

unsigned int readLittleEndianU32(const unsigned char *bytes)
{
	return (static_cast<unsigned int>(bytes[3]) << 24) |
		(static_cast<unsigned int>(bytes[2]) << 16) |
		(static_cast<unsigned int>(bytes[1]) << 8) |
		static_cast<unsigned int>(bytes[0]);
}

bool runPhase(const char *path, PhaseResult &result)
{
	std::memset(&result, 0, sizeof(result));
	result.attempted = true;
	result.ok = true;

	result.fd = _open(path, _O_RDONLY | _O_BINARY);
	if (result.fd < 0) {
		return phaseFail(result, "open failed");
	}
	result.interceptActive =
		cnc_port_opfs_intercept_is_fd != nullptr && cnc_port_opfs_intercept_is_fd(result.fd) ? 1 : 0;

	// File size through the seam, the way File::size() does it.
	result.fileSize = static_cast<long long>(_lseek(result.fd, 0, SEEK_END));
	_lseek(result.fd, 0, SEEK_SET);
	if (result.fileSize <= 0) {
		_close(result.fd);
		return phaseFail(result, "size probe failed (lseek END)");
	}

	// --- 1. BIG header (mirrors Win32BIGFileSystem::openArchiveFile) ---
	unsigned char header[16];
	if (_read(result.fd, header, 16) != 16) {
		_close(result.fd);
		return phaseFail(result, "header read failed");
	}
	std::memcpy(result.magic, header, 4);
	result.magic[4] = 0;
	if (std::memcmp(result.magic, "BIGF", 4) != 0) {
		_close(result.fd);
		return phaseFail(result, "bad BIG magic");
	}
	result.archiveSizeField = readLittleEndianU32(header + 4);
	result.tocEntries = readBigEndianU32(header + 8);
	if (result.tocEntries <= 0 || result.tocEntries > 200000) {
		_close(result.fd);
		return phaseFail(result, "implausible TOC entry count");
	}

	// --- 2. Full TOC walk, byte-wise names (the engine's boot pattern) ---
	char nameBuffer[512];
	long long biggestSize = -1;
	{
		const double start = emscripten_get_now();
		_lseek(result.fd, 0x10, SEEK_SET);
		for (long long entry = 0; entry < result.tocEntries; ++entry) {
			unsigned char meta[8];
			if (_read(result.fd, meta, 8) != 8) {
				_close(result.fd);
				return phaseFail(result, "TOC meta read failed");
			}
			result.tocReads += 1;
			result.tocBytes += 8;
			const long long offset = readBigEndianU32(meta);
			const long long size = readBigEndianU32(meta + 4);
			int nameIndex = -1;
			do {
				++nameIndex;
				if (nameIndex >= static_cast<int>(sizeof(nameBuffer)) ||
					_read(result.fd, nameBuffer + nameIndex, 1) != 1) {
					_close(result.fd);
					return phaseFail(result, "TOC name read failed");
				}
				result.tocReads += 1;
				result.tocBytes += 1;
			} while (nameBuffer[nameIndex] != 0);
			if (size > biggestSize && offset + size <= result.fileSize) {
				biggestSize = size;
				result.biggestOffset = offset;
				result.biggestSize = size;
				std::snprintf(result.biggestName, sizeof(result.biggestName), "%s", nameBuffer);
				// BIG entry names use backslashes; JSON-sanitize to '/'.
				for (char *ch = result.biggestName; *ch != 0; ++ch) {
					if (*ch == '\\' || *ch == '"') {
						*ch = '/';
					}
				}
			}
		}
		result.tocMs = emscripten_get_now() - start;
	}

	unsigned char *chunk = static_cast<unsigned char *>(std::malloc(kSequentialChunkSize));
	if (chunk == nullptr) {
		_close(result.fd);
		return phaseFail(result, "chunk malloc failed");
	}

	// --- 3. Random 64KB preads (lseek+read) ---
	{
		unsigned int rng = 0xc0ffee42u;
		const double start = emscripten_get_now();
		for (int index = 0; index < kRandomReadCount; ++index) {
			const long long maxStart = result.fileSize - static_cast<long long>(kRandomReadSize);
			const long long at = maxStart > 0
				? static_cast<long long>(lcgNext(rng) % static_cast<unsigned int>(maxStart))
				: 0;
			if (_lseek(result.fd, static_cast<off_t>(at), SEEK_SET) != static_cast<off_t>(at)) {
				std::free(chunk);
				_close(result.fd);
				return phaseFail(result, "random lseek failed");
			}
			const int read = _read(result.fd, chunk, kRandomReadSize);
			if (read <= 0) {
				std::free(chunk);
				_close(result.fd);
				return phaseFail(result, "random read failed");
			}
			result.randomBytes += read;
		}
		result.randomMs = emscripten_get_now() - start;
	}

	// --- 4. Sequential full-file read, 1MB chunks, FNV-1a of every byte ---
	{
		unsigned int hash = 2166136261u;
		_lseek(result.fd, 0, SEEK_SET);
		const double start = emscripten_get_now();
		for (;;) {
			const int read = _read(result.fd, chunk, kSequentialChunkSize);
			if (read < 0) {
				std::free(chunk);
				_close(result.fd);
				return phaseFail(result, "sequential read failed");
			}
			if (read == 0) {
				break;
			}
			hash = fnv1a(hash, chunk, read);
			result.sequentialBytes += read;
		}
		result.sequentialMs = emscripten_get_now() - start;
		result.fullFileFnv = hash;
		if (result.sequentialBytes != result.fileSize) {
			std::free(chunk);
			_close(result.fd);
			return phaseFail(result, "sequential byte total != file size");
		}
	}

	// --- 5. Largest TOC entry: RAMFile-style whole-inner-file read ---
	if (result.biggestSize > 0) {
		unsigned char *entryBuffer = static_cast<unsigned char *>(
			std::malloc(static_cast<size_t>(result.biggestSize)));
		if (entryBuffer == nullptr) {
			std::free(chunk);
			_close(result.fd);
			return phaseFail(result, "entry malloc failed");
		}
		const double start = emscripten_get_now();
		_lseek(result.fd, static_cast<off_t>(result.biggestOffset), SEEK_SET);
		long long total = 0;
		while (total < result.biggestSize) {
			const long long want = result.biggestSize - total;
			const int read = _read(
				result.fd,
				entryBuffer + total,
				want > kSequentialChunkSize ? kSequentialChunkSize
					: static_cast<unsigned int>(want));
			if (read <= 0) {
				break;
			}
			total += read;
		}
		result.biggestMs = emscripten_get_now() - start;
		if (total != result.biggestSize) {
			std::free(entryBuffer);
			std::free(chunk);
			_close(result.fd);
			return phaseFail(result, "entry read incomplete");
		}
		result.biggestFnv = fnv1a(2166136261u, entryBuffer, result.biggestSize);
		std::free(entryBuffer);
	}

	// --- 6. Deterministic sample ranges for page-side Range verification ---
	{
		unsigned int rng = 0x5eed1234u;
		for (int index = 0; index < kSampleCount; ++index) {
			const long long length =
				1024 + static_cast<long long>(lcgNext(rng) % (127 * 1024));
			const long long maxStart = result.fileSize - length;
			const long long at = maxStart > 0
				? static_cast<long long>(lcgNext(rng) % static_cast<unsigned int>(maxStart))
				: 0;
			_lseek(result.fd, static_cast<off_t>(at), SEEK_SET);
			long long total = 0;
			unsigned int hash = 2166136261u;
			while (total < length) {
				const long long want = length - total;
				const int read = _read(
					result.fd,
					chunk,
					want > kSequentialChunkSize ? kSequentialChunkSize
						: static_cast<unsigned int>(want));
				if (read <= 0) {
					break;
				}
				hash = fnv1a(hash, chunk, read);
				total += read;
			}
			if (total != length) {
				std::free(chunk);
				_close(result.fd);
				return phaseFail(result, "sample read incomplete");
			}
			result.sampleOffsets[index] = at;
			result.sampleLengths[index] = length;
			result.sampleFnv[index] = hash;
		}
	}

	std::free(chunk);
	if (_close(result.fd) != 0) {
		return phaseFail(result, "close failed");
	}
	return true;
}

int appendPhaseJson(char *out, int capacity, const char *label, const PhaseResult &result)
{
	int written = std::snprintf(
		out,
		capacity,
		"\"%s\":{\"attempted\":%s,\"ok\":%s,\"error\":\"%s\",\"interceptActive\":%d,"
		"\"fileSize\":%lld,\"magic\":\"%s\",\"archiveSizeField\":%lld,"
		"\"tocEntries\":%lld,\"tocMs\":%.2f,\"tocReads\":%lld,\"tocBytes\":%lld,"
		"\"randomMs\":%.2f,\"randomBytes\":%lld,"
		"\"sequentialMs\":%.2f,\"sequentialBytes\":%lld,\"fullFileFnv\":%u,"
		"\"biggestName\":\"%s\",\"biggestOffset\":%lld,\"biggestSize\":%lld,"
		"\"biggestFnv\":%u,\"biggestMs\":%.2f,\"samples\":[",
		label,
		result.attempted ? "true" : "false",
		result.ok ? "true" : "false",
		result.error,
		result.interceptActive,
		result.fileSize,
		result.magic,
		result.archiveSizeField,
		result.tocEntries,
		result.tocMs,
		result.tocReads,
		result.tocBytes,
		result.randomMs,
		result.randomBytes,
		result.sequentialMs,
		result.sequentialBytes,
		result.fullFileFnv,
		result.biggestName,
		result.biggestOffset,
		result.biggestSize,
		result.biggestFnv,
		result.biggestMs);
	for (int index = 0; index < kSampleCount && written < capacity; ++index) {
		written += std::snprintf(
			out + written,
			capacity - written,
			"%s{\"offset\":%lld,\"length\":%lld,\"fnv\":%u}",
			index > 0 ? "," : "",
			result.sampleOffsets[index],
			result.sampleLengths[index],
			result.sampleFnv[index]);
	}
	if (written < capacity) {
		written += std::snprintf(out + written, capacity - written, "]}");
	}
	return written;
}

void *probeThreadMain(void *)
{
	std::printf("cnc-port: p2 opfs probe pthread running\n");
	std::fflush(stdout);

	PhaseResult opfs;
	PhaseResult proxy;
	std::memset(&opfs, 0, sizeof(opfs));
	std::memset(&proxy, 0, sizeof(proxy));

	// MEMFS marker contract check: the 0-byte marker at the OPFS-intercepted
	// path must remain visible to stat() (directory enumeration goes through
	// readdir+stat in shims/windows.h) even though open() is intercepted.
	struct stat markerStat;
	const int markerRc = ::stat(g_opfs_path, &markerStat);
	const long long markerSize = markerRc == 0 ? static_cast<long long>(markerStat.st_size) : -1;

	const bool opfsOk = runPhase(g_opfs_path, opfs);
	bool proxyOk = true;
	if (g_proxy_path[0] != '\0') {
		proxyOk = runPhase(g_proxy_path, proxy);
	}

	std::snprintf(g_summary, sizeof(g_summary), "{");
	int written = 1;
	written += std::snprintf(
		g_summary + written,
		sizeof(g_summary) - written,
		"\"markerStatRc\":%d,\"markerStatSize\":%lld,",
		markerRc,
		markerSize);
	written += appendPhaseJson(g_summary + written, sizeof(g_summary) - written, "opfs", opfs);
	if (proxy.attempted && written < static_cast<int>(sizeof(g_summary)) - 2) {
		written += std::snprintf(g_summary + written, sizeof(g_summary) - written, ",");
		written += appendPhaseJson(g_summary + written, sizeof(g_summary) - written, "proxy", proxy);
	}
	if (written < static_cast<int>(sizeof(g_summary)) - 2) {
		std::snprintf(g_summary + written, sizeof(g_summary) - written, "}");
	}

	g_state.store(opfsOk && proxyOk ? 2 : 3);
	std::printf("cnc-port: p2 opfs probe finished (state %d)\n", g_state.load());
	std::fflush(stdout);
	return nullptr;
}

} // namespace

extern "C" {

// Spawn the probe pthread. opfs_path = path under the registered intercept
// prefix; proxy_path = same bytes staged in MEMFS (""/null skips phase B).
// Realm prep must be complete BEFORE this call (see file header). Returns
// pthread_create rc, or -1 if already started.
EMSCRIPTEN_KEEPALIVE int cnc_port_opfs_probe_start(const char *opfs_path, const char *proxy_path)
{
	int expected = 0;
	if (!g_state.compare_exchange_strong(expected, 1)) {
		return -1;
	}
	std::snprintf(g_opfs_path, sizeof(g_opfs_path), "%s", opfs_path != nullptr ? opfs_path : "");
	std::snprintf(g_proxy_path, sizeof(g_proxy_path), "%s", proxy_path != nullptr ? proxy_path : "");
	g_summary[0] = '\0';

	pthread_t thread;
	pthread_attr_t attributes;
	pthread_attr_init(&attributes);
	pthread_attr_setdetachstate(&attributes, PTHREAD_CREATE_DETACHED);
	const int rc = pthread_create(&thread, &attributes, probeThreadMain, nullptr);
	pthread_attr_destroy(&attributes);
	if (rc != 0) {
		g_state.store(3);
		std::snprintf(g_summary, sizeof(g_summary), "{\"error\":\"pthread_create rc %d\"}", rc);
	}
	return rc;
}

// 0 idle, 1 running, 2 done, 3 failed.
EMSCRIPTEN_KEEPALIVE int cnc_port_opfs_probe_state(void)
{
	return g_state.load();
}

// JSON summary (valid once state >= 2).
EMSCRIPTEN_KEEPALIVE const char *cnc_port_opfs_probe_summary(void)
{
	return g_summary;
}

} // extern "C"

#else // !__EMSCRIPTEN_PTHREADS__

// Non-threaded builds keep the exports link-compatible but inert.
extern "C" {

EMSCRIPTEN_KEEPALIVE int cnc_port_opfs_probe_start(const char *, const char *)
{
	return -1;
}

EMSCRIPTEN_KEEPALIVE int cnc_port_opfs_probe_state(void)
{
	return -1;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_opfs_probe_summary(void)
{
	return "{\"error\":\"threads disabled in this build\"}";
}

} // extern "C"

#endif // __EMSCRIPTEN_PTHREADS__

#endif // __EMSCRIPTEN__
