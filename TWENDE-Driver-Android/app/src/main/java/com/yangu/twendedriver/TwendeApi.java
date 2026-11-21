package com.yangu.twendedriver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

final class TwendeApi {
    static final String BASE = "https://obgteeruczqlebllrafr.supabase.co";
    static final String KEY = "sb_publishable_PeUZGgiMW02w0jstoKhICA_cXw83_Ic";
    private TwendeApi() {}

    static JSONObject request(String path, String method, String accessToken, JSONObject body, String prefer) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(BASE+path).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestProperty("apikey",KEY);
        c.setRequestProperty("Authorization","Bearer "+(accessToken==null?KEY:accessToken));
        c.setRequestProperty("Content-Type","application/json");
        if(prefer!=null)c.setRequestProperty("Prefer",prefer);
        if(body!=null){c.setDoOutput(true);try(OutputStream o=c.getOutputStream()){o.write(body.toString().getBytes("UTF-8"));}}
        int status=c.getResponseCode(); InputStream in=status>=200&&status<300?c.getInputStream():c.getErrorStream();
        StringBuilder out=new StringBuilder(); if(in!=null)try(BufferedReader br=new BufferedReader(new InputStreamReader(in))){String line;while((line=br.readLine())!=null)out.append(line);}
        c.disconnect();
        if(status<200||status>=300)throw new Exception("TWENDE server ("+status+"): "+out);
        String raw=out.toString(); if(raw.isEmpty()) return new JSONObject(); if(raw.startsWith("[")) return new JSONObject().put("rows",new JSONArray(raw)); return new JSONObject(raw);
    }

    static JSONObject requestWithSession(android.content.Context context, String path, String method,
            JSONObject body, String prefer) throws Exception {
        android.content.SharedPreferences prefs = context.getSharedPreferences("twende_driver", android.content.Context.MODE_PRIVATE);
        String access = prefs.getString("access_token", null);
        try {
            if (access == null || access.isEmpty()) throw new Exception("Driver session is missing.");
            return request(path, method, access, body, prefer);
        } catch (Exception first) {
            if (first.getMessage() == null || !first.getMessage().contains("(401)")) throw first;
            String refresh = prefs.getString("refresh_token", null);
            if (refresh == null || refresh.isEmpty()) throw first;
            JSONObject session = refreshSession(refresh);
            String newAccess = session.getString("access_token");
            String newRefresh = session.optString("refresh_token", refresh);
            prefs.edit().putString("access_token", newAccess).putString("refresh_token", newRefresh).apply();
            return request(path, method, newAccess, body, prefer);
        }
    }

    static JSONObject login(String email,String password) throws Exception {
        return request("/auth/v1/token?grant_type=password","POST",null,
            new JSONObject().put("email",email).put("password",password),null);
    }
    static JSONObject refreshSession(String refreshToken) throws Exception {
        return request("/auth/v1/token?grant_type=refresh_token","POST",null,
            new JSONObject().put("refresh_token",refreshToken),null);
    }
    static JSONArray approvedVehicles(String token,String userId) throws Exception {
        String uid=java.net.URLEncoder.encode(userId,"UTF-8");
        JSONObject result=request("/rest/v1/driver_vehicles?select=id,vehicle_type,vehicle_make,vehicle_model,plate_number,approval_status,is_online&user_id=eq."+uid+"&approval_status=eq.approved&order=created_at.asc","GET",token,null,null);
        return result.optJSONArray("rows")==null?new JSONArray():result.getJSONArray("rows");
    }
    static void setOnline(String token,String vehicleId,boolean online) throws Exception {
        request("/rest/v1/rpc/twende_set_vehicle_online","POST",token,
            new JSONObject().put("p_vehicle_id",vehicleId).put("p_online",online),null);
    }
    static JSONArray pendingRides(String token,String service) throws Exception {
        String type=java.net.URLEncoder.encode(service,"UTF-8");
        JSONObject result=request("/rest/v1/ride_requests?select=id,passenger_name,passenger_phone,pickup_text,destination_text,estimated_fare,service_type,created_at&status=eq.pending&service_type=eq."+type+"&order=created_at.asc","GET",token,null,null);
        return result.optJSONArray("rows")==null?new JSONArray():result.getJSONArray("rows");
    }
    static void acceptRide(String token,String rideId) throws Exception {
        request("/rest/v1/rpc/accept_twende_ride","POST",token,new JSONObject().put("p_ride_id",rideId),null);
    }
    static void registerToken(String token,String fcm) throws Exception {
        request("/rest/v1/rpc/register_twende_push_token","POST",token,
            new JSONObject().put("p_token",fcm).put("p_platform","android"),null);
    }
}
