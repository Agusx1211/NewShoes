// wasm_opfs_files.cpp — P2 "OPFS as the disk" read layer (design: IDEAS.md
// "the browser as a 2003 PC"; lane notes: WebAssembly/notes/p1-engine-thread.md
// "P2-prep results").
//
// Provides the strong definitions for the weak fd-intercept hooks declared in
// WebAssembly/shims/io.h. When a path under a registered prefix (e.g.
// "/assets/") is opened read-only through the engine's io.h seam
// (LocalFile::open -> _open -> WasmIoOpen), this layer returns a VIRTUAL fd
// backed by realm-local JS functions installed by
// harness/opfs_realm_files.mjs:
//
//   globalThis.__cncOpfsOpen(path)                 -> id (>=0) or -1
//   globalThis.__cncOpfsSize(id)                   -> byte size (double)
//   globalThis.__cncOpfsRead(id, destPtr, len, at) -> bytesRead
//   globalThis.__cncOpfsClose(id)                  -> 0
//
// The JS side reads through pre-opened FileSystemSyncAccessHandle objects —
// genuinely synchronous, worker-thread-only. EM_JS bodies execute in the
// CALLING thread's realm, so when the engine pthread issues a read, the
// lookup hits the WORKER realm's globalThis: exactly where the realm module
// installed the handles (same mechanism the D3D8 shim uses for its hooks).
//
// Inert by default (zero-risk bar for the non-threaded path):
//   - compiled into cnc-port in BOTH builds, but nothing registers a prefix
//     unless JS explicitly calls _cnc_port_opfs_register_prefix, so every
//     open falls through to POSIX exactly as before;
//   - every OTHER target that includes shims/io.h does not link this file, so
//     the weak hook declarations resolve to null and the io.h wrappers skip
//     the intercept entirely (byte-identical behavior).
//
// Positions/sizes cross the EM_JS boundary as doubles (emsdk 3.1.6 has no
// BigInt interop); doubles are exact for any file < 2^53 bytes.

#ifdef __EMSCRIPTEN__

#include <emscripten.h>

#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <pthread.h>

// ---------------------------------------------------------------------------
// Realm-local JS bindings (installed by harness/opfs_realm_files.mjs).
// ---------------------------------------------------------------------------

EM_JS(int, cnc_port_opfs_js_open, (const char *path_ptr), {
	try {
		var fn = globalThis.__cncOpfsOpen;
		if (typeof fn !== "function") {
			return -1;
		}
		var id = fn(UTF8ToString(path_ptr));
		return typeof id === "number" && id >= 0 ? id | 0 : -1;
	} catch (e) {
		return -1;
	}
});

EM_JS(double, cnc_port_opfs_js_size, (int id), {
	try {
		var fn = globalThis.__cncOpfsSize;
		if (typeof fn !== "function") {
			return -1;
		}
		var size = fn(id);
		return typeof size === "number" ? size : -1;
	} catch (e) {
		return -1;
	}
});

EM_JS(int, cnc_port_opfs_js_read, (int id, unsigned char *dest, int len, double at), {
	try {
		var fn = globalThis.__cncOpfsRead;
		if (typeof fn !== "function") {
			return -1;
		}
		var read = fn(id, dest, len, at);
		return typeof read === "number" ? read | 0 : -1;
	} catch (e) {
		return -1;
	}
});

EM_JS(int, cnc_port_opfs_js_close, (int id), {
	try {
		var fn = globalThis.__cncOpfsClose;
		if (typeof fn !== "function") {
			return -1;
		}
		fn(id);
		return 0;
	} catch (e) {
		return -1;
	}
});

