/* TWENDE role menu - custom overlay for Android WebView compatibility. */
(()=>{
 const $=s=>document.querySelector(s);
 const overlay=document.createElement("div");
 overlay.id="twendeRoleMenu";
 overlay.className="twende-role-overlay hidden";
 overlay.setAttribute("aria-hidden","true");
 overlay.innerHTML=`
  <section class="twende-role-sheet" role="dialog" aria-modal="true" aria-labelledby="twendeRoleTitle">
   <button type="button" class="twende-role-close" id="twendeRoleMenuClose" aria-label="Close">×</button>
   <span class="eyebrow">TWENDE ZAMBIA</span>
   <h2 id="twendeRoleTitle">Account & access</h2>
   <p class="muted" id="twendeRoleMenuIntro">Choose an access area.</p>
   <div class="twende-role-options" id="twendeRoleOptions"></div>
   <button type="button" class="btn btn-outline full" id="twendeRolePassenger">Passenger home</button>
   <button type="button" class="btn btn-outline full hidden" id="twendeRoleSignOut">Sign out</button>
  </section>`;
 document.body.appendChild(overlay);
 const options=$("#twendeRoleOptions");
 function show(){overlay.classList.remove("hidden");overlay.setAttribute("aria-hidden","false");document.body.classList.add("twende-role-menu-open");}
 function hide(){overlay.classList.add("hidden");overlay.setAttribute("aria-hidden","true");document.body.classList.remove("twende-role-menu-open");}
 function add(label,description,role,icon){
  const b=document.createElement("button");b.type="button";b.className="twende-role-option";
  const symbol=document.createElement("span");symbol.textContent=icon;
  const copy=document.createElement("span");const strong=document.createElement("b");strong.textContent=label;
  const small=document.createElement("small");small.textContent=description;copy.append(strong,small);
  const arrow=document.createElement("i");arrow.textContent="›";b.append(symbol,copy,arrow);
  b.addEventListener("click",()=>choose(role));options.append(b);
 }
 function refresh(){
  options.replaceChildren();
  const snap=window.twendeRoleSnapshot||{role:"rider",guest:true,signedIn:false};
  const intro=$("#twendeRoleMenuIntro");
  if(snap.guest){
   intro.textContent="Passenger access is ready. Partner portals require a separate approved account.";
   add("Driver portal","Sign in with an approved driver account to manage rides","driver","🚗");
   add("Vehicle owner portal","Sign in with an approved owner account to manage vehicles and earnings","owner","🔑");
   add("Administrator portal","Restricted to authorised TWENDE administrators","admin","🛡️");
   $("#twendeRoleSignOut").classList.add("hidden");
  }else{
   intro.textContent="Only portals assigned to your signed-in account are available.";
   if(snap.admin)add("Administrator portal","Manage registrations, bookings, income and support","admin","🛡️");
   if(snap.role==="driver"||snap.hasDriverRegistration)add("Driver portal","View and respond to your assigned ride requests","driver","🚗");
   if(snap.role==="owner")add("Vehicle owner portal","Manage vehicles, drivers, bookings and earnings","owner","🔑");
   if(!options.children.length){const p=document.createElement("p");p.className="muted";p.textContent="This account currently has passenger access only.";options.append(p);}
   $("#twendeRoleSignOut").classList.remove("hidden");
  }
 }
 function choose(portal){
  window.twendeRequestedPortal=portal;
  const snap=window.twendeRoleSnapshot||{};
  const allowed=portal==="admin"?snap.admin===true:portal==="driver"?snap.role==="driver":portal==="owner"?snap.role==="owner":false;
  if(allowed){
   hide();
   const target=portal==="admin"?"#adminPanel":portal==="driver"?"#driver-panel":"#dashboard";
   $(target)?.scrollIntoView({behavior:"smooth",block:"start"});
   return;
  }
  hide();
  const login=$("#authDialog");
  if(login && typeof login.showModal==="function")login.showModal();
  else if(login){login.classList.remove("hidden");login.style.display="block";}
  const loginForm=$("#loginForm"),registerForm=$("#registerForm");
  loginForm?.classList.remove("hidden");registerForm?.classList.add("hidden");
  const title=$("#loginForm h2");if(title)title.textContent=portal==="admin"?"Administrator sign in":portal==="owner"?"Vehicle owner sign in":"Driver sign in";
  const roleField=$("#registerRole");if(roleField && (portal==="driver"||portal==="owner"))roleField.value=portal;
 }
 window.twendeShowRoleMenu=()=>{refresh();show();};
 window.twendeRefreshRoleMenu=refresh;
 document.addEventListener("click",event=>{
  const trigger=event.target.closest("#twendeBellButton");
  if(trigger){event.preventDefault();event.stopPropagation();window.twendeShowRoleMenu();return;}
  if(event.target.closest("#twendeRoleMenuClose")||event.target===overlay){hide();return;}
  if(event.target.closest("#twendeRolePassenger")){hide();window.twendeShowPassengerHub?.("profile");return;}
  if(event.target.closest("#twendeRoleSignOut")){hide();$("#signOutButton")?.click();}
 },true);
 document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!overlay.classList.contains("hidden"))hide();});
 refresh();
})();