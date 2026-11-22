/* TWENDE browser client. Publishable keys are public by design.
   NEVER put a Supabase secret or service_role key in browser code. */
const SUPABASE_URL = "https://obgteeruczqlebllrafr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PeUZGgiMW02w0jstoKhICA_cXw83_Ic";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
// Expose the shared publishable client immediately for GPS/fare modules.
window.twendeDb = db;

const TWENDE_ENTRY_PORTAL = new URLSearchParams(window.location.search).get("portal");
const TWENDE_PARTNER_APP = TWENDE_ENTRY_PORTAL === "partner" || TWENDE_ENTRY_PORTAL === "driver";
const TWENDE_PASSENGER_NATIVE_APP = window.location.protocol === "file:" && !TWENDE_PARTNER_APP;
if (TWENDE_PARTNER_APP) document.body.classList.add("partner-entry-mode");
if (TWENDE_PASSENGER_NATIVE_APP) document.documentElement.classList.add("twende-passenger-app");
let currentUser = null, currentProfile = null, role = "rider";
let verifiedAdmin = false, hasDriverRegistration = false, hasOwnerAccess = false, currentAdminRole = null;
let activePortal = null, activePortalUserId = null;
Object.defineProperty(window, "currentTwendeUser", { configurable:true, get:()=>currentUser });
let verifiedPassengerPhone = null;
let selectedBike = null, liveBikes = [], liveBookings = [];
const $ = s => document.querySelector(s);
const money = n => "K" + Number(n || 0).toLocaleString("en-ZM", {maximumFractionDigits: 2});
const addDaysISO = (date,days) => { const d=new Date(date+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+Number(days||1)); return d.toISOString().slice(0,10); };
const datesOverlap = (aStart,aDays,bStart,bDays) => aStart < addDaysISO(bStart,bDays) && bStart < addDaysISO(aStart,aDays);
const localISODate = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const bikeBookedOn = (bikeId,date) => liveBookings.some(x=>x.motorcycle_id===bikeId && datesOverlap(x.start_date,x.days,date,1));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const TWENDE_VEHICLE_IMAGES = { car: "assets/twende-car-v2.svg", motorcycle: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Kawasaki_1400GTR.jpg/960px-Kawasaki_1400GTR.jpg" };
function twendeVehicleImage(type, altText) {
  const kind = type === "car" ? "car" : "motorcycle";
  const fallback = kind === "car" ? "TWENDE branded car taxi" : "TWENDE branded motorcycle taxi";
  return `<img class="twende-vehicle-art" src="${TWENDE_VEHICLE_IMAGES[kind]}" alt="${esc(altText || fallback)}" loading="lazy">`;
}

function toast(message) {
  // Native dialogs render in the browser top layer, above ordinary fixed
  // elements such as #toast. Keep booking errors inside the open ride form.
  const rideDialog=$("#rideDialog"), inline=$("#rideSubmitMessage");
  if(rideDialog?.open && inline){
    inline.textContent=message;
    inline.hidden=false;
    inline.style.display="block";
    inline.style.visibility="visible";
    inline.setAttribute("role","alert");
    inline.classList.add("is-visible");
    requestAnimationFrame(()=>inline.scrollIntoView({block:"center",behavior:"smooth"}));
    return;
  }
  const t=$("#toast"); t.textContent=message; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),5000);
}
function closeDialog(id) { document.getElementById(id).close(); }
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click",()=>closeDialog(b.dataset.close)));

function isGuestRider(user=currentUser){ return !!user?.is_anonymous; }
function updateUI() {
  const guest=TWENDE_PASSENGER_NATIVE_APP || !currentUser || isGuestRider();
  // A user may hold more than one approved role. The selected portal, not the
  // user's highest privilege, determines which dashboard is visible.
  if(!guest && !activePortal){
    if(currentProfile?.role==="driver" && hasDriverRegistration) activePortal="driver";
    else if(currentProfile?.role==="owner" && hasOwnerAccess) activePortal="owner";
    else if(currentProfile?.role==="admin" && verifiedAdmin) activePortal="admin";
    else if(hasDriverRegistration && !hasOwnerAccess) activePortal="driver";
    else if(hasOwnerAccess && !hasDriverRegistration) activePortal="owner";
    else if(verifiedAdmin) activePortal="admin";
    else if(hasDriverRegistration) activePortal="driver";
    else if(hasOwnerAccess) activePortal="owner";
  }
  const isAdmin=!guest && activePortal==="admin" && verifiedAdmin;
  const isOwner=!guest && activePortal==="owner" && hasOwnerAccess;
  const isDriver=!guest && activePortal==="driver" && hasDriverRegistration;
  document.body.classList.toggle("passenger-mode",guest);
  document.body.classList.toggle("partner-authenticated",!guest&&(isDriver||isOwner));
  document.documentElement.classList.toggle("twende-passenger-app",TWENDE_PASSENGER_NATIVE_APP);
  document.body.classList.toggle("operator-mode",!guest);
  document.body.classList.toggle("driver-mode",isDriver);
  document.body.classList.toggle("owner-mode",isOwner);
  document.body.classList.toggle("admin-mode",isAdmin);
  $("#accountStatus").textContent=guest?"Passenger":(currentProfile?.full_name||currentUser?.email||"TWENDE partner");
  $("#authButton").classList.add("hidden");
  $("#signOutButton").classList.toggle("hidden",!currentUser||guest);
  $("#dashTitle").textContent=isOwner?"Vehicle owner dashboard":isDriver?"Driver dashboard":isAdmin?"Administrator dashboard":"Your dashboard";
  $("#switchRole")?.classList.add("hidden");
  $("#menuBtn")?.classList.remove("hidden");
  $("#nav")?.classList.toggle("hidden",guest);
  $("#adminNav")?.classList.toggle("hidden",!isAdmin);
  $("#ride-services")?.classList.toggle("hidden",!guest);
  $("#driver-panel")?.classList.toggle("hidden",guest||!isDriver);
  $("#adminPanel")?.classList.toggle("hidden",!isAdmin);
  $("#dashboard")?.classList.toggle("hidden",!isOwner);
  window.twendeRoleSnapshot={role,activePortal:guest?null:activePortal,admin:verifiedAdmin,adminRole:currentAdminRole||null,hasDriverRegistration,hasOwnerAccess,guest:!currentUser||isGuestRider(),signedIn:!!currentUser};
  window.twendeSetActivePortal=async portal=>{
    if(portal==="driver"&&!hasDriverRegistration)return;
    if(portal==="owner"&&!hasOwnerAccess)return;
    if(portal==="admin"&&!verifiedAdmin)return;
    activePortal=portal;activePortalUserId=currentUser?.id||null;role=portal;updateUI();
    if(portal==="driver")await loadDriverDashboard();
    else if(portal==="owner")await loadDashboard();
    else if(portal==="admin")await loadAdminDashboard();
  };
  window.twendeRefreshRoleMenu?.();
}
async function loadProfile(user) {
  if (!user) { currentProfile=null; role="rider"; activePortal=null; activePortalUserId=null; updateUI(); return; }
  // Preserve the portal explicitly selected by this same signed-in user across
  // Supabase token refreshes. A driver who is also a vehicle owner must not be
  // silently switched to the owner dashboard during a background auth refresh.
  const previouslySelectedPortal = activePortalUserId===user.id ? activePortal : null;
  if (isGuestRider(user)) {
    const {data:guestProfile}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
    currentProfile={id:user.id,full_name:guestProfile?.full_name||user.user_metadata?.full_name||null,phone:guestProfile?.phone||user.user_metadata?.phone||null,role:"rider"};
    verifiedPassengerPhone=currentProfile.phone;
    role="rider";updateUI();
    $("#dashboardIntro").textContent="Complete passenger registration before requesting your first taxi.";
    $("#dashboardContent").innerHTML='<p class="muted">Enter your name and mobile number to register for TWENDE.</p>';
    await loadPassengerRides();
    return;
  }
  const {data:existing,error:readError}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if (readError) console.error("Profile read:",readError);
  if (existing) currentProfile={...existing,full_name:user.user_metadata?.full_name||existing.full_name,phone:user.phone||existing.phone};
  else {
    const meta=user.user_metadata||{};
    const row={id:user.id,full_name:meta.full_name||user.email||"Passenger",phone:user.phone||meta.phone||null,role:meta.role||"rider"};
    const {data,error}=await db.from("profiles").insert(row).select().single();
    currentProfile=error?row:data;
    if(error) console.error("Profile create:",error);
  }
  role=["owner","driver","admin"].includes(currentProfile?.role)?currentProfile.role:"rider";
  verifiedAdmin=false; hasDriverRegistration=false; hasOwnerAccess=false; currentAdminRole=null;
  const [adminCheck,driverCheck,partnerAccess,adminRoleCheck]=await Promise.all([
    db.rpc("twende_is_admin"),
    db.from("driver_vehicles").select("id,approval_status").eq("user_id",user.id).limit(1),
    db.rpc("twende_get_partner_access"),
    db.rpc("twende_get_my_admin_role")
  ]);
  verifiedAdmin=!adminCheck.error && adminCheck.data===true;
  currentAdminRole=adminRoleCheck.error?null:adminRoleCheck.data;
  hasDriverRegistration=(!driverCheck.error && (driverCheck.data||[]).length>0) || (!partnerAccess.error && (partnerAccess.data||[]).some(x=>x.partner_type==="driver"));
  hasOwnerAccess=!partnerAccess.error && (partnerAccess.data||[]).some(x=>
    x.partner_type==="vehicle_owner" && x.application_status==="approved" && x.account_status==="active"
  );
  if(hasOwnerAccess && !hasDriverRegistration) role="owner";
  const canRestoreDriver=previouslySelectedPortal==="driver" && hasDriverRegistration;
  const canRestoreOwner=previouslySelectedPortal==="owner" && hasOwnerAccess;
  const canRestoreAdmin=previouslySelectedPortal==="admin" && verifiedAdmin;
  activePortal=canRestoreDriver?"driver":canRestoreOwner?"owner":canRestoreAdmin?"admin":null;
  activePortalUserId=user.id;
  if(activePortal) role=activePortal;
  updateUI();
  // Load independent dashboard panels together instead of serial network waits.
  await Promise.allSettled([
    loadDashboard(),
    loadPassengerRides(),
    loadDriverDashboard(),
    loadAdminDashboard()
  ]);
}
window.twendeReceivePushToken = async function(token) {
  if (!currentUser || !token) return;
  // Use an authenticated RPC so a device token can safely move to the
  // account currently signed in on this physical phone. Direct upsert is
  // blocked by the table's own-user RLS policy when the token belongs to
  // a previous account.
  const { error } = await db.rpc("register_twende_push_token", {
    p_token: token,
    p_platform: "android"
  });
  if (error) {
    console.warn("TWENDE push token registration:", error.message);
    toast("Push registration needs attention: " + error.message);
  } else {
    console.info("TWENDE push token registered for the signed-in account.");
  }
};

