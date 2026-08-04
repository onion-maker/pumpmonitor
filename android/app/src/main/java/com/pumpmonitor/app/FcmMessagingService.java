package com.pumpmonitor.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

public class FcmMessagingService extends FirebaseMessagingService {
    private static final String TAG = "FCM";
    private static final String CHANNEL_ID = "alarm_channel";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "FCM 收到訊息: " + remoteMessage.getData());

        String type = remoteMessage.getData().get("type");
        String station = remoteMessage.getData().get("station");
        String action = remoteMessage.getData().get("action");

        // 警報類訊息：直接顯示通知
        if (type != null) {
            String title = remoteMessage.getNotification() != null ?
                remoteMessage.getNotification().getTitle() : "抽水站警報";
            String body = remoteMessage.getNotification() != null ?
                remoteMessage.getNotification().getBody() : (action != null ? action : "警報觸發");

            showNotification(
                station != null ? station : title,
                body,
                action != null ? action : null
            );
            return;
        }

        // check-alarm 觸發：備用模式，回到 PumpMonitorService 觸發檢查
        if ("check-alarm".equals(type)) {
            triggerCheck();
        } else {
            showNotification(
                station != null ? station : "抽水站",
                remoteMessage.getNotification() != null ?
                    remoteMessage.getNotification().getBody() : "警報觸發",
                action != null ? action : null
            );
        }
    }

    /** 備用模式：觸發 PumpMonitorService 檢查（若 server 未啟用） */
    private void triggerCheck() {
        Intent intent = new Intent(this, PumpMonitorService.class);
        intent.setAction("com.pumpmonitor.CHECK");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    /** 顯示警報通知 */
    private void showNotification(String title, String body, String alarmType) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // 建立通知通道（Android 8+ 必須）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "抽水站警報", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("水位與警報通知");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(Notification.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);

        manager.notify((int) System.currentTimeMillis(), builder.build());
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "新的 FCM token: " + token);
    }
}