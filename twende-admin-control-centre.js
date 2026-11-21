/* TWENDE Control Centre: administrator appointments and partner lifecycle. */
(function(){
  const db=window.twendeDb;
  if(!db)return;
  const original=window.loadAdminDashboard;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const toast=m=>{if(typeof window.twendeToast==="function")window.twendeToast(m);else{const t=document.getElementById("toast");if(t){t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),4500);}}};
  const roles={
    primary:"Primary Administrator",
    operations:"Operations Administrator",
    fleet_manager:"Fleet Manager",
    driver_support:"Driver Support Officer",
    finance:"Finance Officer",
    customer_support:"Customer Support Officer",
    compliance:"Compliance Officer",
    dispatcher:"Ride Dispatcher"
  };
  async function appendAdminControls(){
    const host=document.getElementById("adminContent");
    if(!host||host.querySelector("#twendeAdminHierarchy"))return;
    const [{data:isPrimary,error:primaryError},{data:canReview}] = await Promise.all([
      db.rpc("twende_is_primary_admin"),
      db.rpc("twende_admin_has_permission",{p_permission:"partners.review"})
    ]);
    if(host.querySelector("#twendeAdminHierarchy"))return;
    if(primaryError){host.insertAdjacentHTML("beforeend",'<p class="muted">Administrator roles setup is pending. Apply supabase/twende_admin_specialist_roles.sql in Supabase SQL Editor.</p>');return;}
    let rows=[];
    if(isPrimary){
      const {data,error}=await db.rpc("twende_list_admins");
      if(error){host.insertAdjacentHTML("beforeend",'<p class="muted">Could not load administrator accounts: '+esc(error.message)+'</p>');return;}
      rows=data||[];
    }
    const panel=document.createElement("section");
    panel.id="twendeAdminHierarchy";panel.className="dash-card";
    const roleOptions=Object.entries(roles).filter(([key])=>key!=="primary").map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join("");
    panel.innerHTML='<h3>Administrator roles and access</h3><p class="muted">Each specialist account receives only the permissions assigned to its role. The Primary Administrator retains full access and controls administrator appointments.</p>'+
      (isPrimary?'<div class="dash-grid">'+rows.map(a=>'<article class="dash-card"><strong>'+esc(a.email)+'</strong><p>'+esc(roles[a.admin_role]||a.admin_role)+'</p>'+(a.admin_role!=="primary"?'<button class="btn btn-outline" data-remove-admin="'+esc(a.user_id)+'">Remove administrator access</button>':"")+'</article>').join("")+'</div>'+
      '<form id="twendeAddAdminForm" class="dialog-form" style="max-width:560px;margin-top:16px"><h4>Appoint a specialist administrator</h4><label>Registered account email<input id="twendeAdminEmail" type="email" placeholder="registered-account@example.com" required></label><label>Administrator responsibility<select id="twendeAdminRole" required>'+roleOptions+'</select></label><button class="btn btn-red" type="submit">Appoint administrator</button></form>'
      :'<p class="muted">Your assigned administrator role: <strong>'+esc(roles[window.twendeRoleSnapshot?.adminRole]||"Administrator")+'</strong>. Administrator appointments are reserved for the Primary Administrator.</p>');
    host.appendChild(panel);
    panel.addEventListener("submit",async e=>{
      if(e.target.id!=="twendeAddAdminForm")return;
      e.preventDefault();
      const button=e.target.querySelector("button");button.disabled=true;
      const email=document.getElementById("twendeAdminEmail").value.trim();
      const role=document.getElementById("twendeAdminRole").value;
      const {error}=await db.rpc("twende_add_admin_by_role",{p_email:email,p_role:role});
      button.disabled=false;
      if(error){toast("Could not appoint administrator: "+error.message);return;}
      toast(roles[role]+" appointed.");panel.remove();await appendAdminControls();
    });
    panel.addEventListener("click",async e=>{
      const button=e.target.closest("[data-remove-admin]");if(!button)return;
      if(!confirm("Remove this administrator's access to TWENDE?"))return;
      button.disabled=true;
      const {error}=await db.rpc("twende_remove_operations_admin",{p_user_id:button.dataset.removeAdmin});
      if(error){button.disabled=false;toast("Could not remove administrator: "+error.message);return;}
      toast("Administrator access removed.");panel.remove();await appendAdminControls();
    });
  }
  async function appendPartnerApplications(){
    const host=document.getElementById("adminContent");
    if(!host||host.querySelector("#twendePartnerApplications"))return;
    const {data:allowed,error:permissionError}=await db.rpc("twende_admin_has_permission",{p_permission:"partners.review"});
    if(permissionError||!allowed)return;
    const {data:apps,error}=await db.rpc("twende_admin_list_partner_applications");
    const panel=document.createElement("section");
    panel.id="twendePartnerApplications";panel.className="dash-card";
    if(error){
      panel.innerHTML='<h3>Partner applications and account activation</h3><p class="muted">Partner-review permission or database setup is required: '+esc(error.message)+'</p>';
      host.appendChild(panel);return;
    }
    const rows=apps||[];
    panel.innerHTML='<h3>Partner applications and account activation ('+rows.length+')</h3>'+
      (rows.map(a=>'<article class="dash-card"><h4>'+esc(a.applicant_name)+' • '+(a.partner_type==="driver"?"Driver":"Vehicle owner")+'</h4><p>'+esc(a.email)+' • '+esc(a.phone)+'</p><p>Vehicle categories: '+esc((a.vehicle_types||[]).join(", ")||"Driver application")+'</p><p>Application: <strong>'+esc(a.application_status)+'</strong> • Account: <strong>'+esc(a.account_status)+'</strong></p>'+(a.review_note?'<p>Review note: '+esc(a.review_note)+'</p>':"")+(a.application_status==="pending"?'<div class="dash-actions"><button class="btn btn-red" data-partner-review="approved" data-application-id="'+a.id+'">Approve and activate</button> <button class="btn btn-outline" data-partner-review="rejected" data-application-id="'+a.id+'">Reject</button> <button class="btn btn-outline" data-partner-review="dismissed" data-application-id="'+a.id+'">Dismiss</button></div>':a.account_status==="active"?'<button class="btn btn-outline" data-partner-review="suspended" data-application-id="'+a.id+'">Suspend account</button>':a.account_status==="suspended"?'<button class="btn btn-red" data-partner-review="activated" data-application-id="'+a.id+'">Reactivate account</button>':"")+'</article>').join("")||'<p class="muted">No partner applications have been submitted.</p>');
    panel.addEventListener("click",async e=>{
      const b=e.target.closest("[data-partner-review]");if(!b)return;
      const decision=b.dataset.partnerReview;
      const note=prompt("Optional review note (leave blank if none):")||"";
      if(!confirm("Confirm "+decision+" for this partner account?"))return;
      b.disabled=true;
      const {error}=await db.rpc("twende_admin_review_partner_application",{p_application_id:b.dataset.applicationId,p_decision:decision,p_review_note:note});
      if(error){b.disabled=false;toast("Partner account update failed: "+error.message);return;}
      toast("Partner application/account updated: "+decision+".");panel.remove();await appendPartnerApplications();
    });
    host.appendChild(panel);
  }
  if(typeof original==="function"){
    window.loadAdminDashboard=async function(){
      await original();
      if(window.twendeRoleSnapshot?.admin){await appendAdminControls();await appendPartnerApplications();}
    };
  }
  window.addEventListener("load",()=>setTimeout(()=>window.loadAdminDashboard?.(),250));
})();