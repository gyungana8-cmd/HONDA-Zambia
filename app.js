/* TWENDE browser client. Publishable keys are public by design.
   NEVER put a Supabase secret or service_role key in browser code. */
const SUPABASE_URL = "https://obgteeruczqlebllrafr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PeUZGgiMW02w0jstoKhICA_cXw83_Ic";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null, currentProfile = null, role = "rider";
let selectedBike = null, liveBikes = [], liveBookings = [];
const $ = s => document.querySelector(s);
const money = n => "K" + Number(n || 0).toLocaleString("en-ZM", {maximumFractionDigits: 2});
const addDaysISO = (date,days) => { const d=new Date(date+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+Number(days||1)); return d.toISOString().slice(0,10); };
const datesOverlap = (aStart,aDays,bStart,bDays) => aStart < addDaysISO(bStart,bDays) && bStart < addDaysISO(aStart,aDays);
const localISODate = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const bikeBookedOn = (bikeId,date) => liveBookings.some(x=>x.motorcycle_id===bikeId && datesOverlap(x.start_date,x.days,date,1));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message) { const t=$("#toast"); t.textContent=message; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),3500); }
function closeDialog(id) { document.getElementById(id).close(); }
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click",()=>closeDialog(b.dataset.close)));

function updateUI() {
  $("#accountStatus").textContent = currentUser ? (currentProfile?.full_name || currentUser.email) : "Not signed in";
  $("#authButton").classList.toggle("hidden", !!currentUser);
  $("#signOutButton").classList.toggle("hidden", !currentUser);
  $("#dashTitle").textContent = role === "owner" ? "Owner dashboard" : "Rider dashboard";
  $("#switchRole").textContent = role === "owner" ? "Switch to rider" : "Switch to owner";
}
async function loadProfile(user) {
  if (!user) { currentProfile=null; role="rider"; updateUI(); return; }
  const {data:existing,error:readError}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if (readError) console.error("Profile read:",readError);
  if (existing) currentProfile=existing;
  else {
    const meta=user.user_metadata||{};
    const row={id:user.id,full_name:meta.full_name||user.email||"TWENDE user",phone:meta.phone||null,role:meta.role||"rider"};
    const {data,error}=await db.from("profiles").insert(row).select().single();
    currentProfile=error?row:data;
    if(error) console.error("Profile create:",error);
  }
  role=currentProfile?.role==="owner"?"owner":"rider";
  updateUI();
  await loadDashboard();
}
async function onSession(session) {
  currentUser=session?.user||null;
  await loadProfile(currentUser);
  if(currentUser) { $("#authDialog").close(); await loadMotorcycles(); }
  else { $("#dashboardIntro").textContent="Sign in to view your bookings and listings."; $("#dashboardContent").innerHTML=""; }
}

