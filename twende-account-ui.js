/* TWENDE passenger account and information experience. */
(() => {
  const $ = s => document.querySelector(s);
  const savedKey = "twende_saved_addresses_v1";
  const saved = () => { try { return JSON.parse(localStorage.getItem(savedKey)||"[]"); } catch { return []; } };
  const store = rows => localStorage.setItem(savedKey, JSON.stringify(rows.slice(0,8)));
  const profile = () => {
    try { return {name: window.currentProfile?.full_name || "Passenger", phone: window.currentProfile?.phone || "", email: window.currentUser?.email || "", avatar: window.currentProfile?.avatar_url || window.currentUser?.user_metadata?.avatar_url || ""}; }
    catch { return {name:"Passenger",phone:"",email:"",avatar:""}; }
  };
  const panel = document.createElement("section");
  panel.id="twendeAccountHub"; panel.className="twende-account-hub";
  panel.innerHTML=`
    <div class="twende-account-head"><div><span class="eyebrow">YOUR TWENDE</span><h2 id="twendeHubTitle">Your profile</h2><p class="muted">Manage your rides and personal details.</p></div><button type="button" class="btn btn-outline" id="twendeHubBack">Back to home</button></div>
    <div class="twende-profile-card"><div class="twende-avatar" id="twendeAvatar">T</div><div><h3 id="twendeProfileName">Passenger</h3><p id="twendeProfilePhone" class="muted">Phone number not added</p><small id="twendeProfileEmail"></small></div></div>
    <div class="twende-hub-grid">
      <button type="button" data-hub="orders"><span>▤</span><b>Orders</b><small>View your taxi requests</small></button>
      <button type="button" data-hub="support"><span>♡</span><b>Support</b><small>Help with using TWENDE</small></button>
      <button type="button" data-hub="addresses"><span>⌖</span><b>Addresses</b><small>Save your frequent places</small></button>
      <button type="button" data-hub="settings"><span>⚙</span><b>Settings</b><small>Profile and preferences</small></button>
    </div>
    <div class="twende-hub-content" id="twendeHubContent"></div>
    <div class="twende-info-grid">
      <button type="button" data-info="partners"><b>Partners</b><small>Drive and earn with TWENDE</small></button>
      <button type="button" data-info="classes"><b>Service Classes</b><small>Cars and motorcycle taxis</small></button>
      <button type="button" data-info="about"><b>About</b><small>About TWENDE Zambia</small></button>
    </div>`;
  const main = $("main"); if(main) main.append(panel);
  const nav=$("nav");
  if(nav){
    const link=document.createElement("a");link.href="#twendeAccountHub";link.id="twendeProfileNav";link.textContent="Profile";nav.append(link);
  }
  const menu=$(".topbar");
  if(menu){
    const button=document.createElement("button");button.type="button";button.className="btn btn-outline twende-profile-button";button.id="twendeProfileButton";button.textContent="My profile";menu.insertBefore(button,$("#accountStatus"));
  }
  const showHub = section => {
    panel.classList.add("is-active");
    document.body.classList.add("twende-hub-open");
    const t=$("#twendeHubTitle"); t.textContent=section==="orders"?"Your orders":section==="addresses"?"Saved addresses":section==="settings"?"Settings":section==="support"?"Support":"Your profile";
    renderProfile(); renderContent(section||"profile"); panel.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const hideHub=()=>{panel.classList.remove("is-active");document.body.classList.remove("twende-hub-open");$("#ride-services")?.scrollIntoView({behavior:"smooth",block:"start"});};
  function renderProfile(){
    const p=profile();$("#twendeProfileName").textContent=p.name;$("#twendeProfilePhone").textContent=p.phone||"Phone number not added";$("#twendeProfileEmail").textContent=p.email;
    const a=$("#twendeAvatar");a.textContent=(p.name.trim()[0]||"T").toUpperCase();if(p.avatar){a.innerHTML='<img alt="Profile photo" src="'+p.avatar.replace(/"/g,"&quot;")+'">';}
  }
  function renderContent(section){
    const host=$("#twendeHubContent"),addresses=saved();
    if(section==="orders"){host.innerHTML='<h3>Recent taxi orders</h3><p class="muted">Your latest passenger requests are shown below.</p><div id="twendeOrdersMount"></div>';const source=$("#passengerRides");if(source)$("#twendeOrdersMount").innerHTML=source.innerHTML;else $("#twendeOrdersMount").textContent="Sign in or request a ride to see your orders.";return;}
    if(section==="addresses"){host.innerHTML='<h3>Saved addresses</h3><p class="muted">Save home, work or another frequent pickup point on this device.</p><form id="twendeSaveAddress" class="twende-save-address"><input id="twendeAddressName" placeholder="Name, e.g. Home" required><input id="twendeAddressValue" placeholder="Full address or landmark" required><button class="btn btn-red" type="submit">Save address</button></form><div class="twende-address-list">'+(addresses.map((x,i)=>'<article><div><b>'+esc(x.name)+'</b><small>'+esc(x.value)+'</small></div><button type="button" data-delete-address="'+i+'" aria-label="Delete '+esc(x.name)+'">Remove</button></article>').join("")||'<p class="muted">No saved addresses yet.</p>')+'</div>';
      $("#twendeSaveAddress").onsubmit=e=>{e.preventDefault();const rows=saved();rows.push({name:$("#twendeAddressName").value.trim(),value:$("#twendeAddressValue").value.trim()});store(rows);renderContent("addresses");};
      host.querySelectorAll("[data-delete-address]").forEach(b=>b.onclick=()=>{const rows=saved();rows.splice(Number(b.dataset.deleteAddress),1);store(rows);renderContent("addresses");});return;}
    if(section==="settings"){const p=profile();host.innerHTML='<h3>Profile settings</h3><p class="muted">Your passenger details are used to help drivers identify and contact you.</p><div class="twende-settings-row"><label>Full name<input id="twendeEditName" value="'+esc(p.name)+'" placeholder="Full name"></label><label>Phone number<input id="twendeEditPhone" value="'+esc(p.phone)+'" placeholder="+260…"></label><button type="button" class="btn btn-red" id="twendeSaveProfile">Save details</button></div><p class="muted">Profile editing is stored locally in this app version. Account-level changes require the passenger profile service.</p>';$("#twendeSaveProfile").onclick=()=>{localStorage.setItem("twende_passenger_profile",JSON.stringify({name:$("#twendeEditName").value.trim(),phone:$("#twendeEditPhone").value.trim()}));$("#twendeProfileName").textContent=$("#twendeEditName").value.trim()||"Passenger";$("#twendeProfilePhone").textContent=$("#twendeEditPhone").value.trim()||"Phone number not added";};return;}
    if(section==="support"){host.innerHTML='<h3>How can we help?</h3><div class="twende-faq"><details><summary>How do I request a taxi?</summary><p>Choose a car or motorcycle, set your pickup and destination, then submit your request.</p></details><details><summary>How do I pay?</summary><p>Payment is currently made directly to the driver in cash. Confirm the fare before travelling.</p></details><details><summary>How do I check my booking?</summary><p>Open Orders in your profile to view recent taxi requests and their status.</p></details><details><summary>How do I update a saved place?</summary><p>Open Addresses, remove the old entry and save the corrected address.</p></details></div><p class="muted">If you need direct assistance, use the contact details published by your local TWENDE administrator.</p>';return;}
    host.innerHTML='<h3>Welcome to TWENDE</h3><p class="muted">Your passenger account, bookings and saved places in one place.</p>';
  }
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  $("#twendeProfileButton")?.addEventListener("click",()=>showHub("profile"));
  $("#twendeProfileNav")?.addEventListener("click",e=>{e.preventDefault();showHub("profile");});
  $("#twendeHubBack").onclick=hideHub;
  panel.querySelectorAll("[data-hub]").forEach(b=>b.onclick=()=>showHub(b.dataset.hub));
  panel.querySelectorAll("[data-info]").forEach(b=>b.onclick=()=>{
    const info=b.dataset.info,host=$("#twendeHubContent");
    if(info==="partners")host.innerHTML='<h3>Become a TWENDE partner</h3><p>Vehicle owners and approved drivers can register vehicles, receive requests and serve passengers through TWENDE.</p><button class="btn btn-red" type="button" id="twendePartnerGo">Driver / owner access</button>';
    if(info==="classes")host.innerHTML='<h3>TWENDE service classes</h3><div class="twende-class-row"><b>🚕 Car taxi</b><span>For passengers who prefer a car journey.</span></div><div class="twende-class-row"><b>🏍️ Motorcycle taxi</b><span>For convenient local motorcycle trips.</span></div>';
    if(info==="about")host.innerHTML='<h3>About TWENDE Zambia</h3><p>TWENDE connects passengers with local car and motorcycle taxi drivers and vehicle partners across Zambia.</p><p class="muted">Move with confidence.</p>';
    $("#twendeHubTitle").textContent=b.querySelector("b").textContent;panel.scrollIntoView({behavior:"smooth",block:"start"});
    $("#twendePartnerGo")?.addEventListener("click",()=>{$("#authDialog")?.showModal();});
  });
  $("#twendeHubContent").addEventListener("click",e=>{const btn=e.target.closest("[data-use-address]");if(!btn)return;});
  // Surface passenger tools to both signed-out and passenger sessions; operator dashboards remain unchanged.
  document.body.classList.add("twende-passenger-ui");
  const originalSplash=$("#twendeSplash");if(originalSplash){originalSplash.setAttribute("aria-label","TWENDE Zambia — Move with confidence");}
  // Add saved-place quick select above booking inputs when the booking form is opened.
  const rideForm=$("#rideForm");if(rideForm){
    const quick=document.createElement("div");quick.className="twende-quick-address";quick.innerHTML='<label>Saved place<select id="twendeQuickAddress"><option value="">Choose a saved address…</option></select></label><button type="button" class="btn btn-outline" id="twendeSaveCurrentAddress">Save pickup</button>';
    const pickup=$("#ridePickup")?.parentElement;if(pickup)pickup.after(quick);
    const refresh=()=>{const select=$("#twendeQuickAddress");if(!select)return;select.innerHTML='<option value="">Choose a saved address…</option>'+saved().map((x,i)=>'<option value="'+i+'">'+esc(x.name)+" — "+esc(x.value)+'</option>').join("");};
    refresh();$("#twendeQuickAddress").onchange=()=>{const x=saved()[Number($("#twendeQuickAddress").value)];if(x)$("#ridePickup").value=x.value;};
    $("#twendeSaveCurrentAddress").onclick=()=>{const value=$("#ridePickup").value.trim();if(!value){alert("Enter a pickup address first.");return;}const name=prompt("Name this address, for example Home:");if(!name)return;const rows=saved();rows.push({name,value});store(rows);refresh();};
  }
})();