namespace
{

// Virtual fds live far above any plausible POSIX fd so the two ranges can
// never collide (MEMFS fds are small integers).
constexpr int kOpfsFdBase = 0x0fd00000;
constexpr int kOpfsMaxOpen = 64;
constexpr int kOpfsMaxPrefixes = 8;
constexpr int kOpfsMaxPrefixLength = 255;

struct OpfsVirtualFile
{
	bool used;
	int jsId;
	long long size;
	long long position;
};

OpfsVirtualFile g_files[kOpfsMaxOpen];
char g_prefixes[kOpfsMaxPrefixes][kOpfsMaxPrefixLength + 1];
int g_prefix_count = 0;
pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;

bool pathMatchesRegisteredPrefix(const char *path)
{
	for (int index = 0; index < g_prefix_count; ++index) {
		const char *prefix = g_prefixes[index];
		const size_t length = std::strlen(prefix);
		if (length > 0 && std::strncmp(path, prefix, length) == 0) {
			return true;
		}
	}
	return false;
}

OpfsVirtualFile *slotForFd(int fd)
{
	const int index = fd - kOpfsFdBase;
	if (index < 0 || index >= kOpfsMaxOpen || !g_files[index].used) {
		return nullptr;
	}
	return &g_files[index];
}

} // namespace