// Keep GPS alive in a native Android foreground service while the driver
// explicitly remains online. A WebView timer alone is suspended in background.
window.twendeSyncNativeDriverLocation = async function(online) {
  const bridge = window.TwendeNative;
  if (!bridge) return;
  if (!online) { bridge.stopLocationTracking(); return; }
  try {
    const { data, error } = await db.auth.getSession();
    const session = data?.session;
    if (error || !session?.access_token) {
      console.warn("TWENDE native GPS could not obtain the active session.", error);
      return;
    }
    bridge.startLocationTracking(session.access_token, session.refresh_token || "");
  } catch (error) {
    console.warn("TWENDE native GPS start failed:", error);
  }
};

let twendeSessionQueue=Promise.resolve();
function onSession(session){
  // Supabase auth events and the sign-in form can report the same session.
  // Serialize processing so a second callback cannot reset the portal selected
  // by the first callback while its owner/driver dashboard is still loading.
  twendeSessionQueue=twendeSessionQueue.then(()=>processTwendeSession(session)).catch(error=>{
    console.error("TWENDE session processing:",error);
    toast("Could not finish opening your TWENDE portal. Please refresh and sign in again.");
  });
  return twendeSessionQueue;
}
async function processTwendeSession(session) {
  currentUser=session?.user||null;
  await loadProfile(currentUser);
  // Notify the passenger live map after the guest or signed-in session is ready.
  // The map waits for an authenticated Supabase session before querying nearby drivers.
  window.dispatchEvent(new CustomEvent("twende-session-ready",{detail:{userId:currentUser?.id||null}}));
  // Refresh booking activity and badge after every passenger/partner session change.
  if(typeof loadTwendeNotifications==="function") await loadTwendeNotifications();
  const requested=window.twendeRequestedPortal;
  if(requested && currentUser && !isGuestRider()){
    const allowed=requested==="partner" ? (hasDriverRegistration||hasOwnerAccess) :
      requested==="admin" ? verifiedAdmin :
      requested==="driver" ? hasDriverRegistration :
      requested==="owner" ? hasOwnerAccess : false;
    if(!allowed){
      toast(requested==="partner" ? "This account does not yet have an approved driver or vehicle-owner role." : "This account is not approved for the "+requested+" portal. Please sign in with the account assigned to that role.");
    }else if(requested==="partner"){
      // Let a dual-role partner choose their approved workspace after sign-in.
      activePortal=null;activePortalUserId=null;updateUI();
      window.twendeShowRoleMenu?.();
    }else{
      await window.twendeSetActivePortal?.(requested);
    }
    window.twendeRequestedPortal=null;
  }
  if (currentUser && window.TwendePush?.requestPushToken) window.TwendePush.requestPushToken();
  if(currentUser && !isGuestRider()) { $("#authDialog").close(); }
  else if(!currentUser) { $("#dashboardIntro").textContent="Sign in to view your bookings and listings."; $("#dashboardContent").innerHTML=""; }
}

$("#authButton").onclick=()=>{
  $("#loginForm").classList.remove("hidden");$("#registerForm").classList.add("hidden");
  $("#passengerPhoneForm").classList.add("hidden");$("#passengerOtpForm").classList.add("hidden");
  $("#authDialog").showModal();
};

// Passenger registration is temporarily OTP-free while TWENDE completes SMS-provider compliance.
let pendingPassengerPhone = null;
function normalizePassengerPhone(input){
  // Accept Zambian mobile numbers in local (076xxxxxxx) or international (+26076xxxxxxx) form.
  const digits=String(input||"").replace(/\D/g,"");
  let national="";
  if(digits.startsWith("260")&&digits.length===12) national="0"+digits.slice(3);
  else if(digits.length===10&&digits.startsWith("0")) national=digits;
  else return null;
  // Zambian mobile prefixes; keep validation broad enough for all major networks.
  if(!/^0(?:75|76|77|95|96|97)\d{7}$/.test(national)) return null;
  return "+260"+national.slice(1);
}
function showPassengerRegistration(service){
  pendingPassengerService=service||pendingPassengerService||"car";
  $("#loginForm").classList.add("hidden");$("#registerForm").classList.add("hidden");
  $("#passengerOtpForm").classList.add("hidden");$("#passengerNameForm").classList.add("hidden");
  $("#passengerPhoneForm").classList.remove("hidden");
  $("#passengerPhoneEntry").value=pendingPassengerPhone||currentProfile?.phone||"";
  $("#passengerPhoneForm").querySelector(".close")?.classList.add("hidden");
  $("#passengerNameForm").querySelector(".close")?.classList.add("hidden");
  if(!$("#authDialog").open)$("#authDialog").showModal();
}
$("#passengerPhoneForm").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
    const phone=normalizePassengerPhone($("#passengerPhoneEntry").value);
    if(!phone)throw new Error("Enter a valid Zambian mobile number, for example 097XXXXXXX.");
    pendingPassengerPhone=phone;
    $("#passengerPhoneForm").classList.add("hidden");
    $("#passengerNameForm").classList.remove("hidden");
    const parts=(currentProfile?.full_name||currentUser?.user_metadata?.full_name||"").trim().split(/\\s+/);
    $("#passengerFirstName").value=parts[0]||"";
    $("#passengerLastName").value=parts.slice(1).join(" ");
    showAuthNotice("#passengerNameForm","SMS verification is temporarily disabled. Enter your name to complete passenger registration.",true);
  }catch(error){showAuthNotice("#passengerPhoneForm",error.message||"Please check your mobile number.");}
  finally{b.disabled=false;}
};
$("#passengerOtpForm").onsubmit=e=>{e.preventDefault();showAuthNotice("#passengerOtpForm","SMS verification is temporarily disabled. You do not need an OTP to register.",true);};
$("#changePassengerPhone").onclick=()=>{
  $("#passengerNameForm").classList.add("hidden");$("#passengerPhoneForm").classList.remove("hidden");
};
$("#passengerNameForm").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
    const first=$("#passengerFirstName").value.trim(),last=$("#passengerLastName").value.trim();
    if(!first||!last)throw new Error("Enter both your first name and last name.");
    const fullName=(first+" "+last).trim();
    const phone=pendingPassengerPhone||currentProfile?.phone||currentUser?.phone;
    if(!currentUser||!phone)throw new Error("Enter a valid mobile number to complete registration.");
    const {error:authError}=await db.auth.updateUser({data:{full_name:fullName,first_name:first,last_name:last,phone,role:"rider",passenger_registration_complete:true}});
    if(authError)throw authError;
    const {error:profileError}=await db.from("profiles").upsert({id:currentUser.id,full_name:fullName,phone,role:"rider"});
    if(profileError)throw profileError;
    currentProfile={...(currentProfile||{}),id:currentUser.id,full_name:fullName,phone,role:"rider"};
    verifiedPassengerPhone=phone;pendingPassengerPhone=null;
    $("#passengerNameForm").reset();$("#authDialog").close();
    toast("Passenger registration complete. Welcome to TWENDE, "+first+".");
    // Registration ends at the passenger homepage. GPS is optional and can be
    // requested later from the homepage when the passenger sets a pickup.
    $("#locationPermissionDialog").close();
    $("#ride-services")?.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(error){showAuthNotice("#passengerNameForm","Could not save passenger profile: "+(error?.message||"Please try again."));}
  finally{b.disabled=false;}
};

