/* TWENDE partner onboarding panel. Keeps the existing passenger and marketplace flows intact. */
(()=> {
 const db=window.twendeDb;
 if(!db)return;
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const toast=m=>{if(typeof window.twendeToast==="function")window.twendeToast(m);else{const t=document.getElementById("toast");if(t){t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),4500);}}};
 async function renderDriverApplication(){
  const host=document.getElementById("driverDashboard");
  if(!host||!window.twendeRoleSnapshot?.signedIn||window.twendeRoleSnapshot.guest)return;
  if(host.querySelector("#twendeDriverApplicationStatus"))return;
  const {data,error}=await db.rpc("twende_submit_partner_application",{p_partner_type:"driver",p_vehicle_types:[]});
  const {data:access, error:accessError}=await db.rpc("twende_get_partner_access");
  const item=(access||[]).find(x=>x.partner_type==="driver");
  const panel=document.createElement("section");panel.id="twendeDriverApplicationStatus";panel.className="dash-card";
  if(error||accessError){
   panel.innerHTML='<h3>Driver partner application</h3><p class="muted">Partner registration setup is pending. Ask the Primary Administrator to apply the partner lifecycle database migration.</p>';
  }else{
   panel.innerHTML='<h3>Driver partner account</h3><p>Application status: <strong>'+esc(item?.application_status||"pending")+'</strong> • Account status: <strong>'+esc(item?.account_status||"pending")+'</strong></p><p class="muted">Vehicle approval and driver partner account approval are both required before operating. Contact TWENDE support if your details need correction.</p>';
  }
  host.appendChild(panel);
 }
 async function renderOwnerApplication(){
  const host=document.getElementById("dashboardContent");
  if(!host||window.twendeRoleSnapshot?.role!=="owner"||window.twendeRoleSnapshot?.guest)return;
  if(host.querySelector("#twendeOwnerTaxiApplication"))return;
  const {data:access,error}=await db.rpc("twende_get_partner_access");
  const item=(access||[]).find(x=>x.partner_type==="vehicle_owner");
  const panel=document.createElement("section");panel.id="twendeOwnerTaxiApplication";panel.className="dash-card";
  if(error){
   panel.innerHTML='<h3>TWENDE taxi vehicle-owner registration</h3><p class="muted">Partner registration setup is pending. The database migration must be applied before submitting an application.</p>';
  }else if(item){
   panel.innerHTML='<h3>TWENDE taxi vehicle-owner application</h3><p>Vehicle categories: '+esc((item.vehicle_types||[]).join(", "))+'</p><p>Application: <strong>'+esc(item.application_status)+'</strong> • Account: <strong>'+esc(item.account_status)+'</strong></p><p class="muted">After approval, the fleet registration and driver-assignment tools will be made available in this portal.</p>';
  }else{
   panel.innerHTML='<h3>Register as a TWENDE taxi vehicle owner</h3><p class="muted">Apply to operate car taxis, motorcycle taxis or both. Your account will remain pending until an administrator reviews it.</p><form id="twendeOwnerTaxiApplicationForm"><label><input type="checkbox" name="ownerVehicleType" value="car"> Car taxi</label><label><input type="checkbox" name="ownerVehicleType" value="motorcycle"> Motorcycle taxi</label><button class="btn btn-red" type="submit">Submit owner application</button></form>';
   panel.addEventListener("submit",async e=>{
    if(e.target.id!=="twendeOwnerTaxiApplicationForm")return;
    e.preventDefault();
    const types=[...e.target.querySelectorAll('input[name="ownerVehicleType"]:checked')].map(x=>x.value);
    if(!types.length){toast("Select car taxi, motorcycle taxi or both.");return;}
    const b=e.submitter;b.disabled=true;
    const {error}=await db.rpc("twende_submit_partner_application",{p_partner_type:"vehicle_owner",p_vehicle_types:types});
    b.disabled=false;
    if(error){toast("Owner application failed: "+error.message);return;}
    toast("Vehicle-owner application submitted for review.");
    panel.remove();await renderOwnerApplication();
   });
  }
  host.appendChild(panel);
 }
 const originalDriver=window.loadDriverDashboard;
 if(typeof originalDriver==="function"){
  window.loadDriverDashboard=async function(){await originalDriver();await renderDriverApplication();};
 }
 const originalDashboard=window.loadDashboard;
 if(typeof originalDashboard==="function"){
  window.loadDashboard=async function(){await originalDashboard();await renderOwnerApplication();};
 }
 window.addEventListener("load",()=>setTimeout(()=>{
  if(window.twendeRoleSnapshot?.role==="driver")renderDriverApplication();
  if(window.twendeRoleSnapshot?.role==="owner")renderOwnerApplication();
 },500));
})();