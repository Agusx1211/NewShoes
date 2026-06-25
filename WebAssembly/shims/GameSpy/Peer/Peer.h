#pragma once

typedef void *PEER;
typedef int PEERBool;

struct sockaddr;

struct _SBServer
{
	void *keyvals;
};

typedef _SBServer *SBServer;

enum
{
	PEERFalse = 0,
	PEERTrue = 1
};

enum RoomType
{
	TitleRoom = 0,
	GroupRoom,
	StagingRoom,
	NumRooms
};

enum MessageType
{
	NormalMessage = 0,
	ActionMessage,
	NoticeMessage
};

enum PEERJoinResult
{
	PEERJoinSuccess = 0,
	PEERAlreadyInRoom,
	PEERJoinFailed,
	PEERFullRoom,
	PEERInviteOnlyRoom,
	PEERBannedFromRoom,
	PEERBadPassword,
	PEERNoTitleSet,
	PEERNoConnection
};

enum
{
	PEER_STOP_REPORTING = 0,
	PEER_FLAG_OP = 0x01,
	PEER_IN_USE = 1
};

enum
{
	PEER_CLEAR = 0,
	PEER_ADD,
	PEER_UPDATE,
	PEER_REMOVE,
	PEER_COMPLETE
};

enum
{
	NUM_RESERVED_KEYS = 50,
	HOSTNAME_KEY = 1,
	GAMEVER_KEY,
	GAMENAME_KEY,
	MAPNAME_KEY,
	PID__KEY
};

enum qr2_key_type
{
	key_server = 0,
	key_player,
	key_team
};

enum qr2_error_t
{
	e_qrnoerror = 0,
	e_qrwsockerror,
	e_qrbinderror,
	e_qrdnserror,
	e_qrconnerror
};

typedef void *qr2_buffer_t;
typedef void *qr2_keybuffer_t;

typedef void (*peerDisconnectedCallback)(PEER, const char *, void *);
typedef void (*peerRoomMessageCallback)(PEER, RoomType, const char *, const char *, MessageType, void *);
typedef void (*peerPlayerMessageCallback)(PEER, const char *, const char *, MessageType, void *);
typedef void (*peerPlayerJoinedCallback)(PEER, RoomType, const char *, void *);
typedef void (*peerPlayerLeftCallback)(PEER, RoomType, const char *, const char *, void *);
typedef void (*peerPlayerChangedNickCallback)(PEER, RoomType, const char *, const char *, void *);
typedef void (*peerPlayerInfoCallback)(PEER, RoomType, const char *, unsigned int, int, void *);
typedef void (*peerPlayerFlagsChangedCallback)(PEER, RoomType, const char *, int, int, void *);
typedef void (*peerRoomUTMCallback)(PEER, RoomType, const char *, const char *, const char *, PEERBool, void *);
typedef void (*peerPlayerUTMCallback)(PEER, const char *, const char *, const char *, PEERBool, void *);
typedef void (*peerReadyChangedCallback)(PEER, RoomType, const char *, PEERBool, void *);
typedef void (*peerGameStartedCallback)(PEER, unsigned int, const char *, void *);
typedef void (*peerGlobalKeyChangedCallback)(PEER, const char *, const char *, const char *, void *);
typedef void (*peerRoomKeyChangedCallback)(PEER, RoomType, const char *, const char *, const char *, void *);
typedef void (*peerQRServerKeyCallback)(PEER, int, qr2_buffer_t, void *);
typedef void (*peerQRPlayerKeyCallback)(PEER, int, int, qr2_buffer_t, void *);
typedef void (*peerQRTeamKeyCallback)(PEER, int, int, qr2_buffer_t, void *);
typedef void (*peerQRKeyListCallback)(PEER, qr2_key_type, qr2_keybuffer_t, void *);
typedef int (*peerQRCountCallback)(PEER, qr2_key_type, void *);
typedef void (*peerQRAddErrorCallback)(PEER, qr2_error_t, char *, void *);
typedef void (*peerQRNatNegotiateCallback)(PEER, int, void *);
typedef void (*peerKickedCallback)(PEER, RoomType, const char *, const char *, void *);
typedef void (*peerNewPlayerListCallback)(PEER, RoomType, void *);

