package com.pumpmonitor.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 接收 AlarmManager 鬧鐘喚醒，轉發給 PumpMonitorService */
public class PumpAlarmReceiver extends BroadcastReceiver {

    private static final String ACTION_CHECK = "com.pumpmonitor.CHECK";
    private static final String ACTION_HEARTBEAT = "com.pumpmonitor.HEARTBEAT";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        Intent serviceIntent = new Intent(context, PumpMonitorService.class);
        serviceIntent.setAction(action);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}