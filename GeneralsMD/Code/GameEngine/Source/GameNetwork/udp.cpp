/*
**	Command & Conquer Generals Zero Hour(tm)
**	Copyright 2025 Electronic Arts Inc.
**
**	This program is free software: you can redistribute it and/or modify
**	it under the terms of the GNU General Public License as published by
**	the Free Software Foundation, either version 3 of the License, or
**	(at your option) any later version.
**
**	This program is distributed in the hope that it will be useful,
**	but WITHOUT ANY WARRANTY; without even the implied warranty of
**	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
**	GNU General Public License for more details.
**
**	You should have received a copy of the GNU General Public License
**	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

////////////////////////////////////////////////////////////////////////////////
//																																						//
//  (c) 2001-2003 Electronic Arts Inc.																				//
//																																						//
////////////////////////////////////////////////////////////////////////////////

// FILE: Udp.cpp //////////////////////////////////////////////////////////////
// Implementation of UDP socket wrapper class (taken from wnet lib)
// Author: Matthew D. Campbell, July 2001
///////////////////////////////////////////////////////////////////////////////

// SYSTEM INCLUDES ////////////////////////////////////////////////////////////
#include "PreRTS.h"	// This must go first in EVERY cpp file int the GameEngine

#include "winsock2.h"

// USER INCLUDES //////////////////////////////////////////////////////////////
#include "Common/GameEngine.h"
//#include "GameNetwork/NetworkInterface.h"
#include "GameNetwork/udp.h"

#ifdef __EMSCRIPTEN__
#include <cstring>
#include <emscripten/emscripten.h>
#endif

#ifdef _INTERNAL
// for occasional debugging...
//#pragma optimize("", off)
//#pragma MESSAGE("************************************** WARNING, optimization disabled for debugging purposes")
#endif

//-------------------------------------------------------------------------

#ifdef DEBUG_LOGGING

#define CASE(x) case (x): return #x;

AsciiString GetWSAErrorString( Int error )
{
	switch (error)
	{
		CASE(WSABASEERR)
		CASE(WSAEINTR)
		CASE(WSAEBADF)
		CASE(WSAEACCES)
		CASE(WSAEFAULT)
		CASE(WSAEINVAL)
		CASE(WSAEMFILE)
		CASE(WSAEWOULDBLOCK)
		CASE(WSAEINPROGRESS)
		CASE(WSAEALREADY)
		CASE(WSAENOTSOCK)
		CASE(WSAEDESTADDRREQ)
		CASE(WSAEMSGSIZE)
		CASE(WSAEPROTOTYPE)
		CASE(WSAENOPROTOOPT)
		CASE(WSAEPROTONOSUPPORT)
		CASE(WSAESOCKTNOSUPPORT)
		CASE(WSAEOPNOTSUPP)
		CASE(WSAEPFNOSUPPORT)
		CASE(WSAEAFNOSUPPORT)
		CASE(WSAEADDRINUSE)
		CASE(WSAEADDRNOTAVAIL)
		CASE(WSAENETDOWN)
		CASE(WSAENETUNREACH)
		CASE(WSAENETRESET)
		CASE(WSAECONNABORTED)
		CASE(WSAECONNRESET)
		CASE(WSAENOBUFS)
		CASE(WSAEISCONN)
		CASE(WSAENOTCONN)
		CASE(WSAESHUTDOWN)
		CASE(WSAETOOMANYREFS)
		CASE(WSAETIMEDOUT)
		CASE(WSAECONNREFUSED)
		CASE(WSAELOOP)
		CASE(WSAENAMETOOLONG)
		CASE(WSAEHOSTDOWN)
		CASE(WSAEHOSTUNREACH)
		CASE(WSAENOTEMPTY)
		CASE(WSAEPROCLIM)
		CASE(WSAEUSERS)
		CASE(WSAEDQUOT)
		CASE(WSAESTALE)
		CASE(WSAEREMOTE)
		CASE(WSAEDISCON)
		CASE(WSASYSNOTREADY)
		CASE(WSAVERNOTSUPPORTED)
		CASE(WSANOTINITIALISED)
		CASE(WSAHOST_NOT_FOUND)
		CASE(WSATRY_AGAIN)
		CASE(WSANO_RECOVERY)
		CASE(WSANO_DATA)
		default:
		{
			AsciiString ret;
			ret.format("Not a Winsock error (%d)", error);
			return ret;
		}
	}
	return AsciiString::TheEmptyString; // will not be hit, ever.
}

#undef CASE

#endif // defined(_DEBUG) || defined(_INTERNAL)

//-------------------------------------------------------------------------

#ifdef __EMSCRIPTEN__

namespace {

constexpr Int kBrowserUdpQueueCapacity = 64;
constexpr Int kBrowserUdpDatagramBytes = 2048;

struct BrowserUdpDatagram
{
	UnsignedByte bytes[kBrowserUdpDatagramBytes];
	Int length;
	UnsignedInt ip;
	UnsignedShort port;
};

struct BrowserUdpQueue
{
	BrowserUdpDatagram datagrams[kBrowserUdpQueueCapacity];
	Int head;
	Int count;
};

struct BrowserUdpAdapterState
{
	BrowserUdpQueue outgoing;
	BrowserUdpQueue incoming;
	Int writes;
	Int reads;
	Int dropped;
};

BrowserUdpAdapterState g_browser_udp_adapter = {};

EM_JS(Int, browser_udp_adapter_send_js, (
	const UnsignedByte *msg,
	Int length,
	UnsignedInt ip,
	UnsignedShort port), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortBrowserUdpSend : null;
	if (typeof bridge !== "function" || !msg || length <= 0) {
		return 0;
	}
	try {
		const bytes = HEAPU8.slice(msg, msg + length);
		const written = bridge({
			bytes,
			ip: ip >>> 0,
			port: port & 0xffff,
		});
		return written | 0;
	} catch (error) {
		console.error("cncPortBrowserUdpSend failed", error);
		return -1;
	}
});

EM_JS(Int, browser_udp_adapter_recv_js, (
	UnsignedByte *msg,
	Int capacity,
	UnsignedInt *ip,
	UnsignedShort *port), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortBrowserUdpRecv : null;
	if (typeof bridge !== "function" || !msg || capacity <= 0) {
		return 0;
	}
	try {
		const datagram = bridge({ capacity });
		if (!datagram || !datagram.bytes) {
			return 0;
		}
		const bytes = datagram.bytes instanceof Uint8Array
			? datagram.bytes
			: new Uint8Array(datagram.bytes);
		if (bytes.length > capacity) {
			return -14;
		}
		HEAPU8.set(bytes, msg);
		if (ip) {
			HEAPU32[ip >> 2] = datagram.ip >>> 0;
		}
		if (port) {
			HEAPU16[port >> 1] = datagram.port & 0xffff;
		}
		return bytes.length | 0;
	} catch (error) {
		console.error("cncPortBrowserUdpRecv failed", error);
		return -1;
	}
});

void clear_browser_udp_queue(BrowserUdpQueue &queue)
{
	queue.head = 0;
	queue.count = 0;
	for (Int i = 0; i < kBrowserUdpQueueCapacity; ++i) {
		queue.datagrams[i].length = 0;
		queue.datagrams[i].ip = 0;
		queue.datagrams[i].port = 0;
	}
}

void clear_browser_udp_adapter()
{
	clear_browser_udp_queue(g_browser_udp_adapter.outgoing);
	clear_browser_udp_queue(g_browser_udp_adapter.incoming);
	g_browser_udp_adapter.writes = 0;
	g_browser_udp_adapter.reads = 0;
	g_browser_udp_adapter.dropped = 0;
}

Int push_browser_udp_queue(
	BrowserUdpQueue &queue,
	const UnsignedByte *bytes,
	Int length,
	UnsignedInt ip,
	UnsignedShort port)
{
	if (bytes == nullptr || length <= 0 || length > kBrowserUdpDatagramBytes) {
		return UDP::INVAL;
	}
	if (queue.count >= kBrowserUdpQueueCapacity) {
		++g_browser_udp_adapter.dropped;
		return UDP::AGAIN;
	}

	const Int slot = (queue.head + queue.count) % kBrowserUdpQueueCapacity;
	std::memcpy(queue.datagrams[slot].bytes, bytes, static_cast<size_t>(length));
	queue.datagrams[slot].length = length;
	queue.datagrams[slot].ip = ip;
	queue.datagrams[slot].port = port;
	++queue.count;
	return length;
}

Int pop_browser_udp_queue(
	BrowserUdpQueue &queue,
	UnsignedByte *bytes,
	Int capacity,
	UnsignedInt *ip,
	UnsignedShort *port)
{
	if (queue.count <= 0) {
		return 0;
	}
	if (bytes == nullptr || capacity <= 0) {
		return UDP::INVAL;
	}

	BrowserUdpDatagram &datagram = queue.datagrams[queue.head];
	if (datagram.length > capacity) {
		return UDP::INVAL;
	}

	std::memcpy(bytes, datagram.bytes, static_cast<size_t>(datagram.length));
	if (ip != nullptr) {
		*ip = datagram.ip;
	}
	if (port != nullptr) {
		*port = datagram.port;
	}
	const Int length = datagram.length;
	datagram.length = 0;
	datagram.ip = 0;
	datagram.port = 0;
	queue.head = (queue.head + 1) % kBrowserUdpQueueCapacity;
	--queue.count;
	return length;
}

}

extern "C" {

void cnc_port_browser_udp_adapter_clear()
{
	clear_browser_udp_adapter();
}

Int cnc_port_browser_udp_adapter_push_incoming(
	const UnsignedByte *bytes,
	Int length,
	UnsignedInt ip,
	UnsignedShort port)
{
	return push_browser_udp_queue(g_browser_udp_adapter.incoming, bytes, length, ip, port);
}

Int cnc_port_browser_udp_adapter_pop_outgoing(
	UnsignedByte *bytes,
	Int capacity,
	UnsignedInt *ip,
	UnsignedShort *port)
{
	return pop_browser_udp_queue(g_browser_udp_adapter.outgoing, bytes, capacity, ip, port);
}

Int cnc_port_browser_udp_adapter_outgoing_count()
{
	return g_browser_udp_adapter.outgoing.count;
}

Int cnc_port_browser_udp_adapter_incoming_count()
{
	return g_browser_udp_adapter.incoming.count;
}

Int cnc_port_browser_udp_adapter_write_count()
{
	return g_browser_udp_adapter.writes;
}

Int cnc_port_browser_udp_adapter_read_count()
{
	return g_browser_udp_adapter.reads;
}

Int cnc_port_browser_udp_adapter_dropped_count()
{
	return g_browser_udp_adapter.dropped;
}

}

UDP::UDP()
{
	fd = 0;
	myIP = 0;
	myPort = 0;
	std::memset(&addr, 0, sizeof(addr));
	m_lastError = OK;
}

UDP::~UDP()
{
	fd = 0;
}

Int UDP::Bind(const char *Host, UnsignedShort port)
{
	if (Host == nullptr || Host[0] == '\0') {
		return Bind(static_cast<UnsignedInt>(0), port);
	}
	if (isdigit(Host[0])) {
		return Bind(ntohl(inet_addr(Host)), port);
	}
	m_lastError = ADDRNOTAVAIL;
	return ADDRNOTAVAIL;
}

Int UDP::Bind(UnsignedInt IP, UnsignedShort Port)
{
	myIP = IP;
	myPort = Port;
	addr.sin_family = AF_INET;
	addr.sin_port = htons(Port);
	addr.sin_addr.s_addr = htonl(IP);
	fd = 1;
	m_lastError = OK;
	return OK;
}

Int UDP::getLocalAddr(UnsignedInt &ip, UnsignedShort &port)
{
	ip = myIP;
	port = myPort;
	return OK;
}

Int UDP::SetBlocking(Int)
{
	return OK;
}

Int UDP::Write(const unsigned char *msg, UnsignedInt len, UnsignedInt IP, UnsignedShort port)
{
	if ((IP == 0) || (port == 0)) {
		m_lastError = ADDRNOTAVAIL;
		return ADDRNOTAVAIL;
	}

	const Int browser_written = browser_udp_adapter_send_js(
		reinterpret_cast<const UnsignedByte *>(msg),
		static_cast<Int>(len),
		IP,
		port);
	if (browser_written > 0) {
		++g_browser_udp_adapter.writes;
		m_lastError = OK;
		return browser_written;
	}
	if (browser_written < 0) {
		m_lastError = browser_written;
		return browser_written;
	}

	const Int written = push_browser_udp_queue(
		g_browser_udp_adapter.outgoing,
		reinterpret_cast<const UnsignedByte *>(msg),
		static_cast<Int>(len),
		IP,
		port);
	if (written > 0) {
		++g_browser_udp_adapter.writes;
		m_lastError = OK;
	} else if (written < 0) {
		m_lastError = written;
	}
	return written;
}

Int UDP::Read(unsigned char *msg, UnsignedInt len, sockaddr_in *from)
{
	UnsignedInt ip = 0;
	UnsignedShort port = 0;
	const Int browser_read = browser_udp_adapter_recv_js(
		reinterpret_cast<UnsignedByte *>(msg),
		static_cast<Int>(len),
		&ip,
		&port);
	if (browser_read > 0) {
		if (from != nullptr) {
			std::memset(from, 0, sizeof(sockaddr_in));
			from->sin_family = AF_INET;
			from->sin_addr.s_addr = htonl(ip);
			from->sin_port = htons(port);
		}
		++g_browser_udp_adapter.reads;
		m_lastError = OK;
		return browser_read;
	}
	if (browser_read < 0) {
		m_lastError = browser_read;
		return browser_read;
	}

	const Int read = pop_browser_udp_queue(
		g_browser_udp_adapter.incoming,
		reinterpret_cast<UnsignedByte *>(msg),
		static_cast<Int>(len),
		&ip,
		&port);
	if (read > 0) {
		if (from != nullptr) {
			std::memset(from, 0, sizeof(sockaddr_in));
			from->sin_family = AF_INET;
			from->sin_addr.s_addr = htonl(ip);
			from->sin_port = htons(port);
		}
		++g_browser_udp_adapter.reads;
		m_lastError = OK;
	} else if (read == 0) {
		m_lastError = OK;
	} else {
		m_lastError = read;
	}
	return read;
}

void UDP::ClearStatus(void)
{
	m_lastError = OK;
}

UDP::sockStat UDP::GetStatus(void)
{
	if (m_lastError == OK) {
		return OK;
	}
	if (m_lastError < 0) {
		return static_cast<UDP::sockStat>(m_lastError);
	}
	return UNKNOWN;
}

Int UDP::SetInputBuffer(UnsignedInt)
{
	return TRUE;
}

Int UDP::SetOutputBuffer(UnsignedInt)
{
	return TRUE;
}

int UDP::GetInputBuffer(void)
{
	return kBrowserUdpDatagramBytes * kBrowserUdpQueueCapacity;
}

int UDP::GetOutputBuffer(void)
{
	return kBrowserUdpDatagramBytes * kBrowserUdpQueueCapacity;
}

Int UDP::AllowBroadcasts(Bool)
{
	return TRUE;
}

#else

UDP::UDP()
{
  fd=0;
}

UDP::~UDP()
{
	if (fd)
		closesocket(fd);
}

Int UDP::Bind(const char *Host,UnsignedShort port)
{
  char hostName[100];
  struct hostent *hostStruct;
  struct in_addr *hostNode;

  if (isdigit(Host[0]))
    return ( Bind( ntohl(inet_addr(Host)), port) );

  strcpy(hostName, Host);

  hostStruct = gethostbyname(Host);
  if (hostStruct == NULL)
    return (0);
  hostNode = (struct in_addr *) hostStruct->h_addr;
  return ( Bind(ntohl(hostNode->s_addr),port) );
}

// You must call bind, implicit binding is for sissies
//   Well... you can get implicit binding if you pass 0 for either arg
Int UDP::Bind(UnsignedInt IP,UnsignedShort Port)
{
  int retval;
  int status;

  IP=htonl(IP);
  Port=htons(Port);

  addr.sin_family=AF_INET;
  addr.sin_port=Port;
  addr.sin_addr.s_addr=IP;
  fd=socket(AF_INET,SOCK_DGRAM,DEFAULT_PROTOCOL);
  #ifdef _WINDOWS
  if (fd==SOCKET_ERROR)
    fd=-1;
  #endif
  if (fd==-1)
    return(UNKNOWN);

  retval=bind(fd,(struct sockaddr *)&addr,sizeof(addr));

  #ifdef _WINDOWS
  if (retval==SOCKET_ERROR)
	{
    retval=-1;
		m_lastError = WSAGetLastError();
	}
  #endif
  if (retval==-1)
  {
    status=GetStatus();
    //CERR("Bind failure (" << status << ") IP " << IP << " PORT " << Port )
    return(status);
  }

  socklen_t namelen=sizeof(addr);
  getsockname(fd, (struct sockaddr *)&addr, &namelen); 

  myIP=ntohl(addr.sin_addr.s_addr);
  myPort=ntohs(addr.sin_port);

  retval=SetBlocking(FALSE);
  if (retval==-1)
    fprintf(stderr,"Couldn't set nonblocking mode!\n");

  return(OK);
}

Int UDP::getLocalAddr(UnsignedInt &ip, UnsignedShort &port)
{
  ip=myIP;
  port=myPort;
  return(OK);
}


// private function
Int UDP::SetBlocking(Int block)
{
  #ifdef _WINDOWS
   unsigned long flag=1;
   if (block)
     flag=0;
   int retval;
   retval=ioctlsocket(fd,FIONBIO,&flag);
   if (retval==SOCKET_ERROR)
     return(UNKNOWN);
   else
     return(OK);
  #else  // UNIX
   int flags = fcntl(fd, F_GETFL, 0);
   if (block==FALSE)          // set nonblocking
     flags |= O_NONBLOCK;
   else                       // set blocking
     flags &= ~(O_NONBLOCK);

   if (fcntl(fd, F_SETFL, flags) < 0)
   {
     return(UNKNOWN);
   }
   return(OK);
  #endif
}


Int UDP::Write(const unsigned char *msg,UnsignedInt len,UnsignedInt IP,UnsignedShort port)
{
  Int retval;
  struct sockaddr_in to;

  // This happens frequently
  if ((IP==0)||(port==0)) return(ADDRNOTAVAIL);

#ifdef _UNIX
  errno=0;
#endif
  to.sin_port=htons(port);
  to.sin_addr.s_addr=htonl(IP);
  to.sin_family=AF_INET;

  ClearStatus();
  retval=sendto(fd,(const char *)msg,len,0,(struct sockaddr *)&to,sizeof(to));
  #ifdef _WINDOWS
  if (retval==SOCKET_ERROR)
	{
    retval=-1;
		m_lastError = WSAGetLastError();
#ifdef DEBUG_LOGGING
		static Int errCount = 0;
#endif
		DEBUG_ASSERTLOG(errCount++ > 100, ("UDP::Write() - WSA error is %s\n", GetWSAErrorString(WSAGetLastError()).str()));
	}
  #endif
  
  return(retval);
}

Int UDP::Read(unsigned char *msg,UnsignedInt len,sockaddr_in *from)
{
  Int retval;
  socklen_t alen=sizeof(sockaddr_in);

  if (from!=NULL)
  {
    retval=recvfrom(fd,(char *)msg,len,0,(struct sockaddr *)from,&alen);
    #ifdef _WINDOWS
    if (retval == SOCKET_ERROR)
		{
			if (WSAGetLastError() != WSAEWOULDBLOCK)
			{
				// failing because of a blocking error isn't really such a bad thing.
				m_lastError = WSAGetLastError();
#ifdef DEBUG_LOGGING
				static Int errCount = 0;
#endif
				DEBUG_ASSERTLOG(errCount++ > 100, ("UDP::Read() - WSA error is %s\n", GetWSAErrorString(WSAGetLastError()).str()));
				retval = -1;
			} else {
				retval = 0;
			}
		}
    #endif
  }
  else
  {
    retval=recvfrom(fd,(char *)msg,len,0,NULL,NULL);
    #ifdef _WINDOWS
    if (retval==SOCKET_ERROR)
		{
			if (WSAGetLastError() != WSAEWOULDBLOCK)
			{
				// failing because of a blocking error isn't really such a bad thing.
				m_lastError = WSAGetLastError();
#ifdef DEBUG_LOGGING
				static Int errCount = 0;
#endif
				DEBUG_ASSERTLOG(errCount++ > 100, ("UDP::Read() - WSA error is %s\n", GetWSAErrorString(WSAGetLastError()).str()));
				retval = -1;
			} else {
				retval = 0;
			}
		}
    #endif
  }
  return(retval);
}


void UDP::ClearStatus(void)
{
  #ifndef _WINDOWS
  errno=0;
  #endif

	m_lastError = 0;
}

UDP::sockStat UDP::GetStatus(void)
{
	Int status = m_lastError;
 #ifdef _WINDOWS
  //int status=WSAGetLastError();
  if (status==0) return(OK);
  else if (status==WSAEINTR) return(INTR);
  else if (status==WSAEINPROGRESS) return(INPROGRESS);
  else if (status==WSAECONNREFUSED) return(CONNREFUSED);
  else if (status==WSAEINVAL) return(INVAL);
  else if (status==WSAEISCONN) return(ISCONN);
  else if (status==WSAENOTSOCK) return(NOTSOCK);
  else if (status==WSAETIMEDOUT) return(TIMEDOUT);
  else if (status==WSAEALREADY) return(ALREADY);
  else if (status==WSAEWOULDBLOCK) return(WOULDBLOCK);
  else if (status==WSAEBADF) return(BADF);
  else     return((UDP::sockStat)status);
 #else
  //int status=errno;
  if (status==0) return(OK);
  else if (status==EINTR) return(INTR);
  else if (status==EINPROGRESS) return(INPROGRESS);
  else if (status==ECONNREFUSED) return(CONNREFUSED);
  else if (status==EINVAL) return(INVAL);
  else if (status==EISCONN) return(ISCONN);
  else if (status==ENOTSOCK) return(NOTSOCK);
  else if (status==ETIMEDOUT) return(TIMEDOUT);
  else if (status==EALREADY) return(ALREADY);
  else if (status==EAGAIN) return(AGAIN);
  else if (status==EWOULDBLOCK) return(WOULDBLOCK);
  else if (status==EBADF) return(BADF);
  else     return(UNKNOWN);
 #endif
}



/*
//
// Wait for net activity on this socket
//
int UDP::Wait(Int sec,Int usec,fd_set &returnSet)
{
  fd_set inputSet;
 
  FD_ZERO(&inputSet);
  FD_SET(fd,&inputSet);
 
  return(Wait(sec,usec,inputSet,returnSet));
}
*/

