/* TWENDE role-aware account menu. Portal visibility is based on verified account state, never on menu selection. */
(()=>{
 const $=s=>document.querySelector(s);
 const dialog=document.createElement("dialog");
 dialog.id="twendeRoleMenu";
 dialog.className="twende-role-menu";
 dialog.innerHTML=`
  <div class="twende-role-menu-inner">
   <button type="button" class="close" id="twendeRoleMenuClose" aria-label="Close">×</button>
   <span class="eyebrow">TWENDE ZAMBIA</span>
   <h2>Account & access</h2>
   <p class="muted" id="twendeRoleMenuIntro">Choose the area you need. Access is checked against your approved account.</p>
   <div class="twende-role-options" id="twendeRoleOptions"></div>
   <button type="button" class="btn btn-outline full" id="twendeRolePassenger">Passenger profile</button>
   <button type="button" class="btn btn-outline full hidden" id="twendeRoleSignOut">Sign out</button>
  </div>`;
 document.body.append(dialog);
 const options=$("#twendeRoleOptions");
 function add(label,description,role,icon){
  const b=document.createElement("button");b.type="button";b.className="twende-role-option";
  b.innerHTML='<span>'+icon+'</span><span><b>'+label+'</b><small>'+description+'</small></span><i>›</i>';
  b.addEventListener("click",()=>choose(role));options.append(b);
 }
 function refresh(){
  if(!options)return;options.replaceChildren();
  const user=window.currentTwendeUser, snap=window.twendeRoleSnapshot||{role:"rider"};
  const guest=!user||user.is_anonymous;
  const intro=$("#twendeRoleMenuIntro");
  if(guest){
   intro.textContent="Passenger access is ready. Partner portals require a separate approved account.";
   add("Driver portal","Sign in to view assigned rides and accept requests","driver","🚗");
   add("Vehicle owner portal","Sign in to manage your approved fleet and earnings","owner","🔑");
   add("Administrator portal","Restricted to designated TWENDE administrators","admin","🛡️");
   $("#twendeRoleSignOut").classList.add("hidden");
  }else{
   intro.textContent="Signed in as "+(user.email||"a TWENDE partner")+". Only portals assigned to this account are available.";
   if(snap.admin)add("Administrator portal","Manage applications, bookings and support","admin","🛡️");
   if(snap.role==="driver"||snap.hasDriverRegistration)add("Driver portal","Your vehicle approval, availability and ride requests","driver","🚗");
   if(snap.role==="owner")add("Vehicle owner portal","Your vehicles, drivers, bookings and income","owner","🔑");
   if(!options.children.length){
    const p=document.createElement("p");p.className="muted";p.textContent="This signed-in account has passenger access only. Use an approved partner account for operational dashboards.";options.append(p);
   }
   $("#twendeRoleSignOut").classList.remove("hidden");
  }
 }
 function choose(portal){
  window.twendeRequestedPortal=portal;
  if(portal==="admin"&&(window.twendeRoleSnapshot||{}).admin){
   dialog.close();$("#adminPanel")?.scrollIntoView({behavior:"smooth",block:"start"});return;
  }
  if(portal==="driver"&&(window.twendeRoleSnapshot||{}).role==="driver"){
   dialog.close();$("#driver-panel")?.scrollIntoView({behavior:"smooth",block:"start"});return;
  }
  if(portal==="owner"&&(window.twendeRoleSnapshot||{}).role==="owner"){
   dialog.close();$("#dashboard")?.scrollIntoView({behavior:"smooth",block:"start"});return;
  }
  dialog.close();
  $("#loginForm")?.classList.remove("hidden");
  $("#registerForm")?.classList.add("hidden");
  $("#passengerPhoneForm")?.classList.add("hidden");
  $("#passengerOtpForm")?.classList.add("hidden");
  const title=$("#loginForm h2");if(title)title.textContent=portal==="admin"?"Administrator sign in":portal==="owner"?"Vehicle owner sign in":"Driver sign in";
  $("#authDialog")?.showModal();
 }
 window.twendeShowRoleMenu=()=>{refresh();if(!dialog.open)dialog.showModal();};
 window.twendeRefreshRoleMenu=refresh;
 $("#twendeRoleMenuClose").addEventListener("click",()=>dialog.close());
 $("#twendeRolePassenger").addEventListener("click",()=>{dialog.close();window.twendeShowPassengerHub?.("profile");});
 $("#twendeRoleSignOut").addEventListener("click",async()=>{dialog.close();await window.twendeSignOut?.();$("#signOutButton")?.click();});
})();