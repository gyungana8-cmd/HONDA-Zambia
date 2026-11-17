// TWENDE booking SMS notifications via Africa's Talking.
// Secrets: AT_API_KEY, AT_USERNAME, TWENDE_SMS_WEBHOOK_SECRET.
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twende-sms-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function normalizeZambianPhone(value: unknown): string | null {
  const digits = String(value || "").replace(/[\s()-]/g, "");
  if (/^\+260[0-9]{9}$/.test(digits)) return digits;
  if (/^260[0-9]{9}$/.test(digits)) return "+" + digits;
  if (/^0[0-9]{9}$/.test(digits)) return "+260" + digits.slice(1);
  return null;
}

async function sendSms(phone: string, message: string, apiKey: string, username: string) {
  const form = new URLSearchParams({ username, to: phone, from: "TWENDE", message });
  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Africa's Talking HTTP " + response.status + ": " + JSON.stringify(result));
  const recipients = result?.SMSMessageData?.Recipients || [];
  const accepted = recipients.some((r: any) => [100, 101, 102].includes(Number(r.statusCode)));
  if (!accepted) throw new Error(result?.SMSMessageData?.Message || "Africa's Talking did not accept the SMS.");
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const secret = Deno.env.get("TWENDE_SMS_WEBHOOK_SECRET");
    if (!secret || req.headers.get("x-twende-sms-webhook-secret") !== secret)
      return json({ error: "Unauthorized webhook" }, 401);

    const apiKey = Deno.env.get("AT_API_KEY");
    const username = Deno.env.get("AT_USERNAME");
    if (!apiKey || !username) return json({ error: "Africa's Talking secrets are not configured." }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const event = await req.json();
    const table = event.table;
    const type = event.type;
    const record = event.record || {};
    const recipients = new Set<string>();
    let message = "";

    if (table === "ride_requests" && type === "INSERT" && record.status === "pending") {
      const { data, error } = await supabase.from("driver_vehicles")
        .select("phone").eq("approval_status", "approved")
        .eq("is_online", true).eq("vehicle_type", record.service_type);
      if (error) throw error;
      for (const vehicle of data || []) {
        const phone = normalizeZambianPhone(vehicle.phone);
        if (phone) recipients.add(phone);
      }
      message = "TWENDE: New " + (record.service_type || "taxi") + " request. Pickup: "
        + (record.pickup_text || "See app") + ". Destination: " + (record.destination_text || "See app")
        + ". Open TWENDE to accept.";
    } else if (table === "ride_requests" && type === "UPDATE" && record.status === "accepted") {
      const passengerPhone = normalizeZambianPhone(record.passenger_phone);
      if (passengerPhone) recipients.add(passengerPhone);
      if (record.driver_vehicle_id) {
        const { data: vehicle, error } = await supabase.from("driver_vehicles")
          .select("phone").eq("id", record.driver_vehicle_id).maybeSingle();
        if (error) throw error;
        const ownerPhone = normalizeZambianPhone(vehicle?.phone);
        if (ownerPhone) recipients.add(ownerPhone);
      }
      message = "TWENDE: Your " + (record.service_type || "taxi")
        + " ride has been accepted. Your driver is on the way. Open the app for details.";
    } else {
      return json({ ok: true, ignored: true, reason: "No SMS rule for this event" });
    }

    if (!recipients.size) return json({ ok: true, sent: 0, reason: "No valid recipient phone numbers found" });
    let sent = 0;
    const failures: string[] = [];
    for (const phone of recipients) {
      try {
        await sendSms(phone, message, apiKey, username);
        sent++;
      } catch (error) {
        failures.push(phone + ": " + String(error));
      }
    }
    return json({ ok: failures.length === 0, sent, failed: failures.length, failures });
  } catch (error) {
    console.error("TWENDE booking SMS error:", error);
    return json({ error: String(error) }, 500);
  }
});