/*
//
// Wait for net activity on a list of sockets
//
int UDP::Wait(Int sec,Int usec,fd_set &givenSet,fd_set &returnSet)
{
  Wtime        timeout,timenow,timethen;
  fd_set       backupSet;
  int          retval=0,done,givenMax;
  Bool         noTimeout=FALSE;
  timeval      tv;
 
  returnSet=givenSet;
  backupSet=returnSet;
 
  if ((sec==-1)&&(usec==-1))
    noTimeout=TRUE;
 
  timeout.SetSec(sec);
  timeout.SetUsec(usec);
  timethen+=timeout;
 
  givenMax=fd;
  for (UnsignedInt i=0; i<(sizeof(fd_set)*8); i++)   // i=maxFD+1
  {
    if (FD_ISSET(i,&givenSet))
      givenMax=i;
  }
  ///DBGMSG("WAIT  fd="<<fd<<"  givenMax="<<givenMax);
 
  done=0;
  while( ! done)
  {
    if (noTimeout)
      retval=select(givenMax+1,&returnSet,0,0,NULL);
    else
    {
      timeout.GetTimevalMT(tv);
      retval=select(givenMax+1,&returnSet,0,0,&tv);
    }
 
    if (retval>=0)
      done=1;

    else if ((retval==-1)&&(errno==EINTR))  // in case of signal
    {
      if (noTimeout==FALSE)
      {
        timenow.Update();
        timeout=timethen-timenow;
      }
      if ((noTimeout==FALSE)&&(timenow.GetSec()==0)&&(timenow.GetUsec()==0))
        done=1;
      else
        returnSet=backupSet;
    }
    else  // maybe out of memory?
    {
      done=1;
    }
  }
  ///DBGMSG("Wait retval: "<<retval);
  return(retval);
}
*/




