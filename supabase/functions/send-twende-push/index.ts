// TWENDE server-side push delivery through OneSignal.
// Required Supabase secrets: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, TWENDE_WEBHOOK_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twende-webhook-secret" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("TWENDE_WEBHOOK_SECRET");
    if (!secret || req.headers.get("x-twende-webhook-secret") !== secret) return json({ error: "Unauthorized webhook" }, 401);

    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!appId || !restKey) throw new Error("ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY Supabase secret is missing");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const event = await req.json();
    const table = event.table;
    const type = event.type;
    const record = event.record || {};
    let recipientIds: string[] = [];
    let title = "TWENDE update";
    let body = "You have a new update in TWENDE.";

    if (table === "ride_requests" && type === "INSERT" && record.status === "pending") {
      const { data, error } = await supabase.from("driver_vehicles").select("user_id")
        .eq("approval_status", "approved").eq("is_online", true).eq("vehicle_type", record.service_type);
      if (error) throw error;
      recipientIds = [...new Set((data || []).map((x: any) => x.user_id).filter(Boolean))];
      title = record.service_type === "motorcycle" ? "New motorcycle taxi request" : "New car taxi request";
      body = (record.pickup_text || "New pickup") + " → " + (record.destination_text || "Destination");
    } else if (table === "ride_requests" && type === "UPDATE" && record.status === "accepted") {
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

    recipientIds = [...new Set(recipientIds.filter(Boolean))];
    if (!recipientIds.length) return json({ ok: true, sent: 0, reason: "No matching recipients" });

    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: { "Authorization": "Key " + restKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        include_aliases: { external_id: recipientIds },
        headings: { en: title },
        contents: { en: body },
        data: { table, event_type: type, record_id: String(record.id || "") }
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error("OneSignal API " + response.status + ": " + JSON.stringify(result));
    return json({ ok: true, recipients: recipientIds.length, onesignal: result });
  } catch (error) {
    console.error("TWENDE OneSignal error", error);
    return json({ error: String(error) }, 500);
  }
});
