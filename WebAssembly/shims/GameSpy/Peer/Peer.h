#pragma once

typedef void *PEER;
typedef int PEERBool;

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
	PEER_STOP_REPORTING = 0
};

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
};