$("#sharePickupLocation").onclick=async()=>{
  const b=$("#sharePickupLocation");b.disabled=true;
  try {
    const location=await window.twendeCapturePassengerLocation();
    window.twendePickupCoords=location;
    $("#ridePickup").value=location.label;
    $("#locationPermissionDialog").close();
    const service=pendingPassengerService||"car";pendingPassengerService=null;
    openRideDialog(service,true);
    toast("Pickup location found using GPS.");
  } catch(err) {
    toast(err.message||"Could not get your location. You can enter it manually.");
  } finally {b.disabled=false;}
};
$("#enterPickupManually").onclick=()=>{
  $("#locationPermissionDialog").close();
  const service=pendingPassengerService||"car";pendingPassengerService=null;
  openRideDialog(service,true);
};
$("#showRegister").onclick=()=>{ $("#loginForm").classList.add("hidden"); $("#registerForm").classList.remove("hidden"); };
$("#showLogin").onclick=()=>{ $("#registerForm").classList.add("hidden"); $("#loginForm").classList.remove("hidden"); };
function showRegistrationError(message,success=false){
  const form=$("#registerForm");let box=$("#registerError");
  if(!box){box=document.createElement("div");box.id="registerError";box.setAttribute("role","alert");box.setAttribute("aria-live","assertive");form.querySelector('button[type="submit"]')?.before(box);}
  box.textContent=message;
  box.style.cssText="display:block!important;visibility:visible!important;opacity:1!important;margin:12px 0;padding:14px 16px;border-radius:12px;border:1px solid "+(success?"#16834a":"#c62828")+";background:"+(success?"#eaf7ef":"#fff0f0")+";color:"+(success?"#145c35":"#8f1717")+";font-size:14px;font-weight:700;line-height:1.45;white-space:normal;overflow-wrap:anywhere;position:relative;z-index:5";
}
$("#registerForm").onsubmit=async e=>{
  e.preventDefault();
  const b=e.submitter||$("#registerForm button[type='submit']");
  $("#registerError")?.remove();
  b.disabled=true;
  try{
    const email=$("#registerEmail").value.trim().toLowerCase();
    const password=$("#registerPassword").value;
    const profileData={
      full_name:$("#registerName").value.trim(),
      phone:$("#registerPhone").value.trim(),
      role:$("#registerRole").value
    };
    const {data:sessionData,error:sessionError}=await db.auth.getSession();
    if(sessionError) throw sessionError;
    const activeUser=sessionData.session?.user||null;
    currentUser=activeUser;

    // Convert a passenger's anonymous session in two safe stages:
    // first link and verify the email, then set the password after verification.
    if(activeUser?.is_anonymous){
      const {data,error}=await db.auth.updateUser(
        {email,data:profileData},
        {emailRedirectTo:window.location.origin+window.location.pathname}
      );
      if(error) throw error;
      showRegistrationError(
        "Email verification requested for "+email+". Open the verification email and confirm it. Keep this browser session open. After confirmation, return to this form and submit the same email and your chosen password to finish account setup.",
        true
      );
      return;
    }

    // Once the email is verified, finish the existing account instead of creating a duplicate.
    if(activeUser?.email && activeUser.email.toLowerCase()===email){
      const {data,error}=await db.auth.updateUser({password,data:profileData});
      if(error) throw error;
      const {data:latest}=await db.auth.getSession();
      await onSession(data.session||latest.session);
      showRegistrationError("Your TWENDE account is now linked and your password has been set. You can sign in normally next time.",true);
      return;
    }

    // No anonymous session: create a normal email/password account.
    const {data,error}=await db.auth.signUp({
      email,password,
      options:{
        data:profileData,
        emailRedirectTo:window.location.origin+window.location.pathname
      }
    });
    if(error) throw error;
    if(data.session){
      await onSession(data.session);
      showRegistrationError("TWENDE account created successfully.",true);
    }else{
      showRegistrationError("Account created. Check your email to confirm the address, then sign in.",true);
    }
  }catch(error){
    console.error("TWENDE registration failed:",error);
    showRegistrationError("Account setup failed: "+(error?.message||"Unexpected network or application error. Please try again."));
  }finally{
    b.disabled=false;
  }
};
function showAuthNotice(formId,message,success=false){
  const form=$(formId);let box=form.querySelector(".auth-inline-notice");
  if(!box){box=document.createElement("div");box.className="auth-inline-notice";box.setAttribute("role","status");box.setAttribute("aria-live","polite");form.querySelector('button[type="submit"]')?.before(box);}
  box.textContent=message;
  box.style.cssText="display:block!important;margin:12px 0;padding:14px 16px;border-radius:12px;border:1px solid "+(success?"#16834a":"#c62828")+";background:"+(success?"#eaf7ef":"#fff0f0")+";color:"+(success?"#145c35":"#8f1717")+";font-size:14px;font-weight:700;line-height:1.45;overflow-wrap:anywhere";
}
$("#showForgotPassword")?.addEventListener("click",()=>{
  $("#loginForm").classList.add("hidden");
  $("#registerForm").classList.add("hidden");
  $("#passwordRecoveryForm").classList.remove("hidden");
  $("#recoveryEmail").value=$("#loginEmail").value.trim();
});
$("#backToLogin")?.addEventListener("click",()=>{
  $("#passwordRecoveryForm").classList.add("hidden");
  $("#loginForm").classList.remove("hidden");
});
$("#passwordRecoveryForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const button=e.submitter||e.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true;
  try{
    const email=$("#recoveryEmail").value.trim().toLowerCase();
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
    if(error)throw error;
    showAuthNotice("#passwordRecoveryForm","If this email is registered, TWENDE has sent a password-reset link. Open it in this same browser, then set a new password.",true);
  }catch(error){showAuthNotice("#passwordRecoveryForm","Password reset request failed: "+(error?.message||"Please try again."));}
  finally{button.disabled=false;}
});
$("#passwordUpdateForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const button=e.submitter||e.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true;
  try{
    const password=$("#newAccountPassword").value;
    if(password.length<6)throw new Error("Use at least 6 characters for the new password.");
    const {data,error}=await db.auth.updateUser({password});
    if(error)throw error;
    $("#passwordUpdateForm").classList.add("hidden");
    $("#loginForm").classList.remove("hidden");
    $("#loginEmail").value=data.user?.email||"";
    $("#loginPassword").value="";
    showAuthNotice("#loginForm","Password updated. Sign in using your new password.",true);
  }catch(error){showAuthNotice("#passwordUpdateForm","Password update failed: "+(error?.message||"Open the reset link again and retry."));}
  finally{button.disabled=false;}
});
function showLoginError(message){
  const form=$("#loginForm");let box=$("#loginError");
  if(!box){box=document.createElement("div");box.id="loginError";box.setAttribute("role","alert");box.setAttribute("aria-live","assertive");form.querySelector('button[type="submit"]')?.before(box);}
  box.textContent=message;
  box.style.cssText="display:block!important;visibility:visible!important;opacity:1!important;margin:12px 0;padding:14px 16px;border-radius:12px;border:1px solid #c62828;background:#fff0f0;color:#8f1717;font-size:14px;font-weight:700;line-height:1.45;white-space:normal;overflow-wrap:anywhere;position:relative;z-index:5";
}
$("#loginForm").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter||$("#loginForm button[type='submit']");
  $("#loginError")?.remove();b.disabled=true;
  try{
    const {data,error}=await db.auth.signInWithPassword({email:$("#loginEmail").value.trim(),password:$("#loginPassword").value});
    if(error){showLoginError("Sign-in failed: "+error.message);return;}
    await onSession(data.session);toast("Signed in to TWENDE.");
  }catch(error){
    console.error("TWENDE sign-in failed:",error);
    showLoginError("Sign-in could not be completed: "+(error?.message||"Unexpected network or application error. Please try again."));
  }finally{b.disabled=false;}
};
$("#driverAccessButton")?.addEventListener("click",()=>{$("#loginForm").classList.remove("hidden");$("#registerForm").classList.add("hidden");$("#authDialog").showModal();});
$("#signOutButton").onclick=async()=>{
  const {error}=await db.auth.signOut();if(error)toast(error.message);else{await onSession(null);await loadMotorcycles();toast("Signed out.");}
};

async function withTimeout(promise,label,ms=15000) {
  return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+" timed out. Check your internet connection and retry.")),ms))]);
}
async function loadMotorcycles() {
  $("#bikeGrid").innerHTML='<p class="muted">Loading live motorcycles…</p>';
  $("#resultCount").textContent="Checking live listings…";
  try {
    const result=await withTimeout(db.from("motorcycles").select("id,make,model,location,daily_rate,description,status").eq("status","available").order("created_at",{ascending:false}),"Motorcycle listing request");
    if(result.error) throw result.error;
    liveBikes=result.data||[];
    liveBookings=[];
    const ids=liveBikes.map(x=>x.id);
    if(ids.length) {
      try {
        const bookings=await withTimeout(db.from("bookings").select("motorcycle_id,start_date,days").in("motorcycle_id",ids).eq("status","accepted"),"Booking availability check",10000);
        if(bookings.error) throw bookings.error;
        liveBookings=bookings.data||[];
      } catch(bookError) {
        console.warn("Booking availability check failed:",bookError);
        $("#bikeGrid").innerHTML='<p class="muted">Motorcycles loaded, but booking availability could not be checked. Please retry before requesting a hire.</p><button class="btn btn-outline" id="retryBikes">Retry</button>';
        $("#resultCount").textContent=liveBikes.length+" listings • availability check needed";
        return;
      }
    }
    renderBikes();
  } catch(error) {
    console.error("Motorcycle listings:",error);
    $("#bikeGrid").innerHTML='<p class="muted">Live motorcycles could not be loaded. Check your internet connection, then try again.</p><button class="btn btn-outline" id="retryBikes">Retry loading</button>';
    $("#resultCount").textContent="Connection problem";
  }
}
function renderBikes() {
  const loc=$("#location").value.trim().toLowerCase(),max=$("#maxPrice").value,cat=$("#category").value;
  const rows=liveBikes.filter(b=>b.location.toLowerCase().includes(loc)&&(max==="all"||Number(b.daily_rate)<=Number(max))&&(cat==="all"||[b.make,b.model,b.description].join(" ").toLowerCase().includes(cat.toLowerCase())));
  $("#bikeGrid").innerHTML=rows.map(b=>{const booked=bikeBookedOn(b.id,localISODate());return `<article class="bike-card"><div class="bike-photo">🏍️</div><div class="bike-info"><h3>${esc(b.make)} ${esc(b.model)}</h3><div class="bike-meta"><span>📍 ${esc(b.location)}</span><span>${booked?"Booked today":"Available"}</span></div><p class="muted">${esc(b.description||"Available for daily hire")}</p><div class="bike-bottom"><div class="price">${money(b.daily_rate)} <small>/ day</small></div><button class="btn btn-red" data-hire="${b.id}">Request hire</button></div></div></article>`;}).join("")||'<p class="muted">No live motorcycles are listed yet. Owners can sign in and publish the first listing.</p>';
  $("#resultCount").textContent=rows.length+" live listing"+(rows.length===1?"":"s");
}
$("#bikeGrid").onclick=e=>{
  if(e.target.closest("#retryBikes")){loadMotorcycles();return;}
  const button=e.target.closest("[data-hire]");if(!button)return;
  if(!currentUser){toast("Sign in or register before requesting a motorcycle.");$("#authDialog").showModal();return;}
  selectedBike=liveBikes.find(b=>b.id===button.dataset.hire);if(!selectedBike)return;
  $("#bookingTitle").textContent="Request "+selectedBike.make+" "+selectedBike.model;
  $("#bookingPrice").textContent=money(selectedBike.daily_rate)+" per day • "+selectedBike.location;
  $("#riderName").value=currentProfile?.full_name||"";$("#riderPhone").value=currentProfile?.phone||"";
  $("#total").textContent=money(selectedBike.daily_rate);$("#bookingDialog").showModal();
};
$("#days").oninput=()=>{if(selectedBike)$("#total").textContent=money(Number(selectedBike.daily_rate)*Math.max(1,Number($("#days").value)||1));};
$("#bookingForm").onsubmit=async e=>{
  e.preventDefault();if(!currentUser||!selectedBike)return;const b=e.submitter;b.disabled=true;const days=Math.max(1,Number($("#days").value)||1),startDate=$("#startDate").value;
  if(!startDate){b.disabled=false;toast("Please choose a hire start date.");return;}
  const {data:accepted,error:availabilityError}=await db.from("bookings").select("start_date,days").eq("motorcycle_id",selectedBike.id).eq("status","accepted");
  if(availabilityError){b.disabled=false;toast("Could not verify motorcycle availability. Please try again.");console.error(availabilityError);return;}
  if((accepted||[]).some(x=>datesOverlap(x.start_date,x.days,startDate,days))){b.disabled=false;toast("This motorcycle is already booked for one or more of those dates. Choose different dates.");return;}
  const {error}=await db.from("bookings").insert({motorcycle_id:selectedBike.id,rider_id:currentUser.id,rider_name:$("#riderName").value.trim(),rider_phone:$("#riderPhone").value.trim(),pickup_location:$("#pickup").value.trim(),start_date:startDate,days,total_amount:Number(selectedBike.daily_rate)*days});
  b.disabled=false;if(error){toast("Booking not sent: "+error.message);return;}
  closeDialog("bookingDialog");e.target.reset();toast("Hire request sent to the motorcycle owner.");await loadDashboard();
};

function openOwnerForm() {
  if(!currentUser || isGuestRider()){toast("Create a driver / owner account to publish a motorcycle.");$("#loginForm").classList.add("hidden");$("#registerForm").classList.remove("hidden");$("#authDialog").showModal();return;}
  if(!["owner","both"].includes(currentProfile?.role)){toast("Your account is registered as a rider. Switch your account type to owner to publish a motorcycle.");return;}
  $("#ownerDialog").showModal();
}
$("#ownerHero")?.addEventListener("click",openOwnerForm);$("#ownerCta")?.addEventListener("click",openOwnerForm);
$("#ownerForm").onsubmit=async e=>{
  e.preventDefault();if(!currentUser)return;const b=e.submitter;b.disabled=true;
  const {error}=await db.from("motorcycles").insert({owner_id:currentUser.id,make:$("#bikeMake").value.trim(),model:$("#bikeModel").value.trim(),location:$("#bikeLocation").value.trim(),daily_rate:Number($("#bikeRate").value),description:$("#bikeDescription").value.trim(),status:"available"});
  b.disabled=false;if(error){toast("Listing not published: "+error.message);return;}
  closeDialog("ownerDialog");e.target.reset();$("#bikeMake").value="Other";toast("Motorcycle listing published.");await loadMotorcycles();await loadDashboard();
};
$("#switchRole").onclick=async()=>{
  if(!currentUser){toast("Please sign in first.");$("#authDialog").showModal();return;}
  const next=role==="owner"?"rider":"owner";
  const {data,error}=await db.from("profiles").update({role:next}).eq("id",currentUser.id).select().single();
  if(error){toast(error.message);return;}currentProfile=data;role=next;updateUI();await loadDashboard();toast("Switched to "+next+" mode.");
};

