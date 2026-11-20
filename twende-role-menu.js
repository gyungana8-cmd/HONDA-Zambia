/* TWENDE role menu controller: uses static HTML in index.html for WebView reliability. */
(()=>{
 const $=s=>document.querySelector(s);
 const overlay=$("#twendeRoleMenu"),options=$("#twendeRoleOptions");
 if(!overlay||!options){console.error("TWENDE role menu markup missing");return;}
 const show=()=>{overlay.classList.remove("hidden");overlay.setAttribute("aria-hidden","false");document.body.classList.add("twende-role-menu-open");};
 const hide=()=>{overlay.classList.add("hidden");overlay.setAttribute("aria-hidden","true");document.body.classList.remove("twende-role-menu-open");};
 function add(label,description,portal,icon){
  const b=document.createElement("button");b.type="button";b.className="twende-role-option";
  const symbol=document.createElement("span");symbol.textContent=icon;
  const copy=document.createElement("span"),strong=document.createElement("b"),small=document.createElement("small");
  strong.textContent=label;small.textContent=description;copy.append(strong,small);
  const arrow=document.createElement("i");arrow.textContent="›";b.append(symbol,copy,arrow);
  b.addEventListener("click",()=>choose(portal));options.append(b);
 }
 function refresh(){
  options.replaceChildren();
  const snap=window.twendeRoleSnapshot||{role:"rider",guest:true,signedIn:false};
  $("#twendeRoleMenuIntro").textContent=snap.guest?"Passenger access is ready. Partner portals require an approved account.":"Only portals assigned to your signed-in account are available.";
  if(snap.guest){
   add("Driver portal","Sign in with an approved driver account","driver","🚗");
   add("Vehicle owner portal","Sign in with an approved owner account","owner","🔑");
   add("Administrator portal","Restricted to authorised administrators","admin","🛡️");
   $("#twendeRoleSignOut").classList.add("hidden");
  }else{
   if(snap.admin)add("Administrator portal","Manage the TWENDE system","admin","🛡️");
   if(snap.role==="driver"||snap.hasDriverRegistration)add("Driver portal","View and accept assigned ride requests","driver","🚗");
   if(snap.role==="owner")add("Vehicle owner portal","Manage fleet, drivers and income","owner","🔑");
   if(!options.children.length){const p=document.createElement("p");p.className="muted";p.textContent="This account currently has passenger access only.";options.append(p);}
   $("#twendeRoleSignOut").classList.remove("hidden");
  }
 }
 function choose(portal){
  window.twendeRequestedPortal=portal;
  const snap=window.twendeRoleSnapshot||{};
  const allowed=portal==="admin"?snap.admin===true:portal==="driver"?snap.role==="driver":portal==="owner"?snap.role==="owner":false;
  hide();
  if(allowed){
   const target=portal==="admin"?"#adminPanel":portal==="driver"?"#driver-panel":"#dashboard";
   $(target)?.scrollIntoView({behavior:"smooth",block:"start"});return;
  }
  const dlg=$("#authDialog");
  if(dlg&&typeof dlg.showModal==="function")dlg.showModal();
  else if(dlg){dlg.classList.remove("hidden");dlg.style.display="block";}
  $("#loginForm")?.classList.remove("hidden");$("#registerForm")?.classList.add("hidden");
  const title=$("#loginForm h2");if(title)title.textContent=portal==="admin"?"Administrator sign in":portal==="owner"?"Vehicle owner sign in":"Driver sign in";
  const roleField=$("#registerRole");if(roleField&&(portal==="driver"||portal==="owner"))roleField.value=portal;
 }
 window.twendeShowRoleMenu=()=>{refresh();show();};
 window.twendeRefreshRoleMenu=refresh;
 document.addEventListener("click",e=>{
  const t=e.target.closest("#twendeBellButton");
  if(t){e.preventDefault();e.stopPropagation();window.twendeShowRoleMenu();return;}
  if(e.target.closest("#twendeRoleMenuClose")||e.target===overlay){hide();return;}
  if(e.target.closest("#twendeRolePassenger")){hide();window.twendeShowPassengerHub?.("profile");return;}
  if(e.target.closest("#twendeRoleSignOut")){hide();$("#signOutButton")?.click();}
 },true);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.classList.contains("hidden"))hide();});
 refresh();
})();