#pragma once

typedef int GPEnum;
typedef int GPProfile;
typedef int GPResult;
typedef int GPErrorCode;

struct GPConnection
{
	int unused;
};

typedef void (*GPCallback)(GPConnection *, void *, void *);

enum
{
	GP_NICK_LEN = 31,
	GP_EMAIL_LEN = 51,
	GP_PASSWORD_LEN = 31,
	GP_COUNTRYCODE_LEN = 3,
	GP_REASON_LEN = 1025,
	GP_STATUS_STRING_LEN = 256,
	GP_LOCATION_STRING_LEN = 256
};

enum
{
	GP_NO_ERROR = 0,
	GP_MEMORY_ERROR,
	GP_PARAMETER_ERROR,
	GP_NETWORK_ERROR,
	GP_SERVER_ERROR
};

enum
{
	GP_GENERAL = 0x0100,
	GP_PARSE,
	GP_NOT_LOGGED_IN,
	GP_BAD_SESSKEY,
	GP_DATABASE,
	GP_NETWORK,
	GP_FORCED_DISCONNECT,
	GP_CONNECTION_CLOSED,
	GP_LOGIN,
	GP_LOGIN_TIMEOUT,
	GP_LOGIN_BAD_NICK,
	GP_LOGIN_BAD_EMAIL,
	GP_LOGIN_BAD_PASSWORD,
	GP_LOGIN_BAD_PROFILE,
	GP_LOGIN_PROFILE_DELETED,
	GP_LOGIN_CONNECTION_FAILED,
	GP_LOGIN_SERVER_AUTH_FAILED,
	GP_NEWUSER,
	GP_NEWUSER_BAD_NICK,
	GP_NEWUSER_BAD_PASSWORD,
	GP_UPDATEUI,
	GP_UPDATEUI_BAD_EMAIL,
	GP_NEWPROFILE,
	GP_NEWPROFILE_BAD_NICK,
	GP_NEWPROFILE_BAD_OLD_NICK,
	GP_UPDATEPRO,
	GP_UPDATEPRO_BAD_NICK,
	GP_ADDBUDDY,
	GP_ADDBUDDY_BAD_FROM,
	GP_ADDBUDDY_BAD_NEW,
	GP_ADDBUDDY_ALREADY_BUDDY,
	GP_AUTHADD,
	GP_AUTHADD_BAD_FROM,
	GP_AUTHADD_BAD_SIG,
	GP_STATUS,
	GP_BM,
	GP_BM_NOT_BUDDY,
	GP_GETPROFILE,
	GP_GETPROFILE_BAD_PROFILE,
	GP_DELBUDDY,
	GP_DELBUDDY_NOT_BUDDY,
	GP_DELPROFILE,
	GP_DELPROFILE_LAST_PROFILE,
	GP_SEARCH,
	GP_SEARCH_CONNECTION_FAILED
};

enum
{
	GP_OFFLINE = 0,
	GP_ONLINE,
	GP_CHATTING,
	GP_STAGING,
	GP_PLAYING,
	GP_CONNECTED,
	GP_DISCONNECTED,
	GP_FATAL,
	GP_NOT_FATAL,
	GP_FIREWALL,
	GP_NO_FIREWALL,
	GP_BLOCKING,
	GP_NON_BLOCKING,
	GP_CHECK_CACHE,
	GP_DONT_CHECK_CACHE,
	GP_MASK_NONE
};

enum
{
	GP_ERROR = 0,
	GP_RECV_BUDDY_MESSAGE,
	GP_RECV_BUDDY_REQUEST,
	GP_RECV_BUDDY_STATUS
};

struct GPErrorArg
{
	GPResult result;
	GPErrorCode errorCode;
	char errorString[GP_REASON_LEN];
	GPEnum fatal;
};

struct GPRecvBuddyMessageArg
{
	GPProfile profile;
	unsigned int date;
	char message[GP_REASON_LEN];
};

struct GPConnectResponseArg
{
	GPResult result;
	GPProfile profile;
	GPErrorCode errorCode;
	char errorString[GP_REASON_LEN];
};

struct GPRecvBuddyRequestArg
{
	GPProfile profile;
	char reason[GP_REASON_LEN];
};

struct GPRecvBuddyStatusArg
{
	GPProfile profile;
	int index;
};

struct GPGetInfoResponseArg
{
	GPResult result;
	GPProfile profile;
	char nick[GP_NICK_LEN];
	char email[GP_EMAIL_LEN];
	char countrycode[GP_COUNTRYCODE_LEN];
};

struct GPBuddyStatus
{
	GPProfile profile;
	GPEnum status;
	char statusString[GP_STATUS_STRING_LEN];
	char locationString[GP_LOCATION_STRING_LEN];
};

static inline GPResult gpInitialize(GPConnection *, int)
{
	return GP_NO_ERROR;
}

static inline GPResult gpSetCallback(GPConnection *, GPEnum, GPCallback, void *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpConnect(GPConnection *, const char *, const char *, const char *, GPEnum, GPEnum, GPCallback, void *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpConnectNewUser(GPConnection *, const char *, const char *, const char *, GPEnum, GPEnum, GPCallback, void *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpDeleteProfile(GPConnection *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpDisconnect(GPConnection *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpSendBuddyMessage(GPConnection *, GPProfile, const char *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpSendBuddyRequest(GPConnection *, GPProfile, const char *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpDeleteBuddy(GPConnection *, GPProfile)
{
	return GP_NO_ERROR;
}

static inline GPResult gpAuthBuddyRequest(GPConnection *, GPProfile)
{
	return GP_NO_ERROR;
}

static inline GPResult gpDenyBuddyRequest(GPConnection *, GPProfile)
{
	return GP_NO_ERROR;
}

static inline GPResult gpSetStatus(GPConnection *, GPEnum, const char *, const char *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpIsConnected(GPConnection *, GPEnum *connected)
{
	if (connected != nullptr) {
		*connected = GP_DISCONNECTED;
	}
	return GP_NO_ERROR;
}

static inline GPResult gpProcess(GPConnection *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpDestroy(GPConnection *)
{
	return GP_NO_ERROR;
}

static inline GPResult gpGetInfo(GPConnection *, GPProfile profile, GPEnum, GPEnum, GPCallback callback, void *param)
{
	if (callback != nullptr) {
		GPGetInfoResponseArg arg = {};
		arg.result = GP_NO_ERROR;
		arg.profile = profile;
		callback(nullptr, &arg, param);
	}
	return GP_NO_ERROR;
}

static inline GPResult gpSetInfoMask(GPConnection *, GPEnum)
{
	return GP_NO_ERROR;
}

static inline GPResult gpGetBuddyStatus(GPConnection *, int, GPBuddyStatus *status)
{
	if (status != nullptr) {
		status->profile = 0;
		status->status = GP_OFFLINE;
		status->statusString[0] = '\0';
		status->locationString[0] = '\0';
	}
	return GP_NO_ERROR;
}
