/* TWENDE optional owner-driver agreement portal.
   Driver remuneration is private to the owner and driver. This module never
   changes TWENDE's 15% commission or the vehicle owner's 85% entitlement. */
(()=> {
 const db=window.twendeDb;if(!db)return;
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const money=n=>"K"+Number(n||0).toLocaleString("en-ZM",{maximumFractionDigits:2});
 const toast=m=>{if(typeof window.twendeToast==="function")window.twendeToast(m);else if(typeof window.toast==="function")window.toast(m);};
 const typeLabel=t=>({fixed_daily:"Fixed daily payment",fixed_monthly:"Fixed monthly payment",percentage_owner_share:"Percentage of owner's 85% share",other:"Other arrangement"}[t]||t);
 const valueLabel=a=>a.compensation_type==="percentage_owner_share"?Number(a.compensation_percentage||0)+"% of owner share":a.compensation_amount!=null?money(a.compensation_amount)+(a.compensation_type==="fixed_daily"?" per day":a.compensation_type==="fixed_monthly"?" per month":""):"As described in terms";
 const vehicleLabel=v=>[v.vehicle_make,v.vehicle_model].filter(Boolean).join(" ")+" • "+(v.plate_number||"No registration");
 const statusLabel=s=>({proposed:"Awaiting driver response",active:"Active",rejected:"Rejected",terminated:"Ended"}[s]||s);
 const styles='<style id="twendeAgreementStyles">.twende-agreements{margin-top:20px}.twende-agreements .agreement-card{border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:12px 0;background:#fff}.twende-agreements .agreement-form{display:grid;gap:10px}.twende-agreements label{display:grid;gap:5px;font-weight:600}.twende-agreements input,.twende-agreements select,.twende-agreements textarea{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px}.twende-agreements .agreement-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.twende-agreements .agreement-note{background:#fff8db;border-radius:10px;padding:12px;color:#594500}.twende-agreements .agreement-actions{display:flex;gap:8px;flex-wrap:wrap}</style>';
 if(!document.getElementById("twendeAgreementStyles"))document.head.insertAdjacentHTML("beforeend",styles);
 const statusPill=s=>'<span style="display:inline-block;padding:4px 9px;border-radius:20px;background:'+(s==="active"?"#e8f5e9":s==="proposed"?"#fff4d6":s==="rejected"?"#fdecec":"#eef2f7")+'">'+esc(statusLabel(s))+'</span>';
 async function getAgreements(){
  const {data,error}=await db.from("twende_owner_driver_agreements").select("id,vehicle_id,owner_id,driver_id,compensation_type,compensation_amount,compensation_percentage,terms,status,proposed_at,effective_from,effective_to,vehicle:driver_vehicles(vehicle_make,vehicle_model,plate_number)").order("created_at",{ascending:false}).limit(100);
  if(error)throw error;return data||[];
 }
 async function renderOwner(){
  const snap=window.twendeRoleSnapshot,host=document.getElementById("dashboardContent");
  if(!host||!snap?.signedIn||snap.guest||snap.activePortal!=="owner"||!snap.hasOwnerAccess)return;
  document.getElementById("twendeOwnerDriverAgreements")?.remove();
  const section=document.createElement("section");section.id="twendeOwnerDriverAgreements";section.className="twende-agreements";
  section.innerHTML='<h3>Driver payment agreements</h3><p class="agreement-note"><strong>Important:</strong> TWENDE keeps 15% of each completed fare. The vehicle owner is entitled to the remaining 85%. Any driver payment is a separate private agreement between you and your assigned driver; it is not automatically deducted or paid by TWENDE.</p><div id="twendeOwnerAgreementForms"><p class="muted">Loading your assigned vehicles…</p></div><h4>Agreement history</h4><div id="twendeOwnerAgreementList"><p class="muted">Loading agreements…</p></div>';
  host.appendChild(section);
  try{
   const {data:vehicles,error}=await db.rpc("twende_owner_fleet_summary");if(error)throw error;
   const assigned=(vehicles||[]).filter(v=>v.approval_status==="approved"&&v.driver_user_id&&v.driver_user_id!==window.currentTwendeUser?.id);
   const formHost=section.querySelector("#twendeOwnerAgreementForms");
   formHost.innerHTML=assigned.length?assigned.map(v=>'<form class="agreement-card agreement-form twendeOwnerAgreementForm" data-vehicle="'+esc(v.vehicle_id)+'"><strong>'+esc(vehicleLabel(v))+'</strong><p class="muted">Assigned driver: '+esc(v.driver_name||"Approved driver")+'</p><div class="agreement-grid"><label>Payment arrangement<select name="kind" required><option value="fixed_daily">Fixed daily payment</option><option value="fixed_monthly">Fixed monthly payment</option><option value="percentage_owner_share">Percentage of owner share</option><option value="other">Other arrangement</option></select></label><label class="agreementAmount">Agreed amount (K)<input name="amount" type="number" min="0.01" step="0.01" placeholder="e.g. 150"></label><label class="agreementPercentage" hidden>Percentage of owner share (%)<input name="percentage" type="number" min="0" max="100" step="0.01" placeholder="e.g. 40"></label><label>Effective from<input name="from" type="date" required value="'+new Date().toISOString().slice(0,10)+'"></label><label>Effective to (optional)<input name="to" type="date"></label></div><label>Terms / additional details<textarea name="terms" rows="2" placeholder="Payment timing, duties, fuel responsibilities or other agreed conditions"></textarea></label><button class="btn btn-red" type="submit">Send agreement proposal to driver</button></form>').join(""):'<p class="muted">No approved vehicles with an assigned driver are available for an agreement. Approve the vehicle and assign a driver first.</p>';
   formHost.querySelectorAll('select[name="kind"]').forEach(sel=>sel.addEventListener("change",()=>{const f=sel.closest("form"),pct=sel.value==="percentage_owner_share",other=sel.value==="other";f.querySelector(".agreementAmount").hidden=pct||other;f.querySelector(".agreementPercentage").hidden=!pct;f.elements.amount.required=!pct&&!other;f.elements.percentage.required=pct;}));
   const rows=await getAgreements();
   const list=section.querySelector("#twendeOwnerAgreementList");
   list.innerHTML=rows.map(a=>'<article class="agreement-card"><div class="agreement-actions"><strong>'+esc(vehicleLabel(a.vehicle||{}))+'</strong>'+statusPill(a.status)+'</div><p>'+esc(typeLabel(a.compensation_type))+' • <strong>'+esc(valueLabel(a))+'</strong></p><p class="muted">Effective: '+esc(a.effective_from||"Not set")+(a.effective_to?" to "+esc(a.effective_to):"")+'</p>'+(a.terms?'<p>'+esc(a.terms)+'</p>':"")+(a.status==="active"?'<button class="btn btn-outline" data-terminate-agreement="'+esc(a.id)+'">End agreement</button>':"")+'</article>').join("")||'<p class="muted">No driver payment agreements have been proposed yet.</p>';
  }catch(e){section.querySelector("#twendeOwnerAgreementForms").innerHTML='<p class="muted">Could not load agreement tools: '+esc(e.message)+'</p>';}
  section.addEventListener("submit",async e=>{
   const f=e.target;if(!f.matches(".twendeOwnerAgreementForm"))return;e.preventDefault();
   const b=e.submitter;b.disabled=true;const kind=f.elements.kind.value;
   const {error}=await db.rpc("twende_owner_propose_driver_agreement",{p_vehicle_id:f.dataset.vehicle,p_compensation_type:kind,p_compensation_amount:kind==="fixed_daily"||kind==="fixed_monthly"?Number(f.elements.amount.value):null,p_compensation_percentage:kind==="percentage_owner_share"?Number(f.elements.percentage.value):null,p_terms:f.elements.terms.value.trim()||null,p_effective_from:f.elements.from.value,p_effective_to:f.elements.to.value||null});
   b.disabled=false;if(error){toast("Could not send agreement: "+error.message);return;}toast("Agreement proposal sent to the assigned driver.");await renderOwner();
  });
  section.addEventListener("click",async e=>{
   const b=e.target.closest("[data-terminate-agreement]");if(!b)return;
   if(!confirm("End this owner-driver agreement? This will not change TWENDE's commission or owner share."))return;
   b.disabled=true;const {error}=await db.rpc("twende_owner_terminate_driver_agreement",{p_agreement_id:b.dataset.terminateAgreement});
   if(error){b.disabled=false;toast("Could not end agreement: "+error.message);return;}toast("Agreement ended.");await renderOwner();
  });
 }
 async function renderDriver(){
  const snap=window.twendeRoleSnapshot,host=document.getElementById("driverDashboard");
  if(!host||!snap?.signedIn||snap.guest||snap.activePortal!=="driver")return;
  document.getElementById("twendeDriverAgreements")?.remove();
  const section=document.createElement("section");section.id="twendeDriverAgreements";section.className="twende-agreements";
  section.innerHTML='<h3>Owner payment agreements</h3><p class="agreement-note"><strong>Separate arrangement:</strong> TWENDE deducts its 15% commission first. The vehicle owner is entitled to 85%. Your payment is determined only by an agreement you voluntarily accept with the owner; TWENDE does not set or automatically deduct your wage.</p><div id="twendeDriverAgreementList"><p class="muted">Loading proposals…</p></div>';
  host.appendChild(section);
  try{
   const rows=await getAgreements(),list=section.querySelector("#twendeDriverAgreementList");
   list.innerHTML=rows.map(a=>'<article class="agreement-card"><div class="agreement-actions"><strong>'+esc(vehicleLabel(a.vehicle||{}))+'</strong>'+statusPill(a.status)+'</div><p>'+esc(typeLabel(a.compensation_type))+' • <strong>'+esc(valueLabel(a))+'</strong></p><p class="muted">Effective: '+esc(a.effective_from||"Not set")+(a.effective_to?" to "+esc(a.effective_to):"")+'</p>'+(a.terms?'<p>'+esc(a.terms)+'</p>':"")+(a.status==="proposed"?'<div class="agreement-actions"><button class="btn btn-red" data-respond-agreement="'+esc(a.id)+'" data-accept="true">Accept agreement</button><button class="btn btn-outline" data-respond-agreement="'+esc(a.id)+'" data-accept="false">Reject</button></div>':"")+'</article>').join("")||'<p class="muted">You have no owner payment proposals.</p>';
  }catch(e){section.querySelector("#twendeDriverAgreementList").innerHTML='<p class="muted">Could not load agreements: '+esc(e.message)+'</p>';}
  section.addEventListener("click",async e=>{
   const b=e.target.closest("[data-respond-agreement]");if(!b)return;
   const accept=b.dataset.accept==="true";if(!confirm((accept?"Accept":"Reject")+" this owner-driver payment agreement?"))return;
   b.disabled=true;const {error}=await db.rpc("twende_driver_respond_owner_agreement",{p_agreement_id:b.dataset.respondAgreement,p_accept:accept});
   if(error){b.disabled=false;toast("Could not record your response: "+error.message);return;}toast(accept?"Agreement accepted.":"Agreement rejected.");await renderDriver();
  });
 }
 const oldOwner=window.twendeRefreshOwnerFleet;
 if(typeof oldOwner==="function")window.twendeRefreshOwnerFleet=async()=>{await oldOwner();await renderOwner();};
 const oldLoad=window.loadDashboard;
 if(typeof oldLoad==="function")window.loadDashboard=async function(){await oldLoad();await renderOwner();};
 const oldDriver=window.loadDriverDashboard;
 if(typeof oldDriver==="function")window.loadDriverDashboard=async function(){await oldDriver();await renderDriver();};
 window.addEventListener("load",()=>setTimeout(()=>{renderOwner();renderDriver();},1200));
 window.twendeRefreshOwnerDriverAgreements=async()=>{await renderOwner();await renderDriver();};
})();