$("#authButton").onclick=()=>{ $("#loginForm").classList.remove("hidden"); $("#registerForm").classList.add("hidden"); $("#authDialog").showModal(); };
$("#showRegister").onclick=()=>{ $("#loginForm").classList.add("hidden"); $("#registerForm").classList.remove("hidden"); };
$("#showLogin").onclick=()=>{ $("#registerForm").classList.add("hidden"); $("#loginForm").classList.remove("hidden"); };
$("#registerForm").onsubmit=async e=>{
  e.preventDefault(); const b=e.submitter; b.disabled=true;
  const {data,error}=await db.auth.signUp({email:$("#registerEmail").value.trim(),password:$("#registerPassword").value,
    options:{data:{full_name:$("#registerName").value.trim(),phone:$("#registerPhone").value.trim(),role:$("#registerRole").value}}});
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
$("#signOutButton").onclick=async()=>{
  const {error}=await db.auth.signOut();if(error)toast(error.message);else{await onSession(null);await loadMotorcycles();toast("Signed out.");}
};

async function loadMotorcycles() {
  $("#bikeGrid").innerHTML='<p class="muted">Loading live motorcycles…</p>';
  const {data,error}=await db.from("motorcycles").select("id,make,model,location,daily_rate,description,status").eq("status","available").order("created_at",{ascending:false});
  if(error){console.error(error);$("#bikeGrid").innerHTML='<p class="muted">Could not load listings. Refresh and try again.</p>';$("#resultCount").textContent="Connection error";return;}
  liveBikes=data||[];
  liveBookings=[];
  const ids=liveBikes.map(x=>x.id);
  if(ids.length){const bookings=await db.from("bookings").select("motorcycle_id,start_date,days").in("motorcycle_id",ids).eq("status","accepted");if(bookings.error)console.warn("Could not load accepted booking dates:",bookings.error);else liveBookings=bookings.data||[];}
  renderBikes();
}
function renderBikes() {
  const loc=$("#location").value.trim().toLowerCase(),max=$("#maxPrice").value,cat=$("#category").value;
  const rows=liveBikes.filter(b=>b.location.toLowerCase().includes(loc)&&(max==="all"||Number(b.daily_rate)<=Number(max))&&(cat==="all"||[b.make,b.model,b.description].join(" ").toLowerCase().includes(cat.toLowerCase())));
  $("#bikeGrid").innerHTML=rows.map(b=>{const booked=bikeBookedOn(b.id,localISODate());return `<article class="bike-card"><div class="bike-photo">🏍️</div><div class="bike-info"><h3>${esc(b.make)} ${esc(b.model)}</h3><div class="bike-meta"><span>📍 ${esc(b.location)}</span><span>${booked?"Booked today":"Available"}</span></div><p class="muted">${esc(b.description||"Available for daily hire")}</p><div class="bike-bottom"><div class="price">${money(b.daily_rate)} <small>/ day</small></div><button class="btn btn-red" data-hire="${b.id}" ${booked?"disabled":""}>${booked?"Booked today":"Request hire"}</button></div></div></article>`;}).join("")||'<p class="muted">No live motorcycles are listed yet. Owners can sign in and publish the first listing.</p>';
  $("#resultCount").textContent=rows.length+" live listing"+(rows.length===1?"":"s");
}
$("#bikeGrid").onclick=e=>{
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
  if(!currentUser){toast("Please sign in first.");$("#authDialog").showModal();return;}
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
    const pendingRequests=requests.filter(x=>x.status==="pending");
    const acceptedValue=acceptedRequests.reduce((sum,x)=>sum+Number(x.total_amount||0),0);
    const thisMonth=localISODate().slice(0,7);
    const monthValue=acceptedRequests.filter(x=>String(x.start_date).slice(0,7)===thisMonth).reduce((sum,x)=>sum+Number(x.total_amount||0),0);
    const statsHtml=`<div class="owner-metrics"><article class="metric-card"><span>Motorcycles listed</span><strong>${(bikes||[]).length}</strong></article><article class="metric-card"><span>Pending requests</span><strong>${pendingRequests.length}</strong></article><article class="metric-card"><span>Accepted hire value</span><strong>${money(acceptedValue)}</strong><small>Expected value, not confirmed payments</small></article><article class="metric-card"><span>Accepted this month</span><strong>${money(monthValue)}</strong><small>Based on hire start date</small></article></div>`;
    const bikeHtml=(bikes||[]).map(x=>`<article class="dash-card"><h3>${esc(x.make)} ${esc(x.model)}</h3><p>${esc(x.location)} • ${money(x.daily_rate)}/day • ${esc(x.status)}</p></article>`).join("");
    const reqHtml=requests.map(x=>`<article class="dash-card"><h3>Hire request from ${esc(x.rider_name)}</h3><p>${esc(x.rider_phone)} • ${esc(x.pickup_location)} • ${esc(x.start_date)} • ${x.days} day(s) • ${money(x.total_amount)}</p><p>Status: <strong>${esc(x.status)}</strong></p>${x.status==="pending"?`<button class="btn btn-red" data-booking="${x.id}" data-status="accepted">Accept</button> <button class="btn btn-outline" data-booking="${x.id}" data-status="rejected">Decline</button>`:""}</article>`).join("");
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

async function startApp(){
  const {data,error}=await db.auth.getSession();if(error)console.error(error);
  await onSession(data?.session||null);await loadMotorcycles();
  db.auth.onAuthStateChange((_event,session)=>setTimeout(()=>onSession(session),0));
}
updateUI();startApp();
