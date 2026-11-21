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
        // Token is received by Firebase. Register it against the authenticated Supabase
        // user after the Driver app's secure sign-in/session bridge is implemented.
        getSharedPreferences("twende_driver", MODE_PRIVATE).edit().putString("pending_fcm_token", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        createChannel();
        String title = message.getNotification() != null && message.getNotification().getTitle() != null
            ? message.getNotification().getTitle() : "New TWENDE booking";
        String body = message.getNotification() != null && message.getNotification().getBody() != null
            ? message.getNotification().getBody() : "Open TWENDE Driver to view the request.";
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true)
            .setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI)
            .setVibrate(new long[]{0, 400, 200, 400})
            .setContentIntent(pending);
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify((int)System.currentTimeMillis(), builder.build());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "TWENDE booking alerts", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Sound and vibration for new taxi booking requests");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 400, 200, 400});
            channel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
                new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).build());
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
}