async function loadDashboard() {
  if(!currentUser)return;
  $("#dashboardIntro").textContent=role==="owner"?"Your motorcycles and incoming hire requests.":"Your hire requests and their current status.";
  if(role==="owner"){
    $("#dashboardIntro").textContent="Manage your approved taxi fleet, assigned drivers, completed trips and TWENDE commission.";
    $("#dashboardContent").innerHTML="";
  } else {
    const {data,error}=await db.from("bookings").select("id,motorcycle_id,pickup_location,start_date,days,total_amount,status").eq("rider_id",currentUser.id).order("created_at",{ascending:false});
    if(error){$("#dashboardContent").textContent=error.message;return;}
    const cards=await Promise.all((data||[]).map(async x=>{const {data:bike}=await db.from("motorcycles").select("make,model,location").eq("id",x.motorcycle_id).maybeSingle();return `<article class="dash-card"><h3>${esc(bike?bike.make+" "+bike.model:"Motorcycle hire")}</h3><p>${esc(bike?.location||x.pickup_location)} • Start: ${esc(x.start_date)} • ${x.days} day(s)</p><p>Total: ${money(x.total_amount)} • Status: <strong>${esc(x.status)}</strong></p></article>`;}));
    $("#dashboardContent").innerHTML=cards.join("")||'<p class="muted">No hire requests yet.</p>';
  }
}
$("#dashboardContent").onclick=async e=>{
  const b=e.target.closest("[data-booking]");if(!b)return;
  if(b.dataset.status==="cancelled"&&!window.confirm("Cancel this accepted booking and release these hire dates?"))return;
  if(b.dataset.status==="accepted"){
    const {data:target,error:targetError}=await db.from("bookings").select("id,motorcycle_id,start_date,days,status").eq("id",b.dataset.booking).maybeSingle();
    if(targetError||!target){toast("Could not verify this hire request. Refresh and try again.");return;}
    const {data:accepted,error:acceptedError}=await db.from("bookings").select("id,start_date,days").eq("motorcycle_id",target.motorcycle_id).eq("status","accepted");
    if(acceptedError){toast("Could not check existing bookings. Try again.");return;}
    const conflict=(accepted||[]).some(x=>x.id!==target.id&&datesOverlap(x.start_date,x.days,target.start_date,target.days));
    if(conflict){toast("Cannot accept: this motorcycle already has an accepted booking for overlapping dates.");return;}
  }
  const {error}=await db.from("bookings").update({status:b.dataset.status}).eq("id",b.dataset.booking);
  if(error)toast("Could not update: "+error.message);else{toast("Booking status updated.");await loadDashboard();}
};
$("#searchBtn").onclick=renderBikes;$("#location").onkeydown=e=>{if(e.key==="Enter")renderBikes();};
$("#category").onchange=renderBikes;$("#maxPrice").onchange=renderBikes;
$("#menuBtn").onclick=()=>window.twendeShowRoleMenu?.();


/* TWENDE ride-hailing: cash-only taxi requests and driver onboarding.
   Live map/GPS matching and fare routing are intentionally not claimed until a maps provider is configured. */
let selectedRideService = "motorcycle";
let pendingPassengerService=null;
function clearTwendeRidePickerState(){
  const message=$("#rideSubmitMessage");
  if(message){
    message.hidden=true;
    message.textContent="";
    message.classList.remove("is-visible");
    message.style.removeProperty("display");
    message.style.removeProperty("visibility");
  }
  const selected=$("#selectedTwendeVehicleId");
  if(selected)selected.value="";
  const button=$("#rideRequestSubmit");
  if(button){button.disabled=true;button.textContent="Choose a vehicle first";}
}
function openRideDialog(service) {
  clearTwendeRidePickerState();
  selectedRideService=service;pendingPassengerService=service;
  $("#rideServiceType").value=service;
  $("#rideDialogTitle").textContent=service==="car"?"Choose a car taxi":"Choose a motorcycle taxi";
  $("#selectedTwendeVehicleId").value="";$("#rideRequestSubmit").disabled=true;$("#rideRequestSubmit").textContent="Choose a vehicle first";
  const pickup=$("#ridePickup"), destination=$("#rideDestination");
  if(pickup&&!pickup.value){
    const current=$("#twendeCurrentLocation")?.textContent?.trim();
    pickup.value=window.twendePickupCoords?.label||(current&&current!=="Location not set yet"?current:"");
  }
  if(destination&&!destination.value){
    destination.value=window.twendeDestinationCoords?.label||$("#twendeDestinationSearch")?.value?.trim()||"";
  }
  (async()=>{
    try{
      let {data,error}=await db.auth.getSession();if(error)throw error;
      let session=data?.session;
      if(!session){
        const guest=await db.auth.signInAnonymously();
        if(guest.error)throw new Error("Passenger registration could not start. Please try again.");
        session=guest.data?.session;
      }
      if(!session?.user)throw new Error("Passenger session could not start. Check your internet connection.");
      if(!currentUser||currentUser.id!==session.user.id)await onSession(session);
      const user=session.user;
      const profile=currentProfile||{};
      // OTP is temporarily disabled. Registration is complete when the passenger's
      // saved name and mobile number are present in profile or auth metadata.
      const registered=!!(profile.full_name||user.user_metadata?.full_name)
        && !!(user.phone||profile.phone||user.user_metadata?.phone)
        && (profile.full_name||user.user_metadata?.full_name)!=="Passenger";
      if(!registered){
        $("#rideDialog").close();
        showPassengerRegistration(service);
        return;
      }
      $("#passengerName").value=profile.full_name||user.user_metadata?.full_name||"";
      $("#passengerPhone").value=user.phone||profile.phone||user.user_metadata?.phone||"";
      if(!$("#rideDialog").open)$("#rideDialog").showModal();
      $("#twendePickerPickup").textContent=$("#ridePickup").value||"Set pickup location on the homepage";
      $("#twendePickerDestination").textContent=$("#rideDestination").value||"Enter destination on the homepage";
      await loadAvailableTaxiFleet(service);
    }catch(error){
      console.error("TWENDE passenger setup:",error);
      toast("Passenger setup: "+(error?.message||"Please check your connection."));
    }
  })();
}
window.openTwendeRideDialog = openRideDialog;
document.querySelectorAll("[data-ride-service]").forEach(b=>b.addEventListener("click",()=>openRideDialog(b.dataset.rideService)));

let twendeTaxiSubmitInFlight=false;
let twendeTaxiRequestKey=null;
async function submitTwendeTaxiRequest(){
  const form=$("#rideForm");
  const inlineMessage=$("#rideSubmitMessage");
  const b=$("#rideRequestSubmit");
  if(!form||!b||twendeTaxiSubmitInFlight)return;
  twendeTaxiSubmitInFlight=true;
  if(!twendeTaxiRequestKey)twendeTaxiRequestKey=crypto.randomUUID();
  if(inlineMessage){inlineMessage.hidden=false;inlineMessage.textContent="Sending your taxi request… Please wait. Do not submit again.";inlineMessage.style.display="block";inlineMessage.classList.add("is-visible");}
  b.disabled=true;b.textContent="Sending request…";
  try{
    let {data:sessionData,error:sessionError}=await db.auth.getSession();
    if(sessionError)throw sessionError;
    let user=sessionData?.session?.user||currentUser;
    if(!user){
      const guest=await db.auth.signInAnonymously();
      if(guest.error)throw new Error("Passenger session could not start. Enable Anonymous Sign-ins in Supabase Auth.");
      user=guest.data?.user||guest.data?.session?.user;
      if(!user)throw new Error("Passenger session is still starting. Please close the form and try again.");
      currentUser=user;
      await onSession(guest.data.session);
    }
    const passengerName=(currentProfile?.full_name||user.user_metadata?.full_name||"").trim();
    const passengerPhone=user.phone||currentProfile?.phone||user.user_metadata?.phone||"";
    // OTP is temporarily disabled. A saved passenger name and phone are sufficient until SMS provider approval.
    if(!passengerName||!passengerPhone){
      $("#rideDialog").close();showPassengerRegistration($("#rideServiceType").value);throw new Error("Please complete passenger registration before booking.");
    }
    $("#passengerName").value=passengerName;$("#passengerPhone").value=passengerPhone;
    const pickup=$("#ridePickup").value.trim();
    const destination=$("#rideDestination").value.trim();
    const service=$("#rideServiceType").value;
    const selectedVehicleId=$("#selectedTwendeVehicleId").value;
    if(!passengerName||!passengerPhone||!pickup||!destination)throw new Error("Please set your pickup and destination on the homepage.");
    if(!selectedVehicleId)throw new Error("Choose one of the available vehicles before requesting your taxi.");
    // Calculate and save the actual route-based fare with the booking. Do not
    // create a fare-less ride request when the tariff cannot be verified.
    let fareEstimate=window.getTwendePassengerFareEstimate?.();
    if(!fareEstimate || fareEstimate.pickupLabel!==pickup || fareEstimate.destinationLabel!==destination || fareEstimate.type!==service){
      if(typeof window.calculateTwendePassengerFare!=="function")throw new Error("TWENDE fare calculator is still loading. Close and reopen the booking form.");
      fareEstimate=await window.calculateTwendePassengerFare(true);
    }
    if(!fareEstimate || !Number.isFinite(Number(fareEstimate.fare)) || !Number.isFinite(Number(fareEstimate.km))) {
      throw new Error("TWENDE could not calculate a fare for this route. Please check pickup and destination, then try again.");
    }
    const row={
      rider_id:user.id,passenger_name:passengerName,passenger_phone:passengerPhone,
      service_type:service,driver_vehicle_id:selectedVehicleId,pickup_text:pickup,destination_text:destination,
      pickup_lat:fareEstimate.pickup.lat,pickup_lng:fareEstimate.pickup.lng,
      destination_lat:fareEstimate.destination.lat,destination_lng:fareEstimate.destination.lng,
      route_distance_km:Number(fareEstimate.km.toFixed(2)),
      estimated_fare:Number(fareEstimate.fare.toFixed(2)),fare_currency:"ZMW",
      payment_method:"cash",status:"pending",request_key:twendeTaxiRequestKey
    };
    if(inlineMessage){inlineMessage.hidden=false;inlineMessage.textContent="Sending your request to the selected TWENDE driver…";inlineMessage.style.display="block";inlineMessage.classList.add("is-visible");}
    let insertResult=await withTimeout(db.from("ride_requests").insert(row).select("id").single(),"Taxi request",20000);
    if(insertResult.error?.code==="23505"){
      const existing=await withTimeout(db.from("ride_requests").select("id").eq("rider_id",user.id).eq("request_key",twendeTaxiRequestKey).maybeSingle(),"Existing taxi request",10000);
      if(existing.error||!existing.data)throw insertResult.error;
      insertResult={data:existing.data,error:null};
    }
    if(insertResult.error){
      console.error("Taxi request insert failed:",insertResult.error);
      if(insertResult.error.code==="42501")throw new Error("Booking was blocked by database permissions. Apply the TWENDE booking reliability SQL migration.");
      if(insertResult.error.code==="23503")throw new Error("Passenger session was not accepted by the database. Please refresh TWENDE and try again.");
      if(insertResult.error.code==="42703")throw new Error("Booking database update is required. Apply supabase/twende_booking_reliability_fix.sql first.");
      throw new Error("Booking failed: "+(insertResult.error.message||"database error"));
    }
    // The database has confirmed the booking. Close the picker immediately,
    // remove its transient sending state, and leave the ride request active.
    twendeTaxiRequestKey=null;
    const rideDialog=$("#rideDialog");
    if(rideDialog?.open)rideDialog.close();
    form.reset();
    clearTwendeRidePickerState();
    const fleet=$("#nearbyTaxiFleet");
    if(fleet)fleet.innerHTML='<p class="muted">Choose a taxi service to make another request.</p>';
    toast("Taxi request sent successfully. Waiting for the selected driver.");
    void loadPassengerRides().catch(error=>console.warn("Passenger history refresh:",error));
    if(typeof loadAvailableTaxiFleet==="function")void loadAvailableTaxiFleet();
    if(typeof loadDriverDashboard==="function"&&!isGuestRider())void loadDriverDashboard();
  }catch(error){
    console.error("TWENDE taxi booking:",error);
    const message=error?.message||"Taxi booking failed. Please try again.";
    if(inlineMessage){inlineMessage.hidden=false;inlineMessage.textContent="Request not sent: "+message;inlineMessage.style.display="block";inlineMessage.classList.add("is-visible");}
    toast(message);
  }finally{
    twendeTaxiSubmitInFlight=false;
    // Restore controls only when the dialog remains open (validation/network
    // error). A confirmed booking has already closed and reset the picker.
    if($("#rideDialog")?.open){
      b.disabled=!$("#selectedTwendeVehicleId")?.value;
      b.textContent=$("#selectedTwendeVehicleId")?.value?"Confirm booking":"Choose a vehicle first";
    }
  }
}
window.submitTwendeTaxiRequest=submitTwendeTaxiRequest;
$("#rideForm").addEventListener("submit",e=>{e.preventDefault();submitTwendeTaxiRequest();});

