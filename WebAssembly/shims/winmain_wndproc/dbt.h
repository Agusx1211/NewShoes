#pragma once

#define DBT_DEVICEREMOVEPENDING 0x8003
#define DBT_DEVTYP_VOLUME 0x00000002

struct DEV_BROADCAST_HDR
{
	unsigned long dbch_size;
	unsigned long dbch_devicetype;
	unsigned long dbch_reserved;
};

struct DEV_BROADCAST_VOLUME
{
	unsigned long dbcv_size;
	unsigned long dbcv_devicetype;
	unsigned long dbcv_reserved;
	unsigned long dbcv_unitmask;
	unsigned short dbcv_flags;
};