typedef void (*peerNickErrorCallback)(PEER, int, const char *, void *);
typedef void (*peerConnectCallback)(PEER, PEERBool, void *);
typedef void (*peerJoinRoomCallback)(PEER, PEERBool, PEERJoinResult, RoomType, void *);
typedef void (*peerListGroupRoomsCallback)(PEER, PEERBool, int, SBServer, const char *, int, int, int, int, void *);
typedef void (*peerListingGamesCallback)(PEER, PEERBool, const char *, SBServer, PEERBool, int, int, void *);
typedef void (*peerEnumPlayersCallback)(PEER, PEERBool, RoomType, int, const char *, int, void *);
typedef void (*peerPlayerProfileIDCallback)(PEER, PEERBool, const char *, int, void *);
typedef void (*peerAuthenticateCDKeyCallback)(PEER, int, const char *, void *);
typedef void (*peerGetRoomKeysCallback)(PEER, PEERBool, RoomType, const char *, int, char **, char **, void *);

struct PEERCallbacks
{
	peerDisconnectedCallback disconnected;
	peerRoomMessageCallback roomMessage;
	peerPlayerMessageCallback playerMessage;
	peerPlayerJoinedCallback playerJoined;
	peerPlayerLeftCallback playerLeft;
	peerPlayerChangedNickCallback playerChangedNick;
	peerPlayerInfoCallback playerInfo;
	peerPlayerFlagsChangedCallback playerFlagsChanged;
	peerRoomUTMCallback roomUTM;
	peerPlayerUTMCallback playerUTM;
	peerReadyChangedCallback readyChanged;
	peerGameStartedCallback gameStarted;
	peerGlobalKeyChangedCallback globalKeyChanged;
	peerRoomKeyChangedCallback roomKeyChanged;
	peerQRServerKeyCallback qrServerKey;
	peerQRPlayerKeyCallback qrPlayerKey;
	peerQRTeamKeyCallback qrTeamKey;
	peerQRKeyListCallback qrKeyList;
	peerQRCountCallback qrCount;
	peerQRAddErrorCallback qrAddError;
	peerQRNatNegotiateCallback qrNatNegotiateCallback;
	peerKickedCallback kicked;
	peerNewPlayerListCallback newPlayerList;
	void *param;
};

static const char *qr2_registered_key_list[256] = {};

static inline PEER peerInitialize(PEERCallbacks *)
{
	static int peer;
	return &peer;
}

static inline PEERBool peerSetTitle(PEER, const char *, const char *, const char *, const char *, int, int, PEERBool, PEERBool *, PEERBool *)
{
	return PEERTrue;
}

static inline void peerShutdown(PEER) {}
static inline void peerThink(PEER) {}
static inline PEERBool peerIsConnected(PEER) { return PEERFalse; }
static inline void peerDisconnect(PEER) {}
static inline void peerRetryWithNick(PEER, const char *) {}
static inline void peerStateChanged(PEER) {}
static inline void peerStopGame(PEER) {}
static inline void peerStopListingGames(PEER) {}
static inline unsigned int peerGetLocalIP(PEER) { return 0; }

static inline void chatSetLocalIP(unsigned int) {}

static inline void qr2_register_key(int key, const char *name)
{
	if (key >= 0 && key < 256) {
		qr2_registered_key_list[key] = name;
	}
}

static inline void qr2_buffer_add(qr2_buffer_t, const char *) {}
static inline void qr2_buffer_add_int(qr2_buffer_t, int) {}
static inline void qr2_keybuffer_add(qr2_keybuffer_t, int) {}

static inline void peerParseQuery(PEER, const char *, int, sockaddr *) {}

static inline void peerConnect(PEER peer, const char *, int, peerNickErrorCallback, peerConnectCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, PEERFalse, param);
	}
}

static inline void peerJoinGroupRoom(PEER peer, int, peerJoinRoomCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, PEERFalse, PEERJoinFailed, GroupRoom, param);
	}
}