let twendeNearbyFleetTimer=null;
async function loadAvailableTaxiFleet(service=selectedRideService){
   const host=$("#nearbyTaxiFleet");
   if(!host)return;
   if(!twendeNearbyFleetTimer)twendeNearbyFleetTimer=setInterval(()=>{
     const dialog=$("#rideDialog");
     if(dialog?.open&&currentUser)loadAvailableTaxiFleet($("#rideServiceType")?.value||selectedRideService);
     else if(!dialog?.open){clearInterval(twendeNearbyFleetTimer);twendeNearbyFleetTimer=null;}
   },20000);
   host.innerHTML='<p class="muted">Finding online TWENDE taxis within 15 km…</p>';
   if(!currentUser){host.innerHTML='<p class="muted">Passenger connection is starting…</p>';return;}
   const pickup=window.twendePickupCoords;
   if(!pickup||!Number.isFinite(Number(pickup.lat))||!Number.isFinite(Number(pickup.lng))){
     host.innerHTML='<p class="muted">Use GPS or set your pickup on the map first. TWENDE searches for online taxis within 15 km of your pickup.</p>';
     return;
   }
   const {data,error}=await db.rpc("get_nearby_twende_drivers",{
     p_latitude:Number(pickup.lat),p_longitude:Number(pickup.lng),p_radius_km:15
   });
   if(error){
     console.warn("Nearby online TWENDE vehicles:",error);
     host.innerHTML='<p class="muted">Nearby taxis could not be loaded. Check the 15 km passenger-discovery SQL migration and try again.</p>';return;
   }
   const rows=(data||[]).filter(v=>v.vehicle_type===service);
   const card=v=>`<article class="fleet-vehicle-card" data-vehicle-card="${esc(v.vehicle_id)}">${v.vehicle_photo_url?`<img class="twende-fleet-photo" src="${esc(v.vehicle_photo_url)}" alt="${esc((v.vehicle_color||"")+" "+(v.vehicle_make||"")+" "+(v.vehicle_model||""))}" loading="lazy">`:twendeVehicleImage(service,service==="car"?"TWENDE car taxi":"TWENDE motorcycle taxi")}<div class="fleet-vehicle-details"><span class="fleet-brand-tag">TWENDE ${service==="car"?"CAR TAXI":"MOTORCYCLE TAXI"}</span><div class="fleet-plate">${esc(v.plate_number||"Registration pending")}</div><strong>${esc(v.vehicle_make||"Make not supplied")} ${esc(v.vehicle_model||"")}</strong><span>Colour: ${esc(v.vehicle_color||"Not recorded")}</span><span>Driver: ${esc(v.driver_name||"TWENDE driver")}</span><span><strong>${Number(v.distance_km||0).toFixed(1)} km away</strong> • Online now</span><button type="button" class="twende-select-vehicle" data-select-vehicle="${esc(v.vehicle_id)}">Choose this taxi</button></div></article>`;
   host.innerHTML=rows.map(card).join("")||`<p class="muted">No ${service==="car"?"car taxis":"motorcycle taxis"} are online within 15 km of your pickup right now. Try again shortly.</p>`;
   host.querySelectorAll("[data-select-vehicle]").forEach(button=>button.addEventListener("click",()=>{
     const id=button.dataset.selectVehicle;
     $("#selectedTwendeVehicleId").value=id;
     host.querySelectorAll(".fleet-vehicle-card").forEach(card=>card.classList.toggle("is-selected",card.dataset.vehicleCard===id));
     host.querySelectorAll("[data-select-vehicle]").forEach(b=>{b.textContent=b.dataset.selectVehicle===id?"Selected":"Choose this taxi";});
     $("#rideRequestSubmit").disabled=false;
     $("#rideRequestSubmit").textContent="Confirm booking";
   }));
 }
 async function loadPassengerRides(){
  const host=$("#passengerRides");if(!host)return;
  if(!currentUser){host.innerHTML='<p class="muted">Sign in to see your taxi requests.</p>';return;}
  const {data,error}=await db.rpc("twende_passenger_ride_history");
  if(error){console.warn("Passenger ride history:",error);host.innerHTML='<p class="muted">Taxi request history is temporarily unavailable.</p>';return;}
  const cards=(data||[]).map(x=>{
    const motorcycle=x.service_type==="motorcycle";
    const kind=motorcycle?"Motorcycle taxi":"Car taxi";
    const assigned=x.status==="accepted";
    const vehicleName=[x.vehicle_make,x.vehicle_model].filter(Boolean).join(" ");
    const vehiclePhoto=x.vehicle_photo_url
      ? '<img class="twende-ride-assigned-photo" src="'+esc(x.vehicle_photo_url)+'" alt="'+esc([x.vehicle_color,vehicleName].filter(Boolean).join(" "))+'" loading="lazy">'
      : twendeVehicleImage(x.service_type,motorcycle?"TWENDE motorcycle taxi":"TWENDE car taxi");
    const statusLabel=assigned?"Driver accepted":x.status==="pending"?"Finding a driver":String(x.status||"").replace(/_/g," ");
    const vehicleInfo=assigned
      ? '<div class="twende-assigned-vehicle"><strong>'+esc(vehicleName||kind)+'</strong><span>Colour: '+esc(x.vehicle_color||"Not recorded")+'</span><span>Registration: <strong class="fleet-plate">'+esc(x.plate_number||"Not recorded")+'</strong></span><span>Driver: '+esc(x.driver_name||"Not recorded")+'</span>'+(x.driver_phone?'<a class="btn btn-red twende-call-driver" href="tel:'+esc(String(x.driver_phone).replace(/[^\\d+]/g,""))+'">Call driver</a>':'')+'</div>'
      : '<p class="muted">'+(x.status==="pending"?"Vehicle and driver details will appear here after a driver accepts.":"Vehicle details are unavailable for this booking.")+'</p>';
    return '<article class="dash-card twende-ride-history-card">'+vehiclePhoto+'<div><h3>'+kind+'</h3><p>'+esc(x.pickup_text||"")+' → '+esc(x.destination_text||"")+'</p><p>'+(x.route_distance_km?Number(x.route_distance_km).toFixed(1)+" km • ":"")+(x.estimated_fare?money(x.estimated_fare)+" estimated • ":"")+'Payment: Cash • Status: <strong>'+esc(statusLabel)+'</strong></p>'+vehicleInfo+'</div></article>';
  }).join("");
  host.innerHTML='<h3>Your taxi requests</h3>'+(cards||'<p class="muted">You have not requested a taxi yet.</p>');
}
function syncDriverTaxiFields(){
  const hasVehicle=$("#driverHasVehicle")?.checked===true;
  const section=$("#driverVehicleDetails");
  if(!section)return;
  section.hidden=!hasVehicle;
  ["driverVehicleType","driverVehicleMake","driverVehicleModel","driverPlate","driverArea"].forEach(id=>{const field=$("#"+id);if(field)field.disabled=!hasVehicle;});
  const type=$("#driverVehicleType")?.value||"",motorcycle=type==="motorcycle";
  if($("#driverVehicleDetailsTitle"))$("#driverVehicleDetailsTitle").textContent=type?(motorcycle?"Motorcycle details":"Car details"):"Optional vehicle registration";
  if($("#driverVehicleDetailsIntro"))$("#driverVehicleDetailsIntro").textContent="You may register a vehicle now, or skip this and be assigned to an approved vehicle by an owner later.";
  if($("#driverMakeLabel"))$("#driverMakeLabel").firstChild.textContent=motorcycle?"Motorcycle make":"Vehicle make";
  if($("#driverModelLabel"))$("#driverModelLabel").firstChild.textContent=motorcycle?"Motorcycle model":"Vehicle model";
  if($("#driverPlateLabel"))$("#driverPlateLabel").firstChild.textContent=motorcycle?"Motorcycle registration number":"Vehicle registration number";
  if($("#driverVehicleMake"))$("#driverVehicleMake").placeholder=motorcycle?"e.g. Honda, Boxer, Yamaha":"e.g. Toyota, Nissan, Honda";
  if($("#driverVehicleModel"))$("#driverVehicleModel").placeholder=motorcycle?"e.g. CG 125, BM150":"e.g. Corolla, Note, GTR 1400";
}
$("#driverHasVehicle")?.addEventListener("change",syncDriverTaxiFields);
$("#driverVehicleType")?.addEventListener("change",syncDriverTaxiFields);
$("#driverForm")?.addEventListener("reset",()=>setTimeout(syncDriverTaxiFields,0));

