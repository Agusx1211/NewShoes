#pragma once

#include <cerrno>
#include <arpa/inet.h>
#include <netdb.h>
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