static inline void peerJoinStagingRoom(PEER peer, SBServer, const char *, peerJoinRoomCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, PEERFalse, PEERJoinFailed, StagingRoom, param);
	}
}

static inline void peerLeaveRoom(PEER, RoomType, const char *) {}
static inline void peerMessagePlayer(PEER, const char *, const char *, MessageType) {}
static inline void peerMessageRoom(PEER, RoomType, const char *, MessageType) {}
static inline void peerUTMPlayer(PEER, const char *, const char *, const char *, PEERBool) {}
static inline void peerUTMRoom(PEER, RoomType, const char *, const char *, PEERBool) {}
static inline void peerSetGlobalKeys(PEER, int, const char **, const char **) {}
static inline void peerSetGlobalWatchKeys(PEER, RoomType, int, const char **, PEERBool) {}
static inline void peerSetRoomKeys(PEER, RoomType, const char *, int, const char **, const char **) {}
static inline void peerSetRoomWatchKeys(PEER, RoomType, int, const char **, PEERBool) {}

static inline void peerCreateStagingRoomWithSocket(PEER peer, const char *, int, const char *, int, unsigned int, peerJoinRoomCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, PEERFalse, PEERJoinFailed, StagingRoom, param);
	}
}

static inline void peerStartListingGames(PEER peer, const unsigned char *, int, const char *, peerListingGamesCallback callback, void *param)
{
	if (callback != nullptr) {
		callback(peer, PEERTrue, nullptr, nullptr, PEERFalse, PEER_COMPLETE, 100, param);
	}
}

static inline void peerUpdateGame(PEER, SBServer, PEERBool) {}
static inline void peerStartGame(PEER, const char *, int) {}

static inline void peerListGroupRooms(PEER peer, const char *, peerListGroupRoomsCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, PEERTrue, 0, nullptr, nullptr, 0, 0, 0, 0, param);
	}
}

static inline void peerEnumPlayers(PEER, RoomType, peerEnumPlayersCallback callback, void *param)
{
	if (callback != nullptr) {
		callback(nullptr, PEERFalse, StagingRoom, 0, nullptr, 0, param);
	}
}

static inline void peerGetPlayerProfileID(PEER peer, const char *nick, peerPlayerProfileIDCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, PEERFalse, nick, 0, param);
	}
}

static inline void peerGetPlayerInfoNoWait(PEER, const char *, unsigned int *ip, int *profileID)
{
	if (ip != nullptr) {
		*ip = 0;
	}
	if (profileID != nullptr) {
		*profileID = 0;
	}
}

static inline void peerGetPlayerFlags(PEER, const char *, RoomType, int *flags)
{
	if (flags != nullptr) {
		*flags = 0;
	}
}

static inline void peerAuthenticateCDKey(PEER peer, const char *, peerAuthenticateCDKeyCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, 0, "", param);
	}
}

static inline void peerGetGlobalWatchKey(PEER, const char *, const char *, char *, int) {}
static inline void peerGetRoomKeys(PEER peer, RoomType roomType, const char *nick, int, const char **, peerGetRoomKeysCallback callback, void *param, PEERBool)
{
	if (callback != nullptr) {
		callback(peer, PEERFalse, roomType, nick, 0, nullptr, nullptr, param);
	}
}

static inline const char *SBServerGetStringValue(SBServer, const char *, const char *defaultValue)
{
	return defaultValue;
}

static inline int SBServerGetIntValue(SBServer, const char *, int defaultValue)
{
	return defaultValue;
}

static inline const char *SBServerGetPlayerStringValue(SBServer, int, const char *, const char *defaultValue)
{
	return defaultValue;
}

static inline int SBServerGetPlayerIntValue(SBServer, int, const char *, int defaultValue)
{
	return defaultValue;
}

static inline unsigned int SBServerGetPrivateInetAddress(SBServer) { return 0; }
static inline unsigned short SBServerGetPrivateQueryPort(SBServer) { return 0; }
static inline unsigned int SBServerGetPublicInetAddress(SBServer) { return 0; }
static inline int SBServerHasBasicKeys(SBServer) { return 0; }
static inline int SBServerHasFullKeys(SBServer) { return 0; }