$("#driverForm").onsubmit=async e=>{
  e.preventDefault();if(!currentUser)return;
  const b=e.submitter;b.disabled=true;
  const hasVehicle=$("#driverHasVehicle").checked,taxiType=$("#driverVehicleType").value;
  if(hasVehicle&&!["car","motorcycle"].includes(taxiType)){b.disabled=false;toast("Choose car taxi or motorcycle taxi, or untick the vehicle registration option.");return;}
  const {error:applicationError}=await db.rpc("twende_submit_partner_application",{p_partner_type:"driver",p_vehicle_types:[]});
  if(applicationError){b.disabled=false;toast("Driver application could not be submitted: "+applicationError.message);return;}
  if(hasVehicle){
    const row={user_id:currentUser.id,driver_name:$("#driverName").value.trim(),phone:$("#driverPhone").value.trim(),vehicle_type:taxiType,vehicle_make:$("#driverVehicleMake").value.trim(),vehicle_model:$("#driverVehicleModel").value.trim(),plate_number:$("#driverPlate").value.trim(),licence_number:$("#driverPlate").value.trim(),operating_area:$("#driverArea").value.trim(),approval_status:"pending",is_online:false};
    const {error}=await db.from("driver_vehicles").insert(row);
    if(error){b.disabled=false;toast("Driver application submitted, but vehicle registration failed: "+error.message);await loadDriverDashboard();return;}
  }
  b.disabled=false;closeDialog("driverDialog");e.target.reset();syncDriverTaxiFields();
  toast(hasVehicle?"Driver application and vehicle submitted for review.":"Driver application submitted. You can be assigned to an owner's approved vehicle after approval.");
  await loadDriverDashboard();
};
function twendeRequestAge(timestamp){
  if(!timestamp)return "Request time unavailable";
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(timestamp).getTime())/60000));
  if(minutes<1)return "Just now";
  if(minutes===1)return "1 minute ago";
  if(minutes<60)return minutes+" minutes ago";
  const hours=Math.floor(minutes/60),remaining=minutes%60;
  return hours+"h"+(remaining?" "+remaining+"m":"")+" ago";
}
function twendeRequestExpiry(timestamp){
  if(!timestamp)return "Expiry time unavailable";
  const seconds=Math.max(0,Math.floor((new Date(timestamp).getTime()-Date.now())/1000));
  if(seconds<=0)return "Expiring";
  const minutes=Math.floor(seconds/60),remaining=seconds%60;
  return "Expires in "+(minutes?minutes+"m ":"")+remaining+"s";
}
function refreshTwendeRequestAges(){
  document.querySelectorAll("[data-request-created]").forEach(node=>{node.textContent=twendeRequestAge(node.dataset.requestCreated);});
  document.querySelectorAll("[data-request-expires]").forEach(node=>{node.textContent=twendeRequestExpiry(node.dataset.requestExpires);});
}
if(!window.twendeRequestAgeTimer)window.twendeRequestAgeTimer=setInterval(refreshTwendeRequestAges,1000);
async function loadDriverDashboard(){
  const host=$("#driverDashboard");if(!host)return;
  if(!currentUser){host.innerHTML='<p class="muted">Sign in to register or manage your vehicles.</p>';return;}
  const {data:vehicles,error}=await db.from("driver_vehicles").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false});
  if(error){host.innerHTML='<p class="muted">Multi-vehicle services need the Phase 2 database setup: '+esc(error.message)+'</p>';return;}
  if(activePortal==="driver" && (vehicles||[]).some(v=>v.approval_status==="approved"&&v.is_online)) {
    window.twendeSyncNativeDriverLocation?.(true);
  }

  // Expire stale requests before showing the active queue.
  const {data:expiredCount,error:expiryError}=await db.rpc("expire_stale_twende_rides");
  const expiryWarning=expiryError
    ? '<p class="muted">Booking expiry is not yet configured. Apply supabase/twende_ride_expiry.sql in Supabase SQL Editor to enable the 15-minute expiry and clear old pending requests.</p>'
    : (Number(expiredCount||0)>0?'<p class="muted">'+Number(expiredCount)+' old booking(s) expired and removed from the active queue.</p>':'');
  if(!window.twendeRideExpiryTimer){
    window.twendeRideExpiryTimer=setInterval(async()=>{
      const {data:count,error}=await db.rpc("expire_stale_twende_rides");
      if(!error&&Number(count||0)>0&&window.twendeRoleSnapshot?.activePortal==="driver")await loadDriverDashboard();
    },30000);
  }
  const approved=(vehicles||[]).filter(v=>v.approval_status==="approved");
  const {data:rides,error:rideError}=await db.rpc("twende_driver_ride_queue");
  const ownRides=(rides||[]).filter(x=>x.driver_id===currentUser.id);
  const completed=ownRides.filter(x=>x.status==="completed");
  const carValue=completed.filter(x=>x.service_type==="car").reduce((sum,x)=>sum+Number(x.estimated_fare||0),0);
  const motoValue=completed.filter(x=>x.service_type==="motorcycle").reduce((sum,x)=>sum+Number(x.estimated_fare||0),0);
  const metrics='<div class="owner-metrics"><article class="metric-card"><span>Completed car taxi value</span><strong>'+money(carValue)+'</strong><small>'+completed.filter(x=>x.service_type==="car").length+' completed trips</small></article><article class="metric-card"><span>Completed motorcycle taxi value</span><strong>'+money(motoValue)+'</strong><small>'+completed.filter(x=>x.service_type==="motorcycle").length+' completed trips</small></article><article class="metric-card"><span>Total completed trip value</span><strong>'+money(carValue+motoValue)+'</strong><small>Based on saved estimated fares; not verified cash receipts</small></article></div>';
  const vehicleCards=(vehicles||[]).map(v=>'<article class="dash-card twende-owner-vehicle-card">'+(v.vehicle_photo_url?'<img class="twende-fleet-photo" src="'+esc(v.vehicle_photo_url)+'" alt="'+esc((v.vehicle_color||"")+" "+v.vehicle_make+" "+v.vehicle_model)+'" loading="lazy">':twendeVehicleImage(v.vehicle_type,v.vehicle_type==="car"?"TWENDE branded owner car taxi":"TWENDE branded owner motorcycle taxi"))+'<div><span class="fleet-brand-tag">TWENDE '+(v.vehicle_type==="car"?"CAR TAXI":"MOTORCYCLE TAXI")+'</span><h3>'+esc(v.vehicle_make)+' '+esc(v.vehicle_model)+' • '+esc(v.vehicle_type)+'</h3><p>Registration: '+esc(v.plate_number)+' • Colour: '+esc(v.vehicle_color||"Not recorded")+' • Area: '+esc(v.operating_area)+'</p><p>Verification: <strong>'+esc(v.approval_status)+'</strong></p><p>Availability: <strong>'+(v.is_online?"Online":"Offline")+'</strong></p>'+(v.approval_status==="approved"?'<button class="btn btn-red" data-vehicle-online="'+v.id+'" data-online="'+(!v.is_online)+'">'+(v.is_online?"Go offline":"Go online")+'</button>':'<p class="muted">An administrator must approve this vehicle before it can receive requests.</p>')+'</div></article>').join("");
  const rideCards=rideError?'<p class="muted">Could not load taxi requests: '+esc(rideError.message)+'</p>':(rides||[]).map(x=>{
    const passengerCall=x.passenger_phone?'<a class="btn btn-red twende-call-passenger" href="tel:'+esc(String(x.passenger_phone).replace(/[^\d+]/g,""))+'">Call passenger</a>':"";
    const canAccept=x.status==="pending"&&approved.some(v=>v.is_online&&v.id===x.driver_vehicle_id);
    const canComplete=x.driver_id===currentUser.id&&x.status==="accepted";
    const action=canAccept?'<button class="btn btn-red" data-ride-action="accept" data-ride-id="'+x.id+'">Accept ride</button><button class="btn btn-secondary" data-ride-action="reject" data-ride-id="'+x.id+'">Reject</button>':canComplete?'<button class="btn btn-red" data-ride-action="complete" data-ride-id="'+x.id+'">Complete trip</button>':"";
    return '<article class="dash-card"><h3>'+(x.service_type==="car"?"🚕 Car taxi":"🏍️ Motorcycle taxi")+' request</h3><p><strong>Requested:</strong> '+esc(x.created_at?new Date(x.created_at).toLocaleTimeString("en-ZM",{hour:"2-digit",minute:"2-digit"}):"Time unavailable")+' • <strong>Waiting:</strong> <span data-request-created="'+esc(x.created_at||"")+'">'+twendeRequestAge(x.created_at)+'</span>'+(x.status==="pending"&&x.expires_at?' • <strong><span data-request-expires="'+esc(x.expires_at)+'">'+twendeRequestExpiry(x.expires_at)+'</span></strong>':"")+'</p><p>'+esc(x.pickup_text)+' → '+esc(x.destination_text)+'</p><p>Passenger: '+esc(x.passenger_name)+' • '+esc(x.passenger_phone)+'</p><p>'+(x.route_distance_km?Number(x.route_distance_km).toFixed(1)+" km • ":"")+(x.estimated_fare?money(x.estimated_fare)+" estimated • ":"")+'Payment: Cash • Status: <strong>'+esc(x.status)+'</strong></p><div class="twende-request-actions">'+passengerCall+action+'</div></article>';
  }).join("")||'<p class="muted">No matching taxi requests at the moment.</p>';
  host.innerHTML=expiryWarning+metrics+'<h3>Your assigned vehicle ('+(vehicles||[]).length+')</h3>'+(vehicleCards||'<p class="muted">No vehicle has been assigned to you yet. An approved vehicle owner can assign you a vehicle after your operator application is approved.</p>')+'<h3 id="driverTaxiRequests">Taxi requests and trip management</h3>'+rideCards;
}
$("#driverDashboard").onclick=async e=>{
  const vehicleToggle=e.target.closest("[data-vehicle-online]");
  if(vehicleToggle){
    const desired=vehicleToggle.dataset.online==="true";
    vehicleToggle.disabled=true;
    const {error}=await db.rpc("twende_set_vehicle_online",{p_vehicle_id:vehicleToggle.dataset.vehicleOnline,p_online:desired});
    if(error){vehicleToggle.disabled=false;toast("Could not change vehicle availability: "+error.message);return;}
    await window.twendeSyncNativeDriverLocation?.(desired);
    if(desired){const {error:dispatchError}=await db.rpc("twende_dispatch_waiting_rides");if(dispatchError)console.warn("TWENDE waiting request dispatch:",dispatchError.message);}
    toast(desired?"Vehicle is now online. GPS will continue in the background while TWENDE remains online.":"Vehicle is now offline.");
    window.dispatchEvent(new CustomEvent("twende-vehicle-online",{detail:{online:desired}}));
    await loadDriverDashboard();
    return;
  }
  const online=e.target.closest("#driverOnlineBtn");
  if(online){const {error}=await db.rpc("set_twende_driver_online",{p_online:online.dataset.online==="true"});if(error){toast("Could not change availability. Check driver approval and database setup.");return;}toast("Driver availability updated.");await loadDriverDashboard();return;}
  const action=e.target.closest("[data-ride-action]");if(!action)return;
  const choice=action.dataset.rideAction;
  const rpc=choice==="accept"?"accept_twende_ride":choice==="reject"?"reject_twende_ride":"complete_twende_ride";
  action.disabled=true;
  const {data,error}=await db.rpc(rpc,{p_ride_id:action.dataset.rideId});
  if(error){action.disabled=false;toast("Ride update failed: "+error.message);return;}
  if(choice==="reject") toast(data?.assigned_vehicle_id?"Request passed to the next eligible nearby driver.":"Request queued for the next eligible nearby driver.");
  else toast(choice==="accept"?"Ride accepted. Contact the passenger to confirm pickup.":"Trip marked completed.");
  await loadDriverDashboard();await loadPassengerRides();
};


