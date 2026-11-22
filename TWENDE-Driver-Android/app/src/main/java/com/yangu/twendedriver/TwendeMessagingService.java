package com.yangu.twendedriver;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class TwendeMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL = "twende_bookings";

    @Override public void onNewToken(String token) {
        android.content.SharedPreferences prefs = getSharedPreferences("twende_driver", MODE_PRIVATE);
        prefs.edit().putString("pending_fcm_token", token).apply();
        String accessToken = prefs.getString("access_token", null);
        if (accessToken != null && !accessToken.isEmpty()) {
            new Thread(() -> {
                try {
                    TwendeApi.registerToken(TwendeMessagingService.this, token);
                    prefs.edit().remove("pending_fcm_token").apply();
                } catch (Exception ex) {
                    android.util.Log.e("TWENDE", "FCM token refresh registration failed; will retry after sign-in", ex);
                }
            }).start();
        }
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        ensureChannel(this);
        java.util.Map<String,String> data = message.getData();
        String title = data.get("title");
        String body = data.get("body");
        if (title == null || title.isEmpty()) title = "New TWENDE booking";
        if (body == null || body.isEmpty()) body = "Open TWENDE Driver to view the request.";

        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, flags);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true).setOngoing(false)
            .setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI)
            .setVibrate(new long[]{0, 500, 200, 500})
            .setContentIntent(pending);

        String actionType = data.get("action_type");
        String rideId = data.get("ride_id");
        if ("ride_request".equals(actionType) && rideId != null && !rideId.isEmpty()) {
            Intent acceptIntent = new Intent(this, TwendeRideActionReceiver.class);
            acceptIntent.setAction(TwendeRideActionReceiver.ACTION_ACCEPT);
            acceptIntent.putExtra("ride_id", rideId);
            PendingIntent acceptPending = PendingIntent.getBroadcast(this, rideId.hashCode() ^ 0x41,
                acceptIntent, flags);
            Intent rejectIntent = new Intent(this, TwendeRideActionReceiver.class);
            rejectIntent.setAction(TwendeRideActionReceiver.ACTION_REJECT);
            rejectIntent.putExtra("ride_id", rideId);
            PendingIntent rejectPending = PendingIntent.getBroadcast(this, rideId.hashCode() ^ 0x52,
                rejectIntent, flags);
            builder.addAction(android.R.drawable.checkbox_on_background, "Accept", acceptPending);
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Reject", rejectPending);
            builder.setTimeoutAfter(45000);
        }

        int notificationId = rideId == null || rideId.isEmpty()
            ? (int)System.currentTimeMillis() : rideId.hashCode();
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(notificationId, builder.build());
    }

    public static void ensureChannel(android.content.Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "TWENDE booking alerts", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Immediate sound, vibration and quick actions for new taxi booking requests");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 200, 500});
            channel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
                new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).build());
            ((NotificationManager)context.getSystemService(android.content.Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }
}
