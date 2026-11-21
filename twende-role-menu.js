/* TWENDE role menu controller: reliable portal sign-in for desktop and Android WebView. */
(()=>{
 const $=s=>document.querySelector(s);
 const overlay=$("#twendeRoleMenu"),options=$("#twendeRoleOptions");
 if(!overlay||!options){console.error("TWENDE role menu markup missing");return;}
 const show=()=>{overlay.classList.remove("hidden");overlay.setAttribute("aria-hidden","false");document.body.classList.add("twende-role-menu-open");};
 const hide=()=>{overlay.classList.add("hidden");overlay.setAttribute("aria-hidden","true");document.body.classList.remove("twende-role-menu-open");};
 function add(label,description,portal,icon){
  const b=document.createElement("button");b.type="button";b.className="twende-role-option";b.dataset.portal=portal;
  const symbol=document.createElement("span");symbol.textContent=icon;
  const copy=document.createElement("span"),strong=document.createElement("b"),small=document.createElement("small");
  strong.textContent=label;small.textContent=description;copy.append(strong,small);
  const arrow=document.createElement("i");arrow.textContent="›";b.append(symbol,copy,arrow);options.append(b);
 }
 function refresh(){
  options.replaceChildren();
  const snap=window.twendeRoleSnapshot||{role:"rider",guest:true,signedIn:false};
  $("#twendeRoleMenuIntro").textContent=snap.guest?"Passenger access is ready. Partner portals require an approved account.":"Choose an authorised TWENDE portal.";
  if(snap.guest){
   add("Driver portal","Sign in with an approved driver account","driver","🚗");
   add("Vehicle owner portal","Sign in with an approved owner account","owner","🔑");
   add("Administrator portal","Restricted to authorised administrators","admin","🛡️");
   $("#twendeRoleSignOut")?.classList.add("hidden");
  }else{
   if(snap.admin)add("Administrator portal","Manage the TWENDE system","admin","🛡️");
   if(snap.role==="driver"||snap.hasDriverRegistration)add("Driver portal","View and accept assigned ride requests","driver","🚗");
   if(snap.role==="owner"||snap.hasOwnerAccess)add("Vehicle owner portal","Manage fleet, drivers and income","owner","🔑");
   if(!options.children.length){const p=document.createElement("p");p.className="muted";p.textContent="This account currently has passenger access only.";options.append(p);}
   $("#twendeRoleSignOut")?.classList.remove("hidden");
  }
 }
 function choose(portal){
  window.twendeRequestedPortal=portal;
  const snap=window.twendeRoleSnapshot||{};
  const allowed=portal==="admin"?snap.admin===true:portal==="driver"?(snap.role==="driver"||snap.hasDriverRegistration):portal==="owner"?(snap.role==="owner"||snap.hasOwnerAccess):false;
  hide();
  if(allowed){
   const target=portal==="admin"?"#adminPanel":portal==="driver"?"#driver-panel":"#dashboard";
   $(target)?.scrollIntoView({behavior:"smooth",block:"start"});return;
  }
  const dlg=$("#authDialog"),login=$("#loginForm"),register=$("#registerForm");
  if(!dlg||!login){console.error("TWENDE sign-in dialog is missing");return;}
  login.classList.remove("hidden");register?.classList.add("hidden");
  const title=login.querySelector("h2");
  if(title)title.textContent=portal==="admin"?"Administrator sign in":portal==="owner"?"Vehicle owner sign in":"Driver sign in";
  const roleField=$("#registerRole");
  if(roleField&&(portal==="driver"||portal==="owner"))roleField.value=portal;
  // Open after the role sheet has been removed from the screen. This avoids
  // WebView timing issues when switching from a custom overlay to <dialog>.
  requestAnimationFrame(()=>{
   try{if(!dlg.open)dlg.showModal();}
   catch(err){console.warn("Native sign-in dialog unavailable; using visible fallback.",err);dlg.setAttribute("open","");dlg.style.display="block";}
   if(!dlg.open&&!dlg.hasAttribute("open")){dlg.setAttribute("open","");dlg.style.display="block";}
  });
 }
 options.addEventListener("click",e=>{
  const button=e.target.closest("button[data-portal]");if(!button)return;
  e.preventDefault();e.stopPropagation();choose(button.dataset.portal);
 },true);
 window.twendeShowRoleMenu=()=>{refresh();show();};
 window.twendeRefreshRoleMenu=refresh;
 document.addEventListener("click",e=>{
  if(e.target.closest("#menuBtn")){e.preventDefault();e.stopPropagation();window.twendeShowRoleMenu();return;}
  if(e.target.closest("#twendeRoleMenuClose")||e.target===overlay){hide();return;}
  if(e.target.closest("#twendeRolePassenger")){hide();window.twendeShowPassengerHub?.("profile");return;}
  if(e.target.closest("#twendeRoleSignOut")){hide();$("#signOutButton")?.click();}
 },true);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.classList.contains("hidden"))hide();});
 refresh();
})();