async function loadAdminDashboard(){
  const panel=$("#adminPanel"),nav=$("#adminNav"),host=$("#adminContent");
  if(!panel||!host)return;
  panel.classList.add("hidden");if(nav)nav.classList.add("hidden");
  if(!currentUser){host.innerHTML='<p class="muted">Sign in with an authorised administrator account.</p>';return;}
  host.innerHTML='<p class="muted">Verifying administrator permissions…</p>';
  const {data:isAdmin,error:adminError}=await db.rpc("twende_is_admin");
  verifiedAdmin=!adminError && isAdmin===true;
  updateUI();
  if(!verifiedAdmin){host.innerHTML='<p class="muted">This account does not have administrator access.</p>';return;}
  // Admin data may be checked in the background, but its dashboard is rendered
  // only while the user has explicitly selected the Administrator portal.
  if(activePortal!=="admin"){panel.classList.add("hidden");if(nav)nav.classList.add("hidden");return;}
  panel.classList.remove("hidden");if(nav)nav.classList.remove("hidden");
  const [fleetPermission,financePermission,assignPermission]=await Promise.all([
    db.rpc("twende_admin_has_permission",{p_permission:"fleet.review"}),
    db.rpc("twende_admin_has_permission",{p_permission:"finance.view"}),
    db.rpc("twende_admin_has_permission",{p_permission:"fleet.assign"})
  ]);
  const canReviewFleet=!fleetPermission.error&&fleetPermission.data===true;
  const canViewFinance=!financePermission.error&&financePermission.data===true;
  const canAssignFleet=!assignPermission.error&&assignPermission.data===true;
  const sections=[];
  // Only the Primary Administrator can appoint, change or remove officers.
  if(currentAdminRole==="primary"){
    const {data:admins,error:adminsError}=await db.rpc("twende_list_admins");
    const roleLabels={primary:"Primary Administrator",operations:"Operations Administrator",fleet_manager:"Fleet Manager",driver_support:"Driver Support Administrator",finance:"Finance Administrator",customer_support:"Customer Support Administrator",compliance:"Compliance Administrator",dispatcher:"Dispatcher"};
    const roleOptions=Object.entries(roleLabels).filter(([key])=>key!=="primary").map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join("");
    const adminRows=adminsError?'<p class="muted">Officer list unavailable: '+esc(adminsError.message)+'</p>':(admins||[]).map(a=>'<article class="dash-card"><h4>'+esc(roleLabels[a.admin_role]||a.admin_role)+'</h4><p>'+esc(a.email)+'</p><p class="muted">Appointed: '+esc(a.created_at?new Date(a.created_at).toLocaleDateString("en-ZM"):"Date unavailable")+'</p>'+(a.admin_role==="primary"?'<span class="fleet-brand-tag">Master account</span>':'<div class="admin-officer-actions"><label>Change role<select data-officer-role="'+esc(a.user_id)+'">'+Object.entries(roleLabels).filter(([key])=>key!=="primary").map(([key,label])=>'<option value="'+key+'" '+(a.admin_role===key?'selected':'')+'>'+label+'</option>').join("")+'</select></label><button class="btn btn-outline" data-officer-update="'+esc(a.user_id)+'" data-officer-email="'+esc(a.email)+'">Save role</button> <button class="btn btn-red" data-officer-remove="'+esc(a.user_id)+'" data-officer-email="'+esc(a.email)+'">Remove access</button></div>')+'</article>').join("")||'<p class="muted">No specialist officers have been appointed.</p>';
    sections.push('<section class="twende-officer-management"><h3>Officer Management</h3><p class="muted">Primary Administrator control: appoint officers, assign or change their roles, and remove administrative access. Officers must first register a TWENDE account using their own email address.</p><form id="twendeOfficerAppointment" class="dash-card"><label>Registered TWENDE email address<input name="officer_email" type="email" required placeholder="officer@example.com"></label><label>Administrator role<select name="officer_role" required><option value="">Select officer role</option>'+roleOptions+'</select></label><button class="btn btn-red" type="submit">Appoint officer / assign role</button></form><h4>Current administrators ('+(admins||[]).length+')</h4>'+adminRows+'</section>');
  }
  if(canViewFinance){
    const {data:completedRides,error}=await db.from("ride_requests").select("service_type,estimated_fare,status").eq("status","completed");
    if(error)sections.push('<h3>Financial overview</h3><p class="muted">Financial summary unavailable: '+esc(error.message)+'</p>');
    else{
      const completed=completedRides||[];
      const carValue=completed.filter(x=>x.service_type==="car").reduce((sum,x)=>sum+Number(x.estimated_fare||0),0);
      const motoValue=completed.filter(x=>x.service_type==="motorcycle").reduce((sum,x)=>sum+Number(x.estimated_fare||0),0);
      sections.push('<h3>Financial overview — completed taxi trips</h3><div class="owner-metrics"><article class="metric-card"><span>Car taxi trip value</span><strong>'+money(carValue)+'</strong><small>'+completed.filter(x=>x.service_type==="car").length+' completed trips</small></article><article class="metric-card"><span>Motorcycle taxi trip value</span><strong>'+money(motoValue)+'</strong><small>'+completed.filter(x=>x.service_type==="motorcycle").length+' completed trips</small></article><article class="metric-card"><span>Total completed trip value</span><strong>'+money(carValue+motoValue)+'</strong><small>Estimated fares recorded, not verified cash receipts or company commission</small></article></div>');
    }
  }
  if(canReviewFleet){
    const {data:vehicles,error}=await db.from("driver_vehicles").select("id,user_id,driver_name,phone,vehicle_type,vehicle_make,vehicle_model,plate_number,operating_area,approval_status,created_at").order("created_at",{ascending:false});
    if(error)sections.push('<h3>Driver and vehicle applications</h3><p class="muted">Vehicle applications unavailable: '+esc(error.message)+'</p>');
    else{
      const rows=vehicles||[];
      const vehicleHtml=rows.map(v=>'<article class="dash-card"><h3>'+esc(v.driver_name)+' • '+esc(v.vehicle_type)+'</h3><p>Phone: '+esc(v.phone)+' • Area: '+esc(v.operating_area)+'</p><p>Vehicle: '+esc(v.vehicle_make)+' '+esc(v.vehicle_model)+' • Registration: '+esc(v.plate_number)+'</p><p>Status: <strong>'+esc(v.approval_status)+'</strong></p>'+(v.approval_status==="pending"?'<button class="btn btn-red" data-vehicle-decision="approved" data-vehicle-id="'+v.id+'">Approve</button> <button class="btn btn-outline" data-vehicle-decision="rejected" data-vehicle-id="'+v.id+'">Reject</button>':"")+'</article>').join("")||'<p class="muted">No vehicle applications have been submitted.</p>';
      sections.push('<h3>Driver and vehicle applications ('+rows.length+')</h3>'+vehicleHtml);
    }
  }
  // Driver-to-vehicle assignment belongs exclusively to the vehicle owner.
  // Administrators review applications; they do not assign drivers to owners' vehicles.
  if(!sections.length)sections.push('<p class="muted">Your administrator account is active, but no operational modules are assigned to this role yet. Contact the Primary Administrator if you need additional access.</p>');
  host.innerHTML=sections.join("")+'<p class="muted">Only modules authorised for your administrator role are shown here.</p>';
}
$("#refreshAdmin")?.addEventListener("click",loadAdminDashboard);
$("#adminContent")?.addEventListener("click",async e=>{
  const removeOfficer=e.target.closest("[data-officer-remove]");
  if(removeOfficer){
    if(currentAdminRole!=="primary"){toast("Only the Primary Administrator can remove officers.");return;}
    if(!window.confirm("Remove administrator access from "+removeOfficer.dataset.officerEmail+"? Their TWENDE account will remain active."))return;
    removeOfficer.disabled=true;
    const {error}=await db.rpc("twende_remove_operations_admin",{p_user_id:removeOfficer.dataset.officerRemove});
    if(error){removeOfficer.disabled=false;toast("Could not remove officer: "+error.message);return;}
    toast("Administrator access removed. The user's TWENDE account remains active.");
    await loadAdminDashboard();return;
  }
  const updateOfficer=e.target.closest("[data-officer-update]");
  if(updateOfficer){
    if(currentAdminRole!=="primary"){toast("Only the Primary Administrator can change officer roles.");return;}
    const select=$("#adminContent [data-officer-role='"+CSS.escape(updateOfficer.dataset.officerUpdate)+"']");
    const nextRole=select?.value;
    if(!nextRole)return;
    if(!window.confirm("Assign "+nextRole.replace(/_/g," ")+" to "+updateOfficer.dataset.officerEmail+"?"))return;
    updateOfficer.disabled=true;
    const {error}=await db.rpc("twende_add_admin_by_role",{p_email:updateOfficer.dataset.officerEmail,p_role:nextRole});
    if(error){updateOfficer.disabled=false;toast("Role change failed: "+error.message);return;}
    toast("Officer role updated.");await loadAdminDashboard();return;
  }
  const vehicleButton=e.target.closest("[data-vehicle-decision]");
  if(vehicleButton){const decision=vehicleButton.dataset.vehicleDecision;if(!window.confirm((decision==="approved"?"Approve":"Reject")+" this vehicle?"))return;vehicleButton.disabled=true;const {error}=await db.rpc("twende_admin_review_vehicle",{p_vehicle_id:vehicleButton.dataset.vehicleId,p_decision:decision});if(error){vehicleButton.disabled=false;toast("Vehicle review failed: "+error.message);return;}toast("Vehicle "+decision+".");await loadAdminDashboard();return;}
  const b=e.target.closest("[data-admin-decision]");if(!b)return;
  const decision=b.dataset.adminDecision;
  if(!window.confirm((decision==="approved"?"Approve":"Reject")+" this driver application?"))return;
  b.disabled=true;
  const {error}=await db.rpc("twende_admin_review_driver",{p_driver_id:b.dataset.driverId,p_decision:decision});
  if(error){b.disabled=false;toast("Driver review failed: "+error.message);return;}
  toast("Driver application "+decision+".");await loadAdminDashboard();
});

