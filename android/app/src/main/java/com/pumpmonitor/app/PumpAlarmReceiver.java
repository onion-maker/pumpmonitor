package com.pumpmonitor.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * AlarmManager 喚醒接收器 — 由 FcmMessagingService 或 server 觸發檢查
 * server 為主，此為備援
 */
public class PumpAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "PumpAlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "AlarmManager 喚醒");
        Intent serviceIntent = new Intent(context, PumpMonitorService.class);
        serviceIntent.setAction("com.pumpmonitor.CHECK");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}