// TWENDE server-side push delivery. Deploy as Supabase Edge Function: send-twende-push.
// Required Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// FIREBASE_SERVICE_ACCOUNT (complete service-account JSON), TWENDE_WEBHOOK_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twende-webhook-secret" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function b64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function firebaseAccessToken(sa: any): Promise<string> {
  const pem = String(sa.private_key).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = head + "." + claim;
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error("Firebase OAuth failed: " + JSON.stringify(data));
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("TWENDE_WEBHOOK_SECRET");
    if (!secret || req.headers.get("x-twende-webhook-secret") !== secret) return json({ error: "Unauthorized webhook" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "{}");
    if (!sa.project_id || !sa.private_key || !sa.client_email) throw new Error("FIREBASE_SERVICE_ACCOUNT secret is incomplete");
    const supabase = createClient(url, serviceKey);
    const event = await req.json();
    const table = event.table;
    const type = event.type;
    const record = event.record || {};
    let recipientIds: string[] = [];
    let title = "TWENDE update";
    let body = "You have a new update in TWENDE.";

    if (table === "ride_requests" && type === "INSERT" && record.status === "pending") {
      // Match the current multi-vehicle registry. Each approved online vehicle
      // belongs to its registering owner/driver account (driver_vehicles.user_id).
      const { data, error } = await supabase.from("driver_vehicles").select("user_id")
        .eq("id", record.driver_vehicle_id)
        .eq("approval_status", "approved").eq("is_online", true);
      if (error) throw error;
      recipientIds = [...new Set((data || []).map((x: any) => x.user_id).filter(Boolean))];
      title = record.service_type === "motorcycle" ? "New motorcycle taxi request" : "New car taxi request";
      body = (record.pickup_text || "New pickup") + " → " + (record.destination_text || "Destination");
    } else if (table === "ride_requests" && type === "UPDATE" && record.status === "accepted") {
      // Notify the passenger and the owner of the actual vehicle used.
      recipientIds = record.rider_id ? [record.rider_id] : [];
      if (record.driver_vehicle_id) {
        const { data: vehicle, error } = await supabase.from("driver_vehicles")
          .select("user_id").eq("id", record.driver_vehicle_id).maybeSingle();
        if (error) throw error;
        if (vehicle?.user_id) recipientIds.push(vehicle.user_id);
      }
      recipientIds = [...new Set(recipientIds.filter(Boolean))];
      title = "TWENDE ride accepted";
      body = "Your " + (record.service_type || "taxi") + " ride has been accepted.";
    } else if (table === "bookings" && type === "INSERT" && record.motorcycle_id) {
      const { data: bike, error } = await supabase.from("motorcycles").select("owner_id,make,model").eq("id", record.motorcycle_id).maybeSingle();
      if (error) throw error;
      recipientIds = bike?.owner_id ? [bike.owner_id] : [];
      title = "New motorcycle hire request";
      body = "A customer has requested to hire your " + [bike?.make, bike?.model].filter(Boolean).join(" ") + ".";
    } else {
      return json({ ok: true, ignored: true, reason: "No notification rule for this event" });
    }

    if (!recipientIds.length) return json({ ok: true, sent: 0, reason: "No matching recipients" });
    const { data: tokens, error: tokenError } = await supabase.from("device_push_tokens").select("token").in("user_id", recipientIds);
    if (tokenError) throw tokenError;
    if (!tokens?.length) return json({ ok: true, sent: 0, reason: "Recipients have not registered a device token" });

    const accessToken = await firebaseAccessToken(sa);
    let sent = 0;
    const failures: unknown[] = [];
    for (const item of tokens) {
      const response = await fetch("https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send", {
        method: "POST",
        headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: item.token, notification: { title, body }, android: { priority: "HIGH", notification: { channel_id: "twende_bookings", sound: "default" } }, data: { table, event_type: type, record_id: String(record.id || "") } } }),
      });
      if (response.ok) sent++;
      else failures.push({ status: response.status, response: await response.text() });
    }
    return json({ ok: true, sent, failed: failures.length, failures });
  } catch (error) {
    console.error("TWENDE push error", error);
    return json({ error: String(error) }, 500);
  }
});