async function startApp(){
  // Register the auth listener BEFORE reading the current session. Supabase may
  // emit PASSWORD_RECOVERY while it processes the recovery URL during startup.
  let recoveryMode = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type")==="recovery"
    || new URLSearchParams(window.location.search).get("type")==="recovery";
  const showPasswordUpdateForm=()=>{
    $("#loginForm").classList.add("hidden");
    $("#registerForm").classList.add("hidden");
    $("#passwordRecoveryForm").classList.add("hidden");
    $("#passwordUpdateForm").classList.remove("hidden");
    if(!$("#authDialog").open)$("#authDialog").showModal();
  };
  db.auth.onAuthStateChange((event,nextSession)=>{
    if(event==="PASSWORD_RECOVERY"){
      recoveryMode=true;
      showPasswordUpdateForm();
      return;
    }
    if(recoveryMode){
      // Never let the normal dashboard replace the password form during recovery.
      showPasswordUpdateForm();
      return;
    }
    setTimeout(()=>onSession(nextSession),0);
  });

  const {data,error}=await db.auth.getSession();if(error)console.error(error);
  let session=data?.session||null;
  // A recovery URL must open the password form, not the dashboard or guest flow.
  if(recoveryMode){
    showPasswordUpdateForm();
    return;
  }
  const entryPortal = new URLSearchParams(window.location.search).get("portal");
  const restrictedPortalEntry = entryPortal==="driver" || entryPortal==="admin" || entryPortal==="partner";
  if(TWENDE_PARTNER_APP) document.body.classList.add("partner-entry-mode");
  if(!session && !restrictedPortalEntry){
    const guest=await db.auth.signInAnonymously();
    if(guest.error){console.error("Passenger guest session:",guest.error);toast("Enable anonymous sign-ins in Supabase Auth settings to allow passengers to book without accounts.");}
    else session=guest.data.session;
  }
  await onSession(session);
  if(restrictedPortalEntry){
    // Dedicated partner/admin entry points never enter the passenger guest-registration flow.
    window.twendeRequestedPortal=entryPortal;
    $("#registerForm").classList.add("hidden");
    $("#passengerPhoneForm").classList.add("hidden");
    $("#passengerOtpForm").classList.add("hidden");
    $("#passengerNameForm").classList.add("hidden");
    $("#loginForm").classList.remove("hidden");
    $("#partnerEntryWelcome")?.classList.remove("hidden");
    $("#loginForm").querySelector("h2").textContent=entryPortal==="admin"?"Administrator sign in":"Driver / vehicle owner sign in";
    // Partner entry opens its dedicated welcome screen first; sign-in is user-initiated.
    if(entryPortal!=="partner") $("#authDialog").showModal();
  }else{
    // Require passenger name and mobile number only on the passenger entry point.
    const passenger=session?.user;
    const passengerProfile=currentProfile||{};
    const passengerRegistered=!!(passengerProfile.full_name||passenger?.user_metadata?.full_name)
      && (passengerProfile.full_name||passenger?.user_metadata?.full_name)!=="Passenger"
      && !!(passenger?.phone||passengerProfile.phone||passenger?.user_metadata?.phone)
      && !["driver","owner","admin"].includes(passengerProfile.role);
    if(passenger && !passengerRegistered) showPassengerRegistration(null);
  }
  // Nearby vehicles are fetched when a taxi class is selected, not during startup.
  // This keeps the first screen responsive on slower mobile connections.
  startTwendeRealtime();
}
updateUI();startApp();




/* TWENDE booking notifications: left hamburger = account/role menu; right bell = booking activity. */
function notificationPanelOpen(){return !$("#twendeNotificationsPanel")?.classList.contains("hidden");}
function closeTwendeNotifications(){
 const panel=$("#twendeNotificationsPanel");if(!panel)return;
 panel.classList.add("hidden");$("#twendeNotificationsButton")?.setAttribute("aria-expanded","false");
}
function notificationSummary(row){
 const status=String(row.status||"pending").replace(/_/g," ");
 const service=row.service_type==="car"?"Car taxi":"Motorcycle taxi";
 const heading=status==="pending"?"New booking request":status==="accepted"?"Booking accepted":status==="rejected"?"Booking declined":status==="cancelled"?"Booking cancelled":"Booking update";
 return {heading,detail:service+" • "+(row.pickup_text||"Pickup pending")+" → "+(row.destination_text||"Destination pending"),status,created:row.created_at};
}
async function loadTwendeNotifications(){
 const host=$("#twendeNotificationsList"),badge=$("#twendeNotificationBadge");
 if(!host)return;
 if(!currentUser){host.innerHTML='<p class="muted">Open a passenger or partner session to view booking updates.</p>';if(badge)badge.classList.add("hidden");return;}
 host.innerHTML='<p class="muted">Checking your latest booking updates…</p>';
 const fields="id,service_type,pickup_text,destination_text,status,created_at,rider_id,driver_id,driver_vehicle_id";
 let data=null,error=null;
 if(isGuestRider()||role==="rider"){
  const result=await db.from("ride_requests").select(fields).eq("rider_id",currentUser.id).order("created_at",{ascending:false}).limit(30);
  data=result.data;error=result.error;
 }else if(role==="driver"){
  // Use the same secured queue as the driver dashboard so a request assigned
  // to this driver's selected vehicle appears in the bell even before acceptance.
  const result=await db.rpc("twende_driver_ride_queue");
  data=result.data||null;error=result.error;
  if(!error)data=(data||[]).slice(0,30);
 }else if(role==="owner"){
  const vehicles=await db.from("driver_vehicles").select("id").eq("owner_id",currentUser.id);
  if(vehicles.error){error=vehicles.error;}
  else{
   const ids=(vehicles.data||[]).map(v=>v.id);
   if(ids.length){
    const result=await db.from("ride_requests").select(fields).in("driver_vehicle_id",ids).order("created_at",{ascending:false}).limit(30);
    data=result.data;error=result.error;
   }else data=[];
  }
 }else{
  // Verified administrators can see system-wide booking activity subject to RLS.
  const result=await db.from("ride_requests").select(fields).order("created_at",{ascending:false}).limit(30);
  data=result.data;error=result.error;
 }
 if(error){console.warn("TWENDE notifications:",error);host.innerHTML='<p class="muted">Booking notifications could not be loaded. Check your connection or access permissions, then refresh.</p>';if(badge)badge.classList.add("hidden");return;}
 const rows=data||[];
 const pending=rows.filter(x=>x.status==="pending").length;
 if(badge){badge.textContent=pending>99?"99+":String(pending);badge.classList.toggle("hidden",pending===0);}
 host.innerHTML=rows.map(row=>{
  const n=notificationSummary(row),time=n.created?new Date(n.created).toLocaleString(): "Recent";
  return '<article class="twende-notification-item"><div class="twende-notification-dot '+(n.status==="pending"?"is-new":"")+'"></div><div><strong>'+esc(n.heading)+'</strong><p>'+esc(n.detail)+'</p><small>'+esc(n.status)+' • '+esc(time)+'</small></div></article>';
 }).join("")||'<p class="muted">No booking notifications yet. New ride requests and status updates will appear here.</p>';
}
function openTwendeNotifications(){
 const panel=$("#twendeNotificationsPanel");if(!panel)return;
 panel.classList.remove("hidden");$("#twendeNotificationsButton")?.setAttribute("aria-expanded","true");
 loadTwendeNotifications();
}
$("#twendeNotificationsButton")?.addEventListener("click",()=>{
 if(notificationPanelOpen())closeTwendeNotifications();else openTwendeNotifications();
});
$("#twendeNotificationsClose")?.addEventListener("click",closeTwendeNotifications);
$("#twendeNotificationsRefresh")?.addEventListener("click",loadTwendeNotifications);
document.addEventListener("click",e=>{
 if(!e.target.closest("#twendeNotificationsPanel")&&!e.target.closest("#twendeNotificationsButton"))closeTwendeNotifications();
});

// Driver-only immediate alert for a new request assigned to this driver's online vehicle.
const twendeDriverAlertedRideIds=new Set();
let twendeDriverAudioContext=null;
function unlockTwendeDriverAlertAudio(){
  if(twendeDriverAudioContext)return;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return;
  try{twendeDriverAudioContext=new AudioContextClass();void twendeDriverAudioContext.resume();}catch(error){console.warn("TWENDE driver alert audio unavailable:",error);}
}
document.addEventListener("pointerdown",unlockTwendeDriverAlertAudio,{capture:true});
function playTwendeDriverAlert(){
  try{
    if(twendeDriverAudioContext?.state==="suspended")void twendeDriverAudioContext.resume();
    if(twendeDriverAudioContext){
      const now=twendeDriverAudioContext.currentTime;
      [0,0.28,0.56].forEach(offset=>{
        const oscillator=twendeDriverAudioContext.createOscillator();
        const gain=twendeDriverAudioContext.createGain();
        oscillator.type="sine";oscillator.frequency.value=880;
        gain.gain.setValueAtTime(0.0001,now+offset);
        gain.gain.exponentialRampToValueAtTime(0.24,now+offset+0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.18);
        oscillator.connect(gain);gain.connect(twendeDriverAudioContext.destination);
        oscillator.start(now+offset);oscillator.stop(now+offset+0.2);
      });
    }
  }catch(error){console.warn("TWENDE driver alert sound failed:",error);}
  try{if(navigator.vibrate)navigator.vibrate([350,150,350,150,500]);}catch(_){}
}
async function alertTwendeDriverForNewRequest(ride){
  if(!currentUser||activePortal!=="driver"||!ride?.id||twendeDriverAlertedRideIds.has(ride.id))return;
  const {data:vehicle,error}=await db.from("driver_vehicles").select("id")
    .eq("id",ride.driver_vehicle_id).eq("user_id",currentUser.id)
    .eq("approval_status","approved").eq("is_online",true).maybeSingle();
  if(error||!vehicle)return;
  twendeDriverAlertedRideIds.add(ride.id);
  playTwendeDriverAlert();
  toast("NEW TWENDE BOOKING! "+(ride.service_type==="car"?"Car taxi":"Motorcycle taxi")+" request. Check your driver dashboard.");
}
// Live updates keep taxi requests and vehicle availability current without manual refresh.
// Online state is stored on each approved vehicle and is not reset on app restart.
let twendeRealtimeChannel=null;
function startTwendeRealtime(){
  if(twendeRealtimeChannel) return;
  twendeRealtimeChannel=db.channel("twende-live-operations")
    .on("postgres_changes",{event:"*",schema:"public",table:"ride_requests"},(payload)=>{
      if(currentUser && activePortal==="driver" && payload?.new?.status==="pending" && payload?.new?.driver_vehicle_id){
        void alertTwendeDriverForNewRequest(payload.new);
      }
      if(isGuestRider()){loadPassengerRides();loadAvailableTaxiFleet();}
      else if(currentUser){loadPassengerRides();loadDriverDashboard();loadAdminDashboard();}
      if(currentUser && typeof loadTwendeNotifications==="function") loadTwendeNotifications();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"driver_vehicles"},()=>{
      if(isGuestRider())loadAvailableTaxiFleet();
      else if(currentUser){loadDriverDashboard();loadAdminDashboard();}
    })
    .subscribe(status=>{if(status==="CHANNEL_ERROR")console.warn("TWENDE live updates could not connect; polling fallback remains active.");});
   // Android can suspend realtime delivery in the background. Poll the exact
   // authenticated driver's queue while the Partner Portal is visible.
   if(!window.twendeDriverQueuePoll)window.twendeDriverQueuePoll=setInterval(()=>{
     if(currentUser && activePortal==="driver" && !document.hidden)loadDriverDashboard();
   },5000);
}
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden && currentUser && activePortal==="driver")loadDriverDashboard();
});

// Public extension hooks for TWENDE GPS/fare module (publishable Supabase client only).
window.twendeDb = db;
Object.defineProperty(window, "currentTwendeUser", { configurable:true, get:()=>currentUser });
window.loadTwendePassengerRides = loadPassengerRides;
