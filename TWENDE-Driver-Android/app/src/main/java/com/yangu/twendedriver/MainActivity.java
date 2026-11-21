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
        String savedRefresh = getSharedPreferences("twende_driver", MODE_PRIVATE).getString("refresh_token", null);
        if (savedRefresh == null || savedRefresh.isEmpty()) showLogin();
        else restoreSession(savedRefresh);
    }

    private void base(String title) {
        ScrollView page = new ScrollView(this);
        page.setFillViewport(true);
        root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24,24,24,24);
        TextView h=new TextView(this);
        h.setText(title);
        h.setTextSize(25);
        h.setTextColor(0xFF202020);
        h.setPadding(0,0,0,18);
        root.addView(h);
        page.addView(root);
        setContentView(page);
    }
    private void restoreSession(String refreshToken) {
        base("TWENDE DRIVER");
        TextView message = new TextView(this);
        message.setText("Restoring your secure driver session…");
        root.addView(message);
        new Thread(() -> {
            try {
                JSONObject session = TwendeApi.refreshSession(refreshToken);
                String token = session.getString("access_token");
                String nextRefresh = session.optString("refresh_token", refreshToken);
                getSharedPreferences("twende_driver", MODE_PRIVATE).edit()
                    .putString("access_token", token).putString("refresh_token", nextRefresh).apply();
                JSONObject user = session.optJSONObject("user");
                if (user == null || user.optString("id").isEmpty()) throw new Exception("Driver account details were not returned.");
                JSONArray vehicles = TwendeApi.approvedVehicles(token, user.getString("id"));
                runOnUiThread(() -> showVehicles(token, vehicles));
                FirebaseMessaging.getInstance().getToken().addOnSuccessListener(fcm ->
                    new Thread(() -> { try { TwendeApi.registerToken(MainActivity.this, fcm); }
                    catch (Exception ex) { android.util.Log.e("TWENDE", "Push token registration will retry", ex); } }).start());
            } catch (Exception ex) {
                getSharedPreferences("twende_driver", MODE_PRIVATE).edit()
                    .remove("access_token").remove("refresh_token").apply();
                runOnUiThread(() -> { toast("Please sign in again to continue."); showLogin(); });
            }
        }).start();
    }

    private void showLogin() {
        base("TWENDE DRIVER");
        TextView sub=new TextView(this);sub.setText("Sign in with your approved TWENDE driver account.");root.addView(sub);
        email=new EditText(this);email.setHint("Email address");email.setInputType(33);root.addView(email);
        password=new EditText(this);password.setHint("Password");password.setInputType(129);root.addView(password);
        Button partnerPortal=new Button(this);
        partnerPortal.setText("OPEN DRIVER & VEHICLE OWNER PORTAL");
        root.addView(partnerPortal);
        partnerPortal.setOnClickListener(v->startActivity(new Intent(this,DriverPortalActivity.class)));
        TextView or=new TextView(this);or.setText("— OR sign in for the quick driver dashboard —");or.setPadding(0,22,0,10);root.addView(or);
        Button sign=new Button(this);sign.setText("DRIVER DASHBOARD SIGN IN");root.addView(sign);
        sign.setOnClickListener(v->login());
    }
    private void login() {
        final String e=email.getText().toString().trim(),p=password.getText().toString();
        if(e.isEmpty()||p.isEmpty()){toast("Enter your email and password.");return;}
        toast("Signing in…");
        new Thread(()->{try{
            JSONObject session=TwendeApi.login(e,p);String token=session.getString("access_token");
            getSharedPreferences("twende_driver",MODE_PRIVATE).edit().putString("access_token",token).putString("refresh_token",session.optString("refresh_token")).apply();
            JSONObject user=session.optJSONObject("user");
            if(user==null||user.optString("id").isEmpty())throw new Exception("Driver account details were not returned.");
            String userId=user.getString("id");
            JSONArray vehicles=TwendeApi.approvedVehicles(token,userId);
            runOnUiThread(()->showVehicles(token,vehicles));
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(fcm->new Thread(()->{try{TwendeApi.registerToken(MainActivity.this,fcm);}catch(Exception ex){android.util.Log.e("TWENDE","Token registration pending",ex);}}).start());
        }catch(Exception ex){runOnUiThread(()->toast("Sign-in failed: "+ex.getMessage()));}}).start();
    }
    private void showVehicles(String token,JSONArray vehicles) {
        accessToken=token;base("TWENDE PARTNER");
        TextView intro=new TextView(this);
        intro.setText("One app for TWENDE drivers and vehicle owners. Use the full partner portal to switch between every role approved for your account.");
        intro.setTextSize(15);intro.setPadding(0,0,0,16);root.addView(intro);
        Button partnerPortal=new Button(this);
        partnerPortal.setText("OPEN DRIVER & VEHICLE OWNER PORTAL");
        root.addView(partnerPortal);
        partnerPortal.setOnClickListener(v->startActivity(new Intent(this,DriverPortalActivity.class)));
        if(vehicles.length()==0){
            TextView t=new TextView(this);
            t.setText("No driver vehicle is currently assigned to this account. If you are an approved vehicle owner, open the partner portal above to manage your fleet and drivers. Driver access will appear here when an approved vehicle is assigned.");
            t.setTextSize(15);t.setPadding(0,16,0,12);root.addView(t);
            Button signOut=new Button(this);signOut.setText("SIGN OUT");root.addView(signOut);
            signOut.setOnClickListener(v->{getSharedPreferences("twende_driver",MODE_PRIVATE).edit().clear().apply();showLogin();});
            return;
        }
        String[] labels=new String[vehicles.length()];
        for(int i=0;i<vehicles.length();i++){JSONObject v=vehicles.optJSONObject(i);labels[i]=v.optString("vehicle_make")+" "+v.optString("vehicle_model")+" • "+v.optString("plate_number")+" ("+v.optString("vehicle_type")+")";}
        Spinner spinner=new Spinner(this);spinner.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));root.addView(spinner);
        Button go=new Button(this);go.setText("GO ONLINE");root.addView(go);
        Button off=new Button(this);off.setText("GO OFFLINE");root.addView(off);
        TextView status=new TextView(this);root.addView(status);
        spinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, android.view.View view, int position, long id) {
                JSONObject selected=vehicles.optJSONObject(position);
                if(selected==null)return;
                vehicleId=selected.optString("id");
                online=selected.optBoolean("is_online",false);
                status.setText(online?"ONLINE — this vehicle is marked available":"You are offline.");
                if(online) startLocationService();
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
        });
        go.setOnClickListener(v->{JSONObject selected=vehicles.optJSONObject(spinner.getSelectedItemPosition());if(selected!=null){vehicleId=selected.optString("id");setAvailability(true,status);}});
        off.setOnClickListener(v->{JSONObject selected=vehicles.optJSONObject(spinner.getSelectedItemPosition());if(selected!=null){vehicleId=selected.optString("id");setAvailability(false,status);}});
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
        Button portal=new Button(this);portal.setText("OPEN DRIVER & VEHICLE OWNER PORTAL");root.addView(portal);
        portal.setOnClickListener(v->{startActivity(new Intent(this,DriverPortalActivity.class));});
    }
    private String selectedService(JSONArray vehicles,int index) {
        JSONObject v=vehicles.optJSONObject(index);
        String type=v==null?"car":v.optString("vehicle_type","car");
        return type.equalsIgnoreCase("motorcycle")?"motorcycle":"car";
    }
    private boolean ridesLoading = false;
    private void loadRides(LinearLayout list,String service) {
        if (ridesLoading) return;
        ridesLoading = true;
        list.removeAllViews();
        TextView loading=new TextView(this);loading.setText("Checking for new "+service+" requests…");list.addView(loading);
        new Thread(()->{try{
            JSONArray rides=TwendeApi.pendingRides(MainActivity.this,service);
            runOnUiThread(()->{
                ridesLoading = false;
                list.removeAllViews();
                if(rides.length()==0){TextView empty=new TextView(this);empty.setText("No pending requests at the moment.");list.addView(empty);return;}
                for(int i=0;i<rides.length();i++){
                    JSONObject ride=rides.optJSONObject(i);String id=ride.optString("id");
                    TextView details=new TextView(this);
                    details.setPadding(0,14,0,8);details.setTextSize(15);
                    details.setText(ride.optString("passenger_name","Passenger")+" • "+ride.optString("passenger_phone")+"\nPickup: "+ride.optString("pickup_text")+"\nDestination: "+ride.optString("destination_text")+"\nEstimated fare: K"+ride.optString("estimated_fare"));
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
                        TwendeApi.acceptRide(MainActivity.this,id);
                        runOnUiThread(()->{toast("Ride accepted.");loadRides(list,service);});
                    }catch(Exception ex){runOnUiThread(()->toast("Ride could not be accepted: "+ex.getMessage()));}}).start());
                }
            });
        }catch(Exception ex){runOnUiThread(()->{ridesLoading = false;toast("Could not load requests: "+ex.getMessage());});}}).start();
    }

    private void setAvailability(boolean value,TextView status) {
        if(value && ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissionsIfNeeded();toast("Allow location permission, then select Go Online again.");return;}
        new Thread(()->{try{
            TwendeApi.setOnline(MainActivity.this,vehicleId,value);
            runOnUiThread(()->{
                online=value;status.setText(value?"ONLINE — background GPS service active":"OFFLINE — location sharing stopped");
                if(value) startLocationService();
                else { Intent service=new Intent(this,DriverLocationService.class);service.setAction(DriverLocationService.ACTION_STOP);startService(service); }
            });
        }catch(Exception ex){runOnUiThread(()->toast("Could not change availability: "+ex.getMessage()));}}).start();
    }
    private void startLocationService() {
        Intent service=new Intent(this,DriverLocationService.class);
        service.setAction(DriverLocationService.ACTION_START);
        if(Build.VERSION.SDK_INT>=26) startForegroundService(service); else startService(service);
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
