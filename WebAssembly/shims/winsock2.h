#pragma once

#include <cerrno>
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>

#include "windows.h"

#ifdef AI_PASSIVE
#undef AI_PASSIVE
#endif

using SOCKET = int;
using HOSTENT = struct hostent;

#ifndef SOCKET_ERROR
#define SOCKET_ERROR (-1)
#endif

#ifndef INVALID_SOCKET
#define INVALID_SOCKET (-1)
#endif

#ifndef WSAEWOULDBLOCK
#define WSAEWOULDBLOCK EWOULDBLOCK
#endif

#ifndef WSAEINVAL
#define WSAEINVAL EINVAL
#endif

#ifndef WSAEALREADY
#define WSAEALREADY EALREADY
#endif

#ifndef WSAEISCONN
#define WSAEISCONN EISCONN
#endif

#ifndef WSAECONNRESET
#define WSAECONNRESET ECONNRESET
#endif

#ifndef WSAENOTCONN
#define WSAENOTCONN ENOTCONN
#endif

#ifndef MAKEWORD
#define MAKEWORD(low, high) static_cast<WORD>((static_cast<BYTE>(low)) | (static_cast<WORD>(static_cast<BYTE>(high)) << 8))
#endif

#ifndef LOBYTE
#define LOBYTE(word) static_cast<BYTE>((word) & 0xff)
#endif

#ifndef HIBYTE
#define HIBYTE(word) static_cast<BYTE>(((word) >> 8) & 0xff)
#endif

struct WSADATA
{
	WORD wVersion;
	WORD wHighVersion;
	char szDescription[257];
	char szSystemStatus[129];
	unsigned short iMaxSockets;
	unsigned short iMaxUdpDg;
	char *lpVendorInfo;
};

static inline int WSAStartup(WORD version, WSADATA *data)
{
	if (data != nullptr) {
		data->wVersion = version;
		data->wHighVersion = version;
		data->szDescription[0] = '\0';
		data->szSystemStatus[0] = '\0';
		data->iMaxSockets = 0;
		data->iMaxUdpDg = 0;
		data->lpVendorInfo = nullptr;
	}
	return 0;
}

static inline int WSACleanup()
{
	return 0;
}

static inline int WSAGetLastError()
{
	return errno;
}

static inline int closesocket(int socket_fd)
{
	return close(socket_fd);
}

static inline int ioctlsocket(int socket_fd, long request, unsigned long *value)
{
	return ioctl(socket_fd, request, value);
}

// Remaining canonical Winsock error codes (real Winsock ABI values in the
// 10000 range so they never collide with the POSIX-errno mappings above).
// Needed by original diagnostics like GameResultsThread's getWSAErrorString.
#ifndef WSABASEERR
#define WSABASEERR 10000
#define WSAEINTR 10004
#define WSAEBADF 10009
#define WSAEACCES 10013
#define WSAEFAULT 10014
#define WSAEMFILE 10024
#define WSAEINPROGRESS 10036
#define WSAENOTSOCK 10038
#define WSAEDESTADDRREQ 10039
#define WSAEMSGSIZE 10040
#define WSAEPROTOTYPE 10041
#define WSAENOPROTOOPT 10042
#define WSAEPROTONOSUPPORT 10043
#define WSAESOCKTNOSUPPORT 10044
#define WSAEOPNOTSUPP 10045
#define WSAEPFNOSUPPORT 10046
#define WSAEAFNOSUPPORT 10047
#define WSAEADDRINUSE 10048
#define WSAEADDRNOTAVAIL 10049
#define WSAENETRESET 10052
#define WSAENOBUFS 10055
#define WSAESHUTDOWN 10058
#define WSAETOOMANYREFS 10059
#define WSAELOOP 10062
#define WSAENAMETOOLONG 10063
#define WSAEHOSTDOWN 10064
#define WSAENOTEMPTY 10066
#define WSAEPROCLIM 10067
#define WSAEUSERS 10068
#define WSAEDQUOT 10069
#define WSAESTALE 10070
#define WSAEREMOTE 10071
#define WSAEDISCON 10101
#define WSASYSNOTREADY 10091
#define WSAVERNOTSUPPORTED 10092
#define WSANOTINITIALISED 10093
#define WSAHOST_NOT_FOUND 11001
#define WSATRY_AGAIN 11002
#define WSANO_RECOVERY 11003
#define WSANO_DATA 11004
#endif

#ifndef WSAENETDOWN
#define WSAENETDOWN ENETDOWN
#endif
#ifndef WSAENETUNREACH
#define WSAENETUNREACH ENETUNREACH
#endif
#ifndef WSAECONNABORTED
#define WSAECONNABORTED ECONNABORTED
#endif
#ifndef WSAETIMEDOUT
#define WSAETIMEDOUT ETIMEDOUT
#endif
#ifndef WSAECONNREFUSED
#define WSAECONNREFUSED ECONNREFUSED
#endif
#ifndef WSAEHOSTUNREACH
#define WSAEHOSTUNREACH EHOSTUNREACH
#endif
