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
        String raw=out.toString(); return raw.isEmpty()?new JSONObject():new JSONObject(raw.startsWith("[")?"{\\"rows\\":"+raw+"}":raw);
    }

    static JSONObject login(String email,String password) throws Exception {
        return request("/auth/v1/token?grant_type=password","POST",null,
            new JSONObject().put("email",email).put("password",password),null);
    }
    static JSONArray approvedVehicles(String token) throws Exception {
        JSONObject result=request("/rest/v1/driver_vehicles?select=id,vehicle_type,vehicle_make,vehicle_model,plate_number,approval_status,is_online&approval_status=eq.approved&order=created_at.asc","GET",token,null,null);
        return result.optJSONArray("rows")==null?new JSONArray():result.getJSONArray("rows");
    }
    static void setOnline(String token,String vehicleId,boolean online) throws Exception {
        request("/rest/v1/rpc/twende_set_vehicle_online","POST",token,
            new JSONObject().put("p_vehicle_id",vehicleId).put("p_online",online),null);
    }
    static void registerToken(String token,String fcm) throws Exception {
        request("/rest/v1/rpc/register_twende_push_token","POST",token,
            new JSONObject().put("p_token",fcm).put("p_platform","android"),null);
    }
}