extern "C" {

// ---------------------------------------------------------------------------
// Registration API (called from JS via cwrap/ccall, or from C).
// ---------------------------------------------------------------------------

// Register a path prefix (e.g. "/assets/") for OPFS interception. Returns the
// new prefix count, or -1 on error (table full / bad prefix).
EMSCRIPTEN_KEEPALIVE int cnc_port_opfs_register_prefix(const char *prefix)
{
	if (prefix == nullptr || prefix[0] == '\0' || std::strlen(prefix) > kOpfsMaxPrefixLength) {
		return -1;
	}
	pthread_mutex_lock(&g_lock);
	int result = -1;
	if (g_prefix_count < kOpfsMaxPrefixes) {
		std::strcpy(g_prefixes[g_prefix_count], prefix);
		g_prefix_count += 1;
		result = g_prefix_count;
	}
	pthread_mutex_unlock(&g_lock);
	return result;
}

// Drop all registrations (interception becomes inert again). Open virtual
// fds stay valid until closed.
EMSCRIPTEN_KEEPALIVE void cnc_port_opfs_clear_prefixes(void)
{
	pthread_mutex_lock(&g_lock);
	g_prefix_count = 0;
	pthread_mutex_unlock(&g_lock);
}

// Diagnostics: number of currently open virtual fds.
EMSCRIPTEN_KEEPALIVE int cnc_port_opfs_open_count(void)
{
	pthread_mutex_lock(&g_lock);
	int count = 0;
	for (int index = 0; index < kOpfsMaxOpen; ++index) {
		if (g_files[index].used) {
			count += 1;
		}
	}
	pthread_mutex_unlock(&g_lock);
	return count;
}

// ---------------------------------------------------------------------------
// fd-intercept hooks (weak decls in shims/io.h; strong defs here).
// ---------------------------------------------------------------------------

// Consulted by WasmIoOpen BEFORE falling through to POSIX. Returns a virtual
// fd (>= kOpfsFdBase) when this layer owns the path, or -1 to fall through.
// Read-only opens only: any write-ish flag falls through untouched.
int cnc_port_opfs_intercept_open(const char *path, int flags)
{
	if (path == nullptr) {
		return -1;
	}
	if ((flags & (O_WRONLY | O_RDWR | O_CREAT | O_TRUNC | O_APPEND)) != 0) {
		return -1;
	}

	pthread_mutex_lock(&g_lock);
	const bool matches = g_prefix_count > 0 && pathMatchesRegisteredPrefix(path);
	pthread_mutex_unlock(&g_lock);
	if (!matches) {
		return -1;
	}

	// Realm-local JS open (pre-opened sync access handle lookup).
	const int jsId = cnc_port_opfs_js_open(path);
	if (jsId < 0) {
		return -1; // not staged in this realm: fall through to POSIX.
	}
	const double size = cnc_port_opfs_js_size(jsId);
	if (size < 0) {
		cnc_port_opfs_js_close(jsId);
		return -1;
	}

	pthread_mutex_lock(&g_lock);
	int fd = -1;
	for (int index = 0; index < kOpfsMaxOpen; ++index) {
		if (!g_files[index].used) {
			g_files[index].used = true;
			g_files[index].jsId = jsId;
			g_files[index].size = static_cast<long long>(size);
			g_files[index].position = 0;
			fd = kOpfsFdBase + index;
			break;
		}
	}
	pthread_mutex_unlock(&g_lock);

	if (fd < 0) {
		cnc_port_opfs_js_close(jsId);
		errno = EMFILE;
	}
	return fd;
}

// Fast fd-ownership test used by the io.h read/lseek/close/write wrappers.
int cnc_port_opfs_intercept_is_fd(int fd)
{
	if (fd < kOpfsFdBase || fd >= kOpfsFdBase + kOpfsMaxOpen) {
		return 0;
	}
	pthread_mutex_lock(&g_lock);
	const bool used = slotForFd(fd) != nullptr;
	pthread_mutex_unlock(&g_lock);
	return used ? 1 : 0;
}

int cnc_port_opfs_intercept_read(int fd, void *buffer, unsigned int length)
{
	pthread_mutex_lock(&g_lock);
	OpfsVirtualFile *file = slotForFd(fd);
	if (file == nullptr) {
		pthread_mutex_unlock(&g_lock);
		errno = EBADF;
		return -1;
	}
	const int jsId = file->jsId;
	const long long position = file->position;
	const long long size = file->size;
	pthread_mutex_unlock(&g_lock);

	if (buffer == nullptr) {
		errno = EFAULT;
		return -1;
	}
	if (position >= size || length == 0) {
		return 0; // at/behind EOF, or nothing requested.
	}
	long long want = static_cast<long long>(length);
	if (position + want > size) {
		want = size - position;
	}

	const int read = cnc_port_opfs_js_read(
		jsId,
		static_cast<unsigned char *>(buffer),
		static_cast<int>(want),
		static_cast<double>(position));
	if (read < 0) {
		errno = EIO;
		return -1;
	}

	pthread_mutex_lock(&g_lock);
	file = slotForFd(fd);
	if (file != nullptr) {
		file->position = position + read;
	}
	pthread_mutex_unlock(&g_lock);
	return read;
}

long long cnc_port_opfs_intercept_lseek(int fd, long long offset, int whence)
{
	pthread_mutex_lock(&g_lock);
	OpfsVirtualFile *file = slotForFd(fd);
	if (file == nullptr) {
		pthread_mutex_unlock(&g_lock);
		errno = EBADF;
		return -1;
	}
	long long base = 0;
	switch (whence) {
	case SEEK_SET:
		base = 0;
		break;
	case SEEK_CUR:
		base = file->position;
		break;
	case SEEK_END:
		base = file->size;
		break;
	default:
		pthread_mutex_unlock(&g_lock);
		errno = EINVAL;
		return -1;
	}
	const long long target = base + offset;
	if (target < 0) {
		pthread_mutex_unlock(&g_lock);
		errno = EINVAL;
		return -1;
	}
	file->position = target;
	pthread_mutex_unlock(&g_lock);
	return target;
}

int cnc_port_opfs_intercept_close(int fd)
{
	pthread_mutex_lock(&g_lock);
	OpfsVirtualFile *file = slotForFd(fd);
	if (file == nullptr) {
		pthread_mutex_unlock(&g_lock);
		errno = EBADF;
		return -1;
	}
	const int jsId = file->jsId;
	file->used = false;
	pthread_mutex_unlock(&g_lock);

	cnc_port_opfs_js_close(jsId);
	return 0;
}

// Size-for-stat helper (fstat-shaped queries; the engine's File::size goes
// through lseek(END) which is covered above, but integration callers may
// want the size without disturbing the file position).
long long cnc_port_opfs_intercept_size(int fd)
{
	pthread_mutex_lock(&g_lock);
	OpfsVirtualFile *file = slotForFd(fd);
	const long long size = file != nullptr ? file->size : -1;
	pthread_mutex_unlock(&g_lock);
	if (size < 0) {
		errno = EBADF;
	}
	return size;
}

} // extern "C"

#endif // __EMSCRIPTEN__
