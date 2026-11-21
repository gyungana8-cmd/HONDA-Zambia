package com.yangu.twendedriver;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {
    private EditText email,password;
    private LinearLayout root;
    private String accessToken,vehicleId;
    private boolean online=false;
    private final android.os.Handler bookingHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable bookingRefresh;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TwendeMessagingService.ensureChannel(this);
        requestPermissionsIfNeeded();
        showLogin();
    }

    private void base(String title) {
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(24,24,24,24);
        TextView h=new TextView(this);h.setText(title);h.setTextSize(25);h.setTextColor(0xFF202020);h.setPadding(0,0,0,18);root.addView(h);
        setContentView(root);
    }
    private void showLogin() {
        base("TWENDE DRIVER");
        TextView sub=new TextView(this);sub.setText("Sign in with your approved TWENDE driver account.");root.addView(sub);
        email=new EditText(this);email.setHint("Email address");email.setInputType(33);root.addView(email);
        password=new EditText(this);password.setHint("Password");password.setInputType(129);root.addView(password);
        Button sign=new Button(this);sign.setText("SIGN IN");root.addView(sign);
        sign.setOnClickListener(v->login());
    }
    private void login() {
        final String e=email.getText().toString().trim(),p=password.getText().toString();
        if(e.isEmpty()||p.isEmpty()){toast("Enter your email and password.");return;}
        toast("Signing in…");
        new Thread(()->{try{
            JSONObject session=TwendeApi.login(e,p);String token=session.getString("access_token");
            getSharedPreferences("twende_driver",MODE_PRIVATE).edit().putString("access_token",token).putString("refresh_token",session.optString("refresh_token")).apply();
            String userId=session.optJSONObject("user").getString("id");
            JSONArray vehicles=TwendeApi.approvedVehicles(token,userId);
            runOnUiThread(()->showVehicles(token,vehicles));
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(fcm->new Thread(()->{try{TwendeApi.registerToken(token,fcm);}catch(Exception ex){android.util.Log.e("TWENDE","Token registration pending",ex);}}).start());
        }catch(Exception ex){runOnUiThread(()->toast("Sign-in failed: "+ex.getMessage()));}}).start();
    }
    private void showVehicles(String token,JSONArray vehicles) {
        accessToken=token;base("DRIVER DASHBOARD");
        if(vehicles.length()==0){TextView t=new TextView(this);t.setText("No approved vehicle is assigned to this driver account yet. Ask the vehicle owner or TWENDE administrator to complete approval.");root.addView(t);return;}
        String[] labels=new String[vehicles.length()];
        for(int i=0;i<vehicles.length();i++){JSONObject v=vehicles.optJSONObject(i);labels[i]=v.optString("vehicle_make")+" "+v.optString("vehicle_model")+" • "+v.optString("plate_number")+" ("+v.optString("vehicle_type")+")";}
        Spinner spinner=new Spinner(this);spinner.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));root.addView(spinner);
        Button go=new Button(this);go.setText("GO ONLINE");root.addView(go);
        Button off=new Button(this);off.setText("GO OFFLINE");root.addView(off);
        TextView status=new TextView(this);status.setText("You are offline.");root.addView(status);
        go.setOnClickListener(v->{JSONObject selected=vehicles.optJSONObject(spinner.getSelectedItemPosition());vehicleId=selected.optString("id");setAvailability(true,status);});
        off.setOnClickListener(v->{if(vehicleId!=null)setAvailability(false,status);});
        Button rides=new Button(this);rides.setText("REFRESH BOOKING REQUESTS");root.addView(rides);
        LinearLayout rideList=new LinearLayout(this);rideList.setOrientation(LinearLayout.VERTICAL);root.addView(rideList);
        rides.setOnClickListener(v->loadRides(rideList,selectedService(vehicles,spinner.getSelectedItemPosition())));
        bookingRefresh = new Runnable() {
            @Override public void run() {
                if (!isFinishing() && !isDestroyed()) {
                    loadRides(rideList, selectedService(vehicles, spinner.getSelectedItemPosition()));
                    bookingHandler.postDelayed(this, 15000);
                }
            }
        };
        bookingHandler.removeCallbacks(bookingRefresh);
        bookingHandler.post(bookingRefresh);
        Button portal=new Button(this);portal.setText("OPEN FULL DRIVER PORTAL");root.addView(portal);
        portal.setOnClickListener(v->{startActivity(new Intent(this,DriverPortalActivity.class));});
    }
    private String selectedService(JSONArray vehicles,int index) {
        JSONObject v=vehicles.optJSONObject(index);
        String type=v==null?"car":v.optString("vehicle_type","car");
        return type.equalsIgnoreCase("motorcycle")?"motorcycle":"car";
    }
    private void loadRides(LinearLayout list,String service) {
        list.removeAllViews();
        TextView loading=new TextView(this);loading.setText("Checking for new "+service+" requests…");list.addView(loading);
        new Thread(()->{try{
            JSONArray rides=TwendeApi.pendingRides(accessToken,service);
            runOnUiThread(()->{
                list.removeAllViews();
                if(rides.length()==0){TextView empty=new TextView(this);empty.setText("No pending requests at the moment.");list.addView(empty);return;}
                for(int i=0;i<rides.length();i++){
                    JSONObject ride=rides.optJSONObject(i);String id=ride.optString("id");
                    TextView details=new TextView(this);
                    details.setPadding(0,14,0,8);details.setTextSize(15);
                    details.setText(ride.optString("passenger_name","Passenger")+" • "+ride.optString("passenger_phone")+"\\nPickup: "+ride.optString("pickup_text")+"\\nDestination: "+ride.optString("destination_text")+"\\nEstimated fare: K"+ride.optString("estimated_fare"));
                    list.addView(details);
                    Button call=new Button(this);call.setText("CALL PASSENGER");list.addView(call);
                    call.setOnClickListener(v->{
                        String phone=ride.optString("passenger_phone","");
                        if(phone.isEmpty()){toast("Passenger phone number is unavailable.");return;}
                        try { startActivity(new Intent(Intent.ACTION_DIAL,android.net.Uri.parse("tel:"+android.net.Uri.encode(phone)))); }
                        catch(Exception ex){toast("Could not open the phone dialler.");}
                    });
                    Button accept=new Button(this);accept.setText("ACCEPT THIS RIDE");list.addView(accept);
                    accept.setOnClickListener(v->new Thread(()->{try{
                        TwendeApi.acceptRide(accessToken,id);
                        runOnUiThread(()->{toast("Ride accepted.");loadRides(list,service);});
                    }catch(Exception ex){runOnUiThread(()->toast("Ride could not be accepted: "+ex.getMessage()));}}).start());
                }
            });
        }catch(Exception ex){runOnUiThread(()->toast("Could not load requests: "+ex.getMessage()));}}).start();
    }

    private void setAvailability(boolean value,TextView status) {
        if(value && ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissionsIfNeeded();toast("Allow location permission, then select Go Online again.");return;}
        new Thread(()->{try{
            TwendeApi.setOnline(accessToken,vehicleId,value);
            runOnUiThread(()->{
                online=value;status.setText(value?"ONLINE — background GPS service active":"OFFLINE — location sharing stopped");
                Intent service=new Intent(this,DriverLocationService.class);
                if(value){service.setAction(DriverLocationService.ACTION_START);service.putExtra("access_token",accessToken);if(Build.VERSION.SDK_INT>=26)startForegroundService(service);else startService(service);}
                else{service.setAction(DriverLocationService.ACTION_STOP);startService(service);}
            });
        }catch(Exception ex){runOnUiThread(()->toast("Could not change availability: "+ex.getMessage()));}}).start();
    }
    private void requestPermissionsIfNeeded(){
        java.util.ArrayList<String>w=new java.util.ArrayList<>();
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)w.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)w.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!w.isEmpty())ActivityCompat.requestPermissions(this,w.toArray(new String[0]),501);
    }
    @Override protected void onPause() {
        super.onPause();
        if (bookingRefresh != null) bookingHandler.removeCallbacks(bookingRefresh);
    }
    @Override protected void onResume() {
        super.onResume();
        if (bookingRefresh != null) bookingHandler.post(bookingRefresh);
    }
    @Override protected void onDestroy() {
        if (bookingRefresh != null) bookingHandler.removeCallbacks(bookingRefresh);
        super.onDestroy();
    }
    private void toast(String s){runOnUiThread(()->Toast.makeText(this,s,Toast.LENGTH_LONG).show());}
}
