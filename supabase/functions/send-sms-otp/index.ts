import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function normalizeZambianPhone(input: string): string | null {
  const digits = input.replace(/[\\s()-]/g, "");
  if (/^\\+260[0-9]{9}$/.test(digits)) return digits;
  if (/^260[0-9]{9}$/.test(digits)) return "+" + digits;
  if (/^0[0-9]{9}$/.test(digits)) return "+260" + digits.slice(1);
  return null;
}
async function hashOtp(userId: string, phone: string, otp: string) {
  const bytes = new TextEncoder().encode(userId + ":" + phone + ":" + otp);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("AT_API_KEY");
    const username = Deno.env.get("AT_USERNAME");
    if (!apiKey || !username) return json({ error: "SMS provider secrets are not configured." }, 500);

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Sign in session required." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid passenger session." }, 401);

    const body = await req.json();
    const phone = normalizeZambianPhone(String(body.phone || ""));
    if (!phone) return json({ error: "Enter a valid Zambian mobile number, e.g. 097XXXXXXX or +26097XXXXXXX." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: prior } = await admin.from("passenger_phone_otps").select("created_at").eq("user_id", user.id).maybeSingle();
    if (prior && Date.now() - new Date(prior.created_at).getTime() < 45_000) {
      return json({ error: "Please wait 45 seconds before requesting another code." }, 429);
    }

    const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const otpHash = await hashOtp(user.id, phone, otp);
    const { error: saveError } = await admin.from("passenger_phone_otps").upsert({
      user_id: user.id, phone, otp_hash: otpHash,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      created_at: new Date().toISOString(), attempt_count: 0,
    });
    if (saveError) {
      console.error("OTP storage error:", saveError);
      return json({ error: "Could not prepare verification. Apply the TWENDE OTP database SQL first." }, 500);
    }

    const form = new URLSearchParams({ username, to: phone, from: "TWENDE", message: "Your TWENDE verification code is " + otp + ". It expires in 5 minutes." });
    const smsResponse = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const result = await smsResponse.json().catch(() => ({}));
    if (!smsResponse.ok) {
      console.error("Africa's Talking SMS error:", result);
      return json({ error: "Africa's Talking could not accept the SMS. Check your app status, sender ID approval and account balance." }, 502);
    }
    const recipients = result?.SMSMessageData?.Recipients || [];
    const accepted = recipients.some((r: any) => [100, 101, 102].includes(Number(r.statusCode)));
    if (!accepted) {
      console.error("Africa's Talking rejected SMS:", result);
      return json({ error: result?.SMSMessageData?.Message || "SMS was not accepted. Check sender ID approval and Zambia SMS settings." }, 502);
    }
    return json({ success: true, phone, message: "Verification code sent." });
  } catch (error) {
    console.error("send-sms-otp error:", error);
    return json({ error: "Unexpected SMS service error." }, 500);
  }
});
