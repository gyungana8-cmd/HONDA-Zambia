/* TWENDE browser client. Publishable keys are public by design.
   NEVER put a Supabase secret or service_role key in browser code. */
const SUPABASE_URL = "https://obgteeruczqlebllrafr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PeUZGgiMW02w0jstoKhICA_cXw83_Ic";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null, currentProfile = null, role = "rider";
let verifiedPassengerPhone = null;
let selectedBike = null, liveBikes = [], liveBookings = [];
const $ = s => document.querySelector(s);
const money = n => "K" + Number(n || 0).toLocaleString("en-ZM", {maximumFractionDigits: 2});
const addDaysISO = (date,days) => { const d=new Date(date+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+Number(days||1)); return d.toISOString().slice(0,10); };
const datesOverlap = (aStart,aDays,bStart,bDays) => aStart < addDaysISO(bStart,bDays) && bStart < addDaysISO(aStart,aDays);
const localISODate = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const bikeBookedOn = (bikeId,date) => liveBookings.some(x=>x.motorcycle_id===bikeId && datesOverlap(x.start_date,x.days,date,1));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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
  const guest=!currentUser || isGuestRider();
  const isAdmin=String(currentUser?.email||"").toLowerCase()==="gyungana8@gmail.com";
  document.body.classList.toggle("passenger-mode",guest);
  document.body.classList.toggle("operator-mode",!!currentUser&&!guest);
  $("#accountStatus").textContent = guest ? "Passenger" : currentUser ? (currentProfile?.full_name || currentUser.email) : "Driver / owner access";
  $("#authButton").classList.toggle("hidden", true);
  $("#signOutButton").classList.toggle("hidden", !currentUser || guest);
  $("#dashTitle").textContent = "Driver dashboard";
  $("#switchRole")?.classList.add("hidden");
  $("#menuBtn")?.classList.toggle("hidden",guest);
  $("#nav")?.classList.toggle("hidden",guest);
  $("#adminNav")?.classList.toggle("hidden",!isAdmin);
  $("#ride-services")?.classList.toggle("hidden",!guest);
  $("#driver-panel")?.classList.toggle("hidden",guest);
  $("#adminPanel")?.classList.toggle("hidden",guest || !isAdmin);
}
async function loadProfile(user) {
  if (!user) { currentProfile=null; role="rider"; updateUI(); return; }
  if (isGuestRider(user)) {
    const {data:guestProfile}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
    currentProfile={id:user.id,full_name:guestProfile?.full_name||"Passenger",phone:guestProfile?.phone||null,role:"rider"};
    verifiedPassengerPhone=currentProfile.phone;
    role="rider";updateUI();
    $("#dashboardIntro").textContent="You are using TWENDE as a passenger without creating an account.";
    $("#dashboardContent").innerHTML='<p class="muted">No passenger account is needed to request a taxi.</p>';
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
  role=currentProfile?.role==="owner"?"owner":"rider";
  updateUI();
  await loadDashboard();
  await loadPassengerRides();await loadDriverDashboard();await loadAdminDashboard();
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

async function onSession(session) {
  currentUser=session?.user||null;
  await loadProfile(currentUser);
  if (currentUser && window.TwendePush?.requestPushToken) window.TwendePush.requestPushToken();
  if(currentUser && !isGuestRider()) { $("#authDialog").close(); }
  else if(!currentUser) { $("#dashboardIntro").textContent="Sign in to view your bookings and listings."; $("#dashboardContent").innerHTML=""; }
}

$("#authButton").onclick=()=>{
  $("#loginForm").classList.remove("hidden");$("#registerForm").classList.add("hidden");
  $("#passengerPhoneForm").classList.add("hidden");$("#passengerOtpForm").classList.add("hidden");
  $("#authDialog").showModal();
};

// Temporary TWENDE pilot mode: collect passenger contact details without SMS OTP.
// Phone numbers are NOT verified in this pilot; retain server-side ride access controls.
function normalizePilotPhone(input){
  const value=String(input||"").replace(/[\s()-]/g,"");
  if(/^\+260[0-9]{9}$/.test(value))return value;
  if(/^260[0-9]{9}$/.test(value))return "+"+value;
  if(/^0[0-9]{9}$/.test(value))return "+260"+value.slice(1);
  return null;
}
$("#passengerPhoneForm").onsubmit=async e=>{
  e.preventDefault();
  const b=e.submitter;b.disabled=true;
  const phone=normalizePilotPhone($("#passengerPhoneEntry").value);
  if(!phone){b.disabled=false;toast("Enter a valid Zambian mobile number, for example 097XXXXXXX.");return;}
  if(!currentUser){b.disabled=false;toast("Passenger session is not ready. Please refresh and try again.");return;}
  verifiedPassengerPhone=phone;
  currentProfile={...(currentProfile||{}),id:currentUser.id,phone,role:"rider"};
  $("#loginForm").classList.add("hidden");$("#registerForm").classList.add("hidden");
  $("#passengerPhoneForm").classList.add("hidden");$("#passengerOtpForm").classList.add("hidden");
  $("#passengerNameForm").classList.remove("hidden");
  b.disabled=false;
  toast("Pilot mode: phone number saved but not SMS-verified.");
};
$("#changePassengerPhone").onclick=()=>{
  $("#passengerOtpForm").classList.add("hidden");$("#passengerPhoneForm").classList.remove("hidden");
};
$("#passengerNameForm").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const first=$("#passengerFirstName").value.trim(),last=$("#passengerLastName").value.trim();
  const fullName=(first+" "+last).trim();
  const {error:authError}=await db.auth.updateUser({data:{full_name:fullName,first_name:first,last_name:last,role:"rider"}});
  if(authError){b.disabled=false;toast("Could not save your name: "+authError.message);return;}
  const passengerPhone=verifiedPassengerPhone||currentProfile?.phone||null;
  const {error:profileError}=await db.from("profiles").upsert({id:currentUser.id,full_name:fullName,phone:passengerPhone,role:"rider"});
  if(profileError) console.warn("Profile details could not be mirrored:",profileError);
  currentProfile={...(currentProfile||{}),id:currentUser.id,full_name:fullName,phone:passengerPhone,role:"rider"};
  b.disabled=false;$("#passengerNameForm").reset();
  toast("Welcome to TWENDE, "+first+".");
  $("#authDialog").close();
  if(pendingPassengerService) $("#locationPermissionDialog").showModal();
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
$("#registerForm").onsubmit=async e=>{
  e.preventDefault(); const b=e.submitter; b.disabled=true;
  const credentials={email:$("#registerEmail").value.trim(),password:$("#registerPassword").value,
    options:{data:{full_name:$("#registerName").value.trim(),phone:$("#registerPhone").value.trim(),role:$("#registerRole").value}}};
  const result=isGuestRider()
    ? await db.auth.updateUser({email:credentials.email,password:credentials.password,data:credentials.options.data})
    : await db.auth.signUp(credentials);
  const data=result.data,error=result.error;
  b.disabled=false;
  if(error){toast(error.message);return;}
  if(data.session){await onSession(data.session);toast("TWENDE account created.");}
  else {toast("Account created. Check your email to confirm, then sign in.");$("#registerForm").reset();$("#registerForm").classList.add("hidden");$("#loginForm").classList.remove("hidden");}
};
$("#loginForm").onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const {data,error}=await db.auth.signInWithPassword({email:$("#loginEmail").value.trim(),password:$("#loginPassword").value});
  b.disabled=false;if(error){toast(error.message);return;}await onSession(data.session);toast("Signed in to TWENDE.");
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
$("#ownerHero").onclick=openOwnerForm;$("#ownerCta").onclick=openOwnerForm;
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
    const {data:bikes,error}=await db.from("motorcycles").select("id,make,model,location,daily_rate,status").eq("owner_id",currentUser.id).order("created_at",{ascending:false});
    if(error){$("#dashboardContent").textContent=error.message;return;}
    const ids=(bikes||[]).map(x=>x.id);let requests=[];
    if(ids.length){const r=await db.from("bookings").select("id,motorcycle_id,rider_name,rider_phone,pickup_location,start_date,days,total_amount,status").in("motorcycle_id",ids).order("created_at",{ascending:false});if(r.error){$("#dashboardContent").textContent=r.error.message;return;}requests=r.data||[];}
    const acceptedRequests=requests.filter(x=>x.status==="accepted");
    liveBookings=acceptedRequests.map(x=>({motorcycle_id:x.motorcycle_id,start_date:x.start_date,days:x.days}));
    const pendingRequests=requests.filter(x=>x.status==="pending");
    const acceptedValue=acceptedRequests.reduce((sum,x)=>sum+Number(x.total_amount||0),0);
    const thisMonth=localISODate().slice(0,7);
    const monthValue=acceptedRequests.filter(x=>String(x.start_date).slice(0,7)===thisMonth).reduce((sum,x)=>sum+Number(x.total_amount||0),0);
    const statsHtml=`<div class="owner-metrics"><article class="metric-card"><span>Motorcycles listed</span><strong>${(bikes||[]).length}</strong></article><article class="metric-card"><span>Pending requests</span><strong>${pendingRequests.length}</strong></article><article class="metric-card"><span>Accepted hire value</span><strong>${money(acceptedValue)}</strong><small>Expected value, not confirmed payments</small></article><article class="metric-card"><span>Accepted this month</span><strong>${money(monthValue)}</strong><small>Based on hire start date</small></article></div>`;
    const bikeHtml=(bikes||[]).map(x=>{const booked=bikeBookedOn(x.id,localISODate());return `<article class="dash-card"><h3>${esc(x.make)} ${esc(x.model)}</h3><p>${esc(x.location)} • ${money(x.daily_rate)}/day • <strong>${booked?"Booked today":esc(x.status)}</strong></p></article>`;}).join("");
    const reqHtml=requests.map(x=>`<article class="dash-card"><h3>Hire request from ${esc(x.rider_name)}</h3><p>${esc(x.rider_phone)} • ${esc(x.pickup_location)} • ${esc(x.start_date)} • ${x.days} day(s) • ${money(x.total_amount)}</p><p>Status: <strong>${esc(x.status)}</strong></p>${x.status==="pending"?`<button class="btn btn-red" data-booking="${x.id}" data-status="accepted">Accept</button> <button class="btn btn-outline" data-booking="${x.id}" data-status="rejected">Decline</button>`:x.status==="accepted"?`<button class="btn btn-outline" data-booking="${x.id}" data-status="cancelled">Cancel booking</button>`:""}</article>`).join("");
    $("#dashboardContent").innerHTML=statsHtml+"<h3>My motorcycles</h3><div class='dash-grid'>"+(bikeHtml||"<p class='muted'>No motorcycles listed yet.</p>")+"</div><h3>Incoming hire requests</h3><div class='dash-grid'>"+(reqHtml||"<p class='muted'>No hire requests yet.</p>")+"</div>";
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
$("#menuBtn").onclick=()=>$("#nav").classList.toggle("open");


/* TWENDE ride-hailing: cash-only taxi requests and driver onboarding.
   Live map/GPS matching and fare routing are intentionally not claimed until a maps provider is configured. */
let selectedRideService = "motorcycle";
let pendingPassengerService=null;
function openRideDialog(service,skipLocationPrompt=false) {
  if(!currentUser){toast("Passenger access is still starting. Please wait a moment and retry.");return;}
  if(!currentProfile?.phone){
    pendingPassengerService=service;
    $("#loginForm").classList.add("hidden");$("#registerForm").classList.add("hidden");
    $("#passengerOtpForm").classList.add("hidden");$("#passengerPhoneForm").classList.remove("hidden");
    $("#authDialog").showModal();return;
  }
  if(!skipLocationPrompt && !window.twendePickupCoords){
    pendingPassengerService=service;
    $("#locationPermissionDialog").showModal();
    return;
  }
  selectedRideService=service;$("#rideServiceType").value=service;
  $("#rideDialogTitle").textContent=service==="car"?"Request a car taxi":"Request a motorcycle taxi";
  $("#passengerName").value=currentProfile?.full_name||"";
  $("#passengerPhone").value=currentProfile?.phone||"";
  $("#rideDialog").showModal();
   loadAvailableTaxiFleet(service);
}
document.querySelectorAll("[data-ride-service]").forEach(b=>b.addEventListener("click",()=>openRideDialog(b.dataset.rideService)));
$("#rideForm").onsubmit=async e=>{
  e.preventDefault();
  const inlineMessage=$("#rideSubmitMessage");
  if(inlineMessage){
    inlineMessage.hidden=false;
    inlineMessage.textContent="Sending your taxi request…";
    inlineMessage.style.display="block";
    inlineMessage.classList.add("is-visible");
  }
  const b=$("#rideRequestSubmit")||e.submitter||e.target.querySelector('[type="submit"]');
  if(b){b.disabled=true;b.textContent="Sending request…";}
  try{
    // Recover the active passenger session before submitting. Guest riders remain
    // anonymous-authenticated users; no passenger password/account is required.
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
    const passengerName=$("#passengerName").value.trim();
    const passengerPhone=$("#passengerPhone").value.trim();
    const pickup=$("#ridePickup").value.trim();
    const destination=$("#rideDestination").value.trim();
    const service=$("#rideServiceType").value;
    if(!passengerName||!passengerPhone||!pickup||!destination){
      throw new Error("Please complete your name, phone number, pickup and destination.");
    }
    const row={rider_id:user.id,passenger_name:passengerName,passenger_phone:passengerPhone,service_type:service,pickup_text:pickup,destination_text:destination,payment_method:"cash",status:"pending"};
    const {error}=await db.from("ride_requests").insert(row);
    if(error){
      console.error("Taxi request insert failed:",error);
      if(error.code==="42501")throw new Error("Booking was blocked by database permissions. The ride-booking SQL policies need updating.");
      if(error.code==="23503")throw new Error("Passenger session was not accepted by the database. Please refresh TWENDE and try again.");
      throw new Error("Booking failed: "+(error.message||"database error"));
    }
    closeDialog("rideDialog");
    e.target.reset();
    toast("Taxi request sent successfully. Waiting for an approved online driver.");
    await loadPassengerRides();
    if(typeof loadAvailableTaxiFleet==="function")await loadAvailableTaxiFleet();
    if(typeof loadDriverDashboard==="function"&&!isGuestRider())await loadDriverDashboard();
  }catch(error){
    console.error("TWENDE taxi booking:",error);
    const message=error?.message||"Taxi booking failed. Please try again.";
    toast(message);
  }finally{
    if(b){b.disabled=false;b.textContent="Request taxi";}
  }
};
$("#rideRequestSubmit")?.addEventListener("click",()=>{
  const form=$("#rideForm");
  const button=$("#rideRequestSubmit");
  if(!form||!button)return;
  // Dispatch explicitly so browser-native validation bubbles cannot silently
  // block the request while fields are inside a scrolling native dialog.
  form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
});
async function loadAvailableTaxiFleet(service=selectedRideService){
   const host=$("#nearbyTaxiFleet");
   if(!host)return;
   host.innerHTML='<p class="muted">Checking available vehicles…</p>';
   if(!currentUser){host.innerHTML='<p class="muted">Passenger connection is starting…</p>';return;}
   const {data,error}=await db.rpc("get_available_twende_vehicles");
   if(error){
     console.warn("Available taxi fleet:",error);
     host.innerHTML='<p class="muted">Nearby vehicles could not be loaded. Please try again.</p>';return;
   }
   const rows=(data||[]).filter(v=>v.vehicle_type===service);
   const card=v=>`<article class="fleet-vehicle-card"><div class="fleet-plate">${esc(v.plate_number||"Registration pending")}</div><strong>${esc(v.vehicle_make||"Make not supplied")}</strong><span>${esc(v.driver_name||"TWENDE driver")}</span></article>`;
   host.innerHTML=rows.map(card).join("")||`<p class="muted">No ${service==="car"?"car taxis":"motorcycle taxis"} are online nearby at the moment.</p>`;
 }
 async function loadPassengerRides(){
  const host=$("#passengerRides");if(!host)return;
  if(!currentUser){host.innerHTML='<p class="muted">Sign in to see your taxi requests.</p>';return;}
  const {data,error}=await db.from("ride_requests").select("id,service_type,pickup_text,destination_text,payment_method,status,created_at,route_distance_km,estimated_fare").eq("rider_id",currentUser.id).order("created_at",{ascending:false}).limit(8);
  if(error){host.innerHTML='<p class="muted">Taxi request history will appear after the ride-hailing database is configured.</p>';return;}
  host.innerHTML='<h3>Your taxi requests</h3>'+(data||[]).map(x=>`<article class="dash-card"><h3>${x.service_type==="car"?"🚕 Car taxi":"🏍️ Motorcycle taxi"}</h3><p>${esc(x.pickup_text)} → ${esc(x.destination_text)}</p><p>${x.route_distance_km?Number(x.route_distance_km).toFixed(1)+" km • ":""}${x.estimated_fare?money(x.estimated_fare)+" estimated • ":""}Payment: Cash • Status: <strong>${esc(x.status)}</strong></p></article>`).join("")||'<p class="muted">You have not requested a taxi yet.</p>';
}
$("#driverRegisterBtn").onclick=()=>{
  if(!currentUser || isGuestRider()){toast("Create a driver account before registering your vehicle.");$("#loginForm").classList.add("hidden");$("#registerForm").classList.remove("hidden");$("#authDialog").showModal();return;}
  $("#driverName").value=currentProfile?.full_name||"";
  $("#driverPhone").value=currentProfile?.phone||"";
  $("#driverDialog").showModal();
};
$("#driverForm").onsubmit=async e=>{
  e.preventDefault();if(!currentUser)return;
  const b=e.submitter;b.disabled=true;
  const row={user_id:currentUser.id,driver_name:$("#driverName").value.trim(),phone:$("#driverPhone").value.trim(),vehicle_type:$("#driverVehicleType").value,vehicle_make:$("#driverVehicleMake").value.trim(),vehicle_model:$("#driverVehicleModel").value.trim(),plate_number:$("#driverPlate").value.trim(),licence_number:$("#driverLicence").value.trim(),operating_area:$("#driverArea").value.trim(),approval_status:"pending",is_online:false};
  const {error}=await db.from("driver_vehicles").insert(row);
  b.disabled=false;
  if(error){console.error("Vehicle registration:",error);toast(error.code==="23505"?"This registration number is already listed on your account.":"Vehicle registration could not be saved: "+error.message);return;}
  closeDialog("driverDialog");e.target.reset();toast("Vehicle submitted for verification. You can add another vehicle.");await loadDriverDashboard();
};
async function loadDriverDashboard(){
  const host=$("#driverDashboard");if(!host)return;
  if(!currentUser){host.innerHTML='<p class="muted">Sign in to register or manage your vehicles.</p>';return;}
  const {data:vehicles,error}=await db.from("driver_vehicles").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false});
  if(error){host.innerHTML='<p class="muted">Multi-vehicle services need the Phase 2 database setup: '+esc(error.message)+'</p>';return;}
  const addButton='<button class="btn btn-red" id="driverAddVehicle">Add another vehicle</button>';
  if(!vehicles?.length){host.innerHTML='<p class="muted">No vehicle registrations found. Register your first car or motorcycle.</p>'+addButton;return;}
  const approved=vehicles.filter(v=>v.approval_status==="approved");
  const {data:rides,error:rideError}=await db.from("ride_requests").select("*").or("status.eq.pending,driver_id.eq."+currentUser.id).order("created_at",{ascending:false}).limit(20);
  const vehicleCards=vehicles.map(v=>`<article class="dash-card"><h3>${esc(v.vehicle_make)} ${esc(v.vehicle_model)} • ${esc(v.vehicle_type)}</h3><p>Registration: ${esc(v.plate_number)} • Area: ${esc(v.operating_area)}</p><p>Verification: <strong>${esc(v.approval_status)}</strong></p><p>Availability: <strong>${v.is_online?"Online":"Offline"}</strong></p>${v.approval_status==="approved"?`<button class="btn btn-red" data-vehicle-online="${v.id}" data-online="${!v.is_online}">${v.is_online?"Go offline":"Go online"}</button>`:'<p class="muted">An administrator must approve this vehicle before it can receive requests.</p>'}</article>`).join("");
  const rideCards=rideError?'<p class="muted">Could not load taxi requests: '+esc(rideError.message)+'</p>':(rides||[]).map(x=>`<article class="dash-card"><h3>${x.service_type==="car"?"🚕 Car taxi":"🏍️ Motorcycle taxi"} request</h3><p>${esc(x.pickup_text)} → ${esc(x.destination_text)}</p><p>Passenger: ${esc(x.passenger_name)} • ${esc(x.passenger_phone)}</p><p>${x.route_distance_km?Number(x.route_distance_km).toFixed(1)+" km • ":""}${x.estimated_fare?money(x.estimated_fare)+" estimated • ":""}Payment: Cash • Status: <strong>${esc(x.status)}</strong></p>${x.status==="pending"&&approved.some(v=>v.is_online&&v.vehicle_type===x.service_type)?`<button class="btn btn-red" data-ride-action="accept" data-ride-id="${x.id}">Accept ride</button>`:x.driver_id===currentUser.id&&x.status==="accepted"?`<button class="btn btn-red" data-ride-action="complete" data-ride-id="${x.id}">Complete trip</button>`:""}</article>`).join("")||'<p class="muted">No matching taxi requests at the moment.</p>';
  host.innerHTML='<h3>Your vehicles ('+vehicles.length+')</h3>'+vehicleCards+addButton+'<h3 id="driverTaxiRequests">Taxi requests</h3>'+rideCards;
}
$("#driverDashboard").onclick=async e=>{
  const add=e.target.closest("#driverAddVehicle");
  if(add){
    if(!currentUser || isGuestRider()){toast("Please sign in with your driver account first.");return;}
    $("#driverName").value=currentProfile?.full_name||"";
    $("#driverPhone").value=currentProfile?.phone||"";
    $("#driverDialog").showModal();
    return;
  }
  const vehicleToggle=e.target.closest("[data-vehicle-online]");
  if(vehicleToggle){
    const desired=vehicleToggle.dataset.online==="true";
    vehicleToggle.disabled=true;
    const {error}=await db.rpc("twende_set_vehicle_online",{p_vehicle_id:vehicleToggle.dataset.vehicleOnline,p_online:desired});
    if(error){vehicleToggle.disabled=false;toast("Could not change vehicle availability: "+error.message);return;}
    toast(desired?"Vehicle is now online.":"Vehicle is now offline.");
    window.dispatchEvent(new CustomEvent("twende-vehicle-online",{detail:{online:desired}}));
    await loadDriverDashboard();
    return;
  }
  const online=e.target.closest("#driverOnlineBtn");
  if(online){const {error}=await db.rpc("set_twende_driver_online",{p_online:online.dataset.online==="true"});if(error){toast("Could not change availability. Check driver approval and database setup.");return;}toast("Driver availability updated.");await loadDriverDashboard();return;}
  const action=e.target.closest("[data-ride-action]");if(!action)return;
  const rpc=action.dataset.rideAction==="accept"?"accept_twende_ride":"complete_twende_ride";
  const {error}=await db.rpc(rpc,{p_ride_id:action.dataset.rideId});
  if(error){toast("Ride update failed: "+error.message);return;}
  toast(action.dataset.rideAction==="accept"?"Ride accepted. Contact the passenger to confirm pickup.":"Trip marked completed.");
  await loadDriverDashboard();await loadPassengerRides();
};