// Set the kernel buffer sizes for incoming, and outgoing packets
//
// Linux seems to have a buffer max of 32767 bytes for this,
//  (which is the default). If you try and set the size to
//  greater than the default it just sets it to 32767.

Int UDP::SetInputBuffer(UnsignedInt bytes)
{
   int retval,arg=bytes;

   retval=setsockopt(fd,SOL_SOCKET,SO_RCVBUF,
     (char *)&arg,sizeof(int));
   if (retval==0)
     return(TRUE);
   else
     return(FALSE);
}

// Same note goes for the output buffer

Int UDP::SetOutputBuffer(UnsignedInt bytes)
{
   int retval,arg=bytes;

   retval=setsockopt(fd,SOL_SOCKET,SO_SNDBUF,
     (char *)&arg,sizeof(int));
   if (retval==0)
     return(TRUE);
   else
     return(FALSE);
}

// Get the system buffer sizes 

int UDP::GetInputBuffer(void)
{
   int retval,arg=0;
   socklen_t len=sizeof(int);

   retval=getsockopt(fd,SOL_SOCKET,SO_RCVBUF,
     (char *)&arg,&len);
   return(arg);
}


int UDP::GetOutputBuffer(void)
{
   int retval,arg=0;
   socklen_t len=sizeof(int);

   retval=getsockopt(fd,SOL_SOCKET,SO_SNDBUF,
     (char *)&arg,&len);
   return(arg);
}

Int UDP::AllowBroadcasts(Bool status)
{
	int retval;
	BOOL val = status;
	retval = setsockopt(fd, SOL_SOCKET, SO_BROADCAST, (char *)&val, sizeof(BOOL));
	if (retval == 0)
		return TRUE;
	else
		return FALSE;
}

#endif // __EMSCRIPTEN__
