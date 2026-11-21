package com.yangu.twendedriver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import org.json.JSONObject;

public class DriverLocationService extends Service {
    public static final String ACTION_START = "com.yangu.twendedriver.START_LOCATION";
    public static final String ACTION_STOP = "com.yangu.twendedriver.STOP_LOCATION";
    private static final String CHANNEL = "twende_driver_status";
    private static final int NOTIFICATION_ID = 4101;
    private FusedLocationProviderClient fused;
    private LocationCallback callback;

    @Override public void onCreate() {
        super.onCreate();
        fused = LocationServices.getFusedLocationProviderClient(this);
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("TWENDE Driver is online")
            .setContentText("Location service is active while you are available for trips.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIFICATION_ID, notification);
        beginTracking();
        return START_STICKY;
    }

    private void beginTracking() {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
            && checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 15000)
            .setMinUpdateIntervalMillis(10000)
            .setWaitForAccurateLocation(false)
            .build();
        callback = new LocationCallback() {
            @Override public void onLocationResult(LocationResult result) {
                if (result == null || result.getLastLocation() == null) return;
                android.location.Location loc = result.getLastLocation();
                android.content.SharedPreferences prefs=getSharedPreferences("twende_driver", MODE_PRIVATE);
                prefs.edit().putLong("last_location_time", System.currentTimeMillis())
                    .putString("last_latitude", String.valueOf(loc.getLatitude()))
                    .putString("last_longitude", String.valueOf(loc.getLongitude())).apply();
                String token=prefs.getString("access_token", null);
                if(token!=null) new Thread(()->{
                    try {
                        TwendeApi.requestWithSession(DriverLocationService.this,"/rest/v1/rpc/update_twende_driver_location","POST",
                            new JSONObject().put("p_latitude",loc.getLatitude()).put("p_longitude",loc.getLongitude())
                                .put("p_accuracy_m",loc.hasAccuracy()?loc.getAccuracy():JSONObject.NULL)
                                .put("p_heading",loc.hasBearing()?loc.getBearing():JSONObject.NULL)
                                .put("p_speed_mps",loc.hasSpeed()?loc.getSpeed():JSONObject.NULL),null);
                    } catch(Exception ex) { android.util.Log.w("TWENDE-GPS","Location update failed; next GPS fix will retry",ex); }
                }).start();
            }
        };
        fused.requestLocationUpdates(request, callback, getMainLooper());
    }

    private void stopTracking() {
        if (callback != null) fused.removeLocationUpdates(callback);
        callback = null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Driver online status", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Persistent notification while TWENDE driver availability is active");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override public void onDestroy() { stopTracking(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
