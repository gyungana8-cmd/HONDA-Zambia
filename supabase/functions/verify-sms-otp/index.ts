import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
async function hashOtp(userId: string, phone: string, otp: string) {
  const bytes = new TextEncoder().encode(userId + ":" + phone + ":" + otp);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Passenger session required." }, 401);
    const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: "Invalid passenger session." }, 401);

    const body = await req.json();
    const phone = String(body.phone || "");
    const code = String(body.code || "").replace(/\\s/g, "");
    if (!/^\\+260[0-9]{9}$/.test(phone) || !/^[0-9]{6}$/.test(code)) {
      return json({ error: "Enter the six-digit code sent to your Zambian number." }, 400);
    }

    const admin = createClient(url, service);
    const { data: record, error: readError } = await admin.from("passenger_phone_otps")
      .select("phone,otp_hash,expires_at,attempt_count").eq("user_id", user.id).maybeSingle();
    if (readError || !record) return json({ error: "No active code found. Request a new SMS code." }, 400);
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await admin.from("passenger_phone_otps").delete().eq("user_id", user.id);
      return json({ error: "That code has expired. Request a new one." }, 400);
    }
    if (record.attempt_count >= 5) {
      await admin.from("passenger_phone_otps").delete().eq("user_id", user.id);
      return json({ error: "Too many incorrect attempts. Request a new code." }, 429);
    }
    const submitted = await hashOtp(user.id, phone, code);
    if (record.phone !== phone || submitted !== record.otp_hash) {
      await admin.from("passenger_phone_otps").update({ attempt_count: record.attempt_count + 1 }).eq("user_id", user.id);
      return json({ error: "Incorrect verification code." }, 400);
    }
    await admin.from("passenger_phone_otps").delete().eq("user_id", user.id);
    return json({ success: true, phone });
  } catch (error) {
    console.error("verify-sms-otp error:", error);
    return json({ error: "Unexpected verification error." }, 500);
  }
});
