/* TWENDE vehicle-owner fleet management UI. */
(()=> {
 const db=window.twendeDb;if(!db)return;
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const money=n=>"K"+Number(n||0).toLocaleString("en-ZM",{maximumFractionDigits:2});
 const toast=m=>{if(typeof window.twendeToast==="function")window.twendeToast(m);else if(typeof window.toast==="function")window.toast(m);else alert(m);};
 async function renderOwnerFleet(){
  const host=document.getElementById("dashboardContent"),snap=window.twendeRoleSnapshot;
  if(!host||!snap?.signedIn||snap.guest||snap.activePortal!=="owner"||!snap.hasOwnerAccess)return;
  // This renderer can be reached from both the dashboard refresh and window load.
  // Replace the previous section instead of appending another copy each time.
  document.getElementById("twendeOwnerFleet")?.remove();
  let {data:items,error}=await db.rpc("twende_owner_fleet_summary");
  const section=document.createElement("section");section.id="twendeOwnerFleet";section.className="twende-owner-fleet";
  if(error){
   section.innerHTML='<h3>Fleet management</h3><p class="muted">Apply the TWENDE owner fleet migration in Supabase to enable fleet management. Details: '+esc(error.message)+'</p>';
   document.getElementById("twendeOwnerFleet")?.remove();
   host.appendChild(section);return;
  }
  items=items||[];
  const {data:financeRows,error:financeError}=await db.rpc("twende_owner_finance_summary");
  const finance=financeRows?.[0]||{};
  const ids=items.map(x=>x.vehicle_id);
  let todayTrips=[];
  if(ids.length){
   const start=new Date();start.setHours(0,0,0,0);
   const {data}=await db.from("ride_requests").select("driver_vehicle_id,estimated_fare,status,completed_at").in("driver_vehicle_id",ids).eq("status","completed").gte("completed_at",start.toISOString());
   todayTrips=data||[];
  }
  const dailyValue=todayTrips.reduce((n,x)=>n+Number(x.estimated_fare||0),0);
  const allValue=items.reduce((n,x)=>n+Number(x.completed_value||0),0);
  const trips=items.reduce((n,x)=>n+Number(x.completed_trips||0),0);
  section.innerHTML=
   '<div class="owner-metrics"><article class="metric-card"><span>Fleet vehicles</span><strong>'+items.length+'</strong></article><article class="metric-card"><span>Completed trips</span><strong>'+Number(finance.completed_trips||0)+'</strong></article><article class="metric-card"><span>Gross fares today</span><strong>'+money(finance.today_gross)+'</strong></article><article class="metric-card"><span>TWENDE commission today (15%)</span><strong>'+money(finance.today_commission)+'</strong></article><article class="metric-card"><span>Owner entitlement today (85%)</span><strong>'+money(finance.today_owner_entitlement)+'</strong></article><article class="metric-card"><span>Gross fares this month</span><strong>'+money(finance.month_gross)+'</strong></article><article class="metric-card"><span>TWENDE commission this month (15%)</span><strong>'+money(finance.month_commission)+'</strong></article><article class="metric-card"><span>Owner entitlement this month (85%)</span><strong>'+money(finance.month_owner_entitlement)+'</strong></article><article class="metric-card"><span>Lifetime gross fares</span><strong>'+money(finance.gross_fares)+'</strong></article><article class="metric-card"><span>TWENDE commission to remit (15%)</span><strong>'+money(finance.twende_commission)+'</strong><small>Based on completed trips</small></article><article class="metric-card"><span>Owner entitlement (85%)</span><strong>'+money(finance.owner_entitlement)+'</strong><small>Before any separate driver agreement</small></article></div>'+(financeError?'<p class="muted">Finance summary unavailable: '+esc(financeError.message)+'</p>':'')+
   '<h3>Register a car or motorcycle taxi</h3><form id="twendeOwnerVehicleForm" class="dash-card"><label>Taxi type<select name="type" required><option value="car">Car taxi</option><option value="motorcycle">Motorcycle taxi</option></select></label><label>Make<input name="make" required placeholder="e.g. Toyota or Honda"></label><label>Model<input name="model" required placeholder="e.g. Corolla or Boxer"></label><label>Registration number<input name="plate" required></label><label>Vehicle colour<select name="color" required><option value="">Select colour</option><option value="Black">Black</option><option value="White">White</option><option value="Silver">Silver</option><option value="Grey">Grey</option><option value="Blue">Blue</option><option value="Red">Red</option><option value="Green">Green</option><option value="Yellow">Yellow</option><option value="Brown">Brown</option><option value="Other">Other</option></select></label><label>Main vehicle photo (required)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label><label>Additional vehicle photo (optional)<input name="photo2" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted">Use clear photos showing the actual vehicle. Maximum 5 MB per photo.</p><label>Operating area<input name="area" required placeholder="e.g. Mufumbwe"></label><button class="btn btn-red" type="submit">Submit vehicle for approval</button></form>'+
   '<h3>Your fleet and assigned drivers</h3><div class="dash-grid">'+(items.map(v=>{
    const driver=v.driver_user_id===window.currentTwendeUser?.id?"Not assigned":(v.driver_name||"Assigned driver");
    const gps=v.last_latitude!=null&&v.last_longitude!=null?'<p>Last GPS: '+Number(v.last_latitude).toFixed(5)+', '+Number(v.last_longitude).toFixed(5)+' • '+esc(v.location_updated_at||"")+'</p>':'<p class="muted">No driver GPS update received yet.</p>';
    return '<article class="dash-card">'+(v.vehicle_photo_url?'<img class="twende-fleet-photo" src="'+esc(v.vehicle_photo_url)+'" alt="'+esc(v.vehicle_color||'')+' '+esc(v.vehicle_make)+' '+esc(v.vehicle_model)+'" loading="lazy">':'')+'<h3>'+esc(v.vehicle_make)+' '+esc(v.vehicle_model)+' • '+(v.vehicle_type==="car"?"Car taxi":"Motorcycle taxi")+'</h3><p>Registration: <strong>'+esc(v.plate_number)+'</strong> • Colour: <strong>'+esc(v.vehicle_color||"Not recorded")+'</strong> • '+esc(v.operating_area)+'</p><button type="button" class="btn btn-outline" data-edit-visuals="'+v.vehicle_id+'">Edit vehicle photo / colour</button><form class="twendeEditVehicleVisuals dash-card" data-edit-visual-form="'+v.vehicle_id+'" hidden><h4>Update vehicle identification</h4><label>Vehicle colour<select name="color" required><option value="">Select colour</option>'+["Black","White","Silver","Grey","Blue","Red","Green","Yellow","Brown","Other"].map(color=>'<option value="'+color+'" '+(v.vehicle_color===color?'selected':'')+'>'+color+'</option>').join("")+'</select></label><label>Replace main vehicle photo (optional)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Replace additional photo (optional)<input name="photo2" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted">Leave photo fields empty to keep existing photos. Maximum 5 MB per photo.</p><button class="btn btn-red" type="submit">Save vehicle updates</button><button class="btn btn-outline" type="button" data-cancel-edit="'+v.vehicle_id+'">Cancel</button></form><p>Approval: <strong>'+esc(v.approval_status)+'</strong> • Availability: <strong>'+(v.is_online?"Online":"Offline")+'</strong></p><p>Driver: <strong>'+esc(driver)+'</strong> '+(v.driver_user_id!==window.currentTwendeUser?.id?'• '+esc(v.driver_phone||""):"")+'</p>'+gps+'<p>Completed trips: '+Number(v.completed_trips||0)+' • Trip value: <strong>'+money(v.completed_value)+'</strong></p>'+(v.approval_status==="approved"?(v.driver_user_id===window.currentTwendeUser?.id?'<form class="twendeAssignDriver" data-vehicle="'+v.vehicle_id+'"><label>Approved driver account email<input type="email" name="email" required placeholder="driver@example.com"></label><label>Driver licence number<input type="text" name="driverLicence" required autocomplete="off" placeholder="Enter licence number"></label><label>National Registration Card (NRC) number<input type="text" name="driverNrc" required autocomplete="off" placeholder="Enter NRC number"></label><p class="muted">Driver licence and NRC details are collected securely at assignment, not during vehicle registration.</p><button class="btn btn-red" type="submit">Assign driver</button></form>':'<button class="btn btn-outline" data-unassign="'+v.vehicle_id+'">Dismiss / unassign driver</button>'):'<p class="muted">Vehicle must be approved by TWENDE before a driver can be assigned.</p>')+'</article>';
   }).join("")||'<p class="muted">No fleet vehicles registered yet.</p>')+'</div>'+
   '<p class="muted">GPS tracking is shown when the assigned driver app sends location updates. It is not continuous when the driver app is closed.</p>';
  // Re-check immediately before insertion to prevent overlapping refreshes from duplicating the section.
  document.getElementById("twendeOwnerFleet")?.remove();
  host.appendChild(section);
  section.addEventListener("submit",async e=>{
   if(e.target.matches(".twendeEditVehicleVisuals")){
    e.preventDefault();const form=e.target,button=e.submitter;button.disabled=true;
    const vehicleId=form.dataset.editVisualForm;
    const upload=async(file,suffix)=>{
      if(!file)return null;
      if(file.size>5*1024*1024)throw new Error("Each vehicle photo must be 5 MB or smaller.");
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=window.currentTwendeUser.id+"/"+vehicleId+"/"+suffix+"."+ext;
      const {error:upErr}=await db.storage.from("twende-vehicle-photos").upload(path,file,{upsert:true,contentType:file.type});
      if(upErr)throw upErr;
      return db.storage.from("twende-vehicle-photos").getPublicUrl(path).data.publicUrl;
    };
    try{
      const current=items.find(x=>String(x.vehicle_id)===String(vehicleId));
      const primary=form.elements.photo.files[0]?await upload(form.elements.photo.files[0],"main"):(current?.vehicle_photo_url||null);
      const secondary=form.elements.photo2.files[0]?await upload(form.elements.photo2.files[0],"alternate"):(current?.vehicle_photo_url_secondary||null);
      const {error}=await db.rpc("twende_owner_update_vehicle_visuals",{p_vehicle_id:vehicleId,p_vehicle_color:form.elements.color.value,p_photo_url:primary,p_photo_url_secondary:secondary});
      if(error)throw error;
      toast("Vehicle photo and colour updated successfully.");await renderOwnerFleet();
    }catch(err){button.disabled=false;toast("Vehicle update failed: "+(err.message||err));}
    return;
   }
   if(e.target.id==="twendeOwnerVehicleForm"){
    e.preventDefault();const f=e.target,b=e.submitter;b.disabled=true;
    const val=n=>f.elements[n].value.trim();
    const {data:vehicleId,error}=await db.rpc("twende_owner_add_vehicle",{p_vehicle_type:val("type"),p_make:val("make"),p_model:val("model"),p_plate:val("plate"),p_licence:val("plate"),p_area:val("area")});
    if(error){b.disabled=false;toast("Vehicle registration failed: "+error.message);return;}
    const photo=f.elements.photo.files[0],photo2=f.elements.photo2.files[0];
    if(!photo){b.disabled=false;toast("Please select the main vehicle photo.");return;}
    const upload=async(file,suffix)=>{
      if(!file)return null;
      if(file.size>5*1024*1024)throw new Error("Each vehicle photo must be 5 MB or smaller.");
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=window.currentTwendeUser.id+"/"+vehicleId+"/"+suffix+"."+ext;
      const {error:upErr}=await db.storage.from("twende-vehicle-photos").upload(path,file,{upsert:true,contentType:file.type});
      if(upErr)throw upErr;
      return db.storage.from("twende-vehicle-photos").getPublicUrl(path).data.publicUrl;
    };
    try{
      const primary=await upload(photo,"main"),secondary=await upload(photo2,"alternate");
      const {error:visualError}=await db.rpc("twende_owner_update_vehicle_visuals",{p_vehicle_id:vehicleId,p_vehicle_color:val("color"),p_photo_url:primary,p_photo_url_secondary:secondary});
      if(visualError)throw visualError;
    }catch(uploadError){b.disabled=false;toast("Vehicle was registered, but photo details were not saved: "+uploadError.message+". You can retry after checking the storage setup.");await renderOwnerFleet();return;}
    b.disabled=false;toast("Vehicle and identification photos submitted for administrator approval.");await renderOwnerFleet();return;
   }
   if(e.target.matches(".twendeAssignDriver")){
    e.preventDefault();const f=e.target,b=e.submitter;b.disabled=true;
    const {error}=await db.rpc("twende_owner_assign_driver_with_licence",{p_vehicle_id:f.dataset.vehicle,p_driver_email:f.elements.email.value.trim(),p_driver_licence:f.elements.driverLicence.value.trim(),p_driver_nrc:f.elements.driverNrc.value.trim()});
    b.disabled=false;if(error){toast("Driver assignment failed: "+error.message);return;}
    toast("Driver assigned successfully.");await renderOwnerFleet();
   }
  });
  section.addEventListener("click",async e=>{
   const edit=e.target.closest("[data-edit-visuals]");
   if(edit){const form=section.querySelector('[data-edit-visual-form="'+edit.dataset.editVisuals+'"]');if(form)form.hidden=!form.hidden;return;}
   const cancel=e.target.closest("[data-cancel-edit]");
   if(cancel){const form=section.querySelector('[data-edit-visual-form="'+cancel.dataset.cancelEdit+'"]');if(form)form.hidden=true;return;}
   const b=e.target.closest("[data-unassign]");if(!b)return;
   if(!confirm("Dismiss this driver and take the vehicle offline?"))return;
   b.disabled=true;const {error}=await db.rpc("twende_owner_unassign_driver",{p_vehicle_id:b.dataset.unassign});
   if(error){b.disabled=false;toast("Could not dismiss driver: "+error.message);return;}
   toast("Driver dismissed. Vehicle is now unassigned and offline.");await renderOwnerFleet();
  });
 }
 const original=window.loadDashboard;
 if(typeof original==="function")window.loadDashboard=async function(){await original();await renderOwnerFleet();};
 const originalDriver=window.loadDriverDashboard;
 if(typeof originalDriver==="function")window.loadDriverDashboard=async function(){
  await originalDriver();
  const snap=window.twendeRoleSnapshot;
  if(!snap?.signedIn||snap.guest||!navigator.geolocation||window.twendeOwnerGpsWatch)return;
  const {data:assigned}=await db.from("driver_vehicles").select("id").not("owner_id","is",null).eq("user_id",window.currentTwendeUser.id).eq("approval_status","approved");
  if(!assigned?.length)return;
  window.twendeOwnerGpsWatch=navigator.geolocation.watchPosition(async pos=>{
   for(const v of assigned){
    const {error}=await db.rpc("twende_owner_update_vehicle_location",{p_vehicle_id:v.id,p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude});
    if(error)console.warn("TWENDE fleet GPS update:",error.message);
   }
  },err=>console.info("TWENDE fleet GPS unavailable:",err.message),{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
 };
 window.addEventListener("load",()=>setTimeout(renderOwnerFleet,900));
 window.twendeRefreshOwnerFleet=renderOwnerFleet;
})();