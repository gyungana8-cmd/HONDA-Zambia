package com.yangu.twendedriver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.NotificationManager;
import android.widget.Toast;

public class TwendeRideActionReceiver extends BroadcastReceiver {
    public static final String ACTION_ACCEPT = "com.yangu.twendedriver.ACCEPT_RIDE";
    public static final String ACTION_REJECT = "com.yangu.twendedriver.REJECT_RIDE";

    @Override public void onReceive(Context context, Intent intent) {
        final String rideId = intent.getStringExtra("ride_id");
        final String action = intent.getAction();
        if (rideId == null || rideId.trim().isEmpty()) return;
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                if (ACTION_ACCEPT.equals(action)) {
                    TwendeApi.acceptRide(context, rideId);
                } else if (ACTION_REJECT.equals(action)) {
                    TwendeApi.rejectRide(context, rideId);
                } else {
                    return;
                }
                ((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE))
                    .cancel(rideId.hashCode());
                android.os.Handler main = new android.os.Handler(context.getMainLooper());
                main.post(() -> Toast.makeText(context,
                    ACTION_ACCEPT.equals(action) ? "TWENDE ride accepted." : "Request passed to another nearby driver.",
                    Toast.LENGTH_LONG).show());
            } catch (Exception ex) {
                android.util.Log.e("TWENDE", "Notification ride action failed", ex);
                android.os.Handler main = new android.os.Handler(context.getMainLooper());
                main.post(() -> Toast.makeText(context,
                    "Ride action failed. Open TWENDE to refresh requests.", Toast.LENGTH_LONG).show());
            } finally {
                pending.finish();
            }
        }).start();
    }
}