async function loadAdminDashboard(){
  const panel=$("#adminPanel"),nav=$("#adminNav"),host=$("#adminContent");
  if(!panel||!host)return;
  panel.classList.add("hidden");if(nav)nav.classList.add("hidden");
  if(!currentUser){host.innerHTML='<p class="muted">Sign in with the designated administrator account.</p>';return;}
  // Reveal the entry point only for the specifically assigned account. All data
  // access and approval actions remain protected by the server-side admin RPC/RLS.
  const designatedAdmin=String(currentUser.email||"").toLowerCase()==="gyungana8@gmail.com";
  if(!designatedAdmin){host.innerHTML='<p class="muted">This account does not have TWENDE administrator access.</p>';return;}
  panel.classList.remove("hidden");if(nav)nav.classList.remove("hidden");
  host.innerHTML='<p class="muted">Verifying administrator permissions…</p>';
  const {data:isAdmin,error:adminError}=await db.rpc("twende_is_admin");
  if(adminError){host.innerHTML='<p class="muted">Admin menu is available, but permission verification failed: '+esc(adminError.message)+'. Sign out and sign in again, then refresh.</p>';return;}
  if(isAdmin!==true){host.innerHTML='<p class="muted">Your email is recognised, but the database has not confirmed administrator permissions. Sign out and sign in again, then refresh. If this persists, re-run the TWENDE admin SQL setup.</p>';return;}
  const {data:vehicles,error}=await db.from("driver_vehicles").select("id,user_id,driver_name,phone,vehicle_type,vehicle_make,vehicle_model,plate_number,operating_area,approval_status,created_at").order("created_at",{ascending:false});
  if(error){host.innerHTML='<p class="muted">Could not load vehicle applications: '+esc(error.message)+'</p>';return;}
  const rows=vehicles||[];
  const {data:rides, error:ridesError}=await db.from("ride_requests").select("id,service_type,passenger_name,passenger_phone,pickup_text,destination_text,status,created_at,driver_id").order("created_at",{ascending:false}).limit(50);
  const vehicleHtml=rows.map(v=>`<article class="dash-card"><h3>${esc(v.driver_name)} • ${esc(v.vehicle_type)}</h3><p>Phone: ${esc(v.phone)} • Area: ${esc(v.operating_area)}</p><p>Vehicle: ${esc(v.vehicle_make)} ${esc(v.vehicle_model)} • Registration: ${esc(v.plate_number)}</p><p>Status: <strong>${esc(v.approval_status)}</strong></p>${v.approval_status==="pending"?`<button class="btn btn-red" data-vehicle-decision="approved" data-vehicle-id="${v.id}">Approve</button> <button class="btn btn-outline" data-vehicle-decision="rejected" data-vehicle-id="${v.id}">Reject</button>`:""}</article>`).join("")||'<p class="muted">No vehicle applications have been submitted.</p>';
  const rideHtml=ridesError?'<p class="muted">Taxi requests could not be loaded: '+esc(ridesError.message)+'</p>':(rides||[]).map(x=>`<article class="dash-card"><h3>${x.service_type==="car"?"🚕 Car taxi":"🏍️ Motorcycle taxi"} • ${esc(x.status)}</h3><p>${esc(x.pickup_text)} → ${esc(x.destination_text)}</p><p>Passenger: ${esc(x.passenger_name)} • ${esc(x.passenger_phone)}</p><p>Request ID: ${esc(x.id)}</p></article>`).join("")||'<p class="muted">No taxi requests have been received.</p>';
  host.innerHTML='<h3>Vehicle applications ('+rows.length+')</h3>'+vehicleHtml+'<h3>Taxi rides ('+(rides||[]).length+')</h3>'+rideHtml;
}
$("#refreshAdmin")?.addEventListener("click",loadAdminDashboard);
$("#adminContent")?.addEventListener("click",async e=>{
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
  const {data,error}=await db.auth.getSession();if(error)console.error(error);
  let session=data?.session||null;
  if(!session){
    const guest=await db.auth.signInAnonymously();
    if(guest.error){console.error("Passenger guest session:",guest.error);toast("Enable anonymous sign-ins in Supabase Auth settings to allow passengers to book without accounts.");}
    else session=guest.data.session;
  }
  await onSession(session);await loadPassengerRides();await loadAvailableTaxiFleet();
  if(currentUser && !isGuestRider()) { await loadDriverDashboard(); await loadAdminDashboard(); }
  startTwendeRealtime();
  db.auth.onAuthStateChange((_event,nextSession)=>setTimeout(()=>onSession(nextSession),0));
}
updateUI();startApp();



// Live updates keep taxi requests and vehicle availability current without manual refresh.
// Online state is stored on each approved vehicle and is not reset on app restart.
let twendeRealtimeChannel=null;
function startTwendeRealtime(){
  if(twendeRealtimeChannel) return;
  twendeRealtimeChannel=db.channel("twende-live-operations")
    .on("postgres_changes",{event:"*",schema:"public",table:"ride_requests"},()=>{
      if(isGuestRider()){loadPassengerRides();loadAvailableTaxiFleet();}
      else if(currentUser){loadDriverDashboard();loadAdminDashboard();}
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"driver_vehicles"},()=>{
      if(isGuestRider())loadAvailableTaxiFleet();
      else if(currentUser){loadDriverDashboard();loadAdminDashboard();}
    })
    .subscribe(status=>{if(status==="CHANNEL_ERROR")console.warn("TWENDE live updates could not connect; check Supabase Realtime publication.");});
}

// Public extension hooks for TWENDE GPS/fare module (publishable Supabase client only).
window.twendeDb = db;
Object.defineProperty(window, "currentTwendeUser", { configurable:true, get:()=>currentUser });
window.loadTwendePassengerRides = loadPassengerRides;
