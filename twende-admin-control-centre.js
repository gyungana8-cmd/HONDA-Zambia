/* TWENDE Control Centre extension.
   Loads after app.js and adds the administrator hierarchy without changing
   passenger booking, driver onboarding, or the approved passenger homepage. */
(function(){
  const db=window.twendeDb;
  if(!db)return;
  const original=window.loadAdminDashboard;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const toast=m=>{if(typeof window.twendeToast==="function")window.twendeToast(m);else{const t=document.getElementById("toast");if(t){t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),4500);}}};
  async function appendAdminControls(){
    const host=document.getElementById("adminContent");
    if(!host||host.querySelector("#twendeAdminHierarchy"))return;
    const {data:isPrimary,error}=await db.rpc("twende_is_primary_admin");
    if(host.querySelector("#twendeAdminHierarchy"))return;
    if(error){host.insertAdjacentHTML("beforeend",'<p class="muted">Administrator hierarchy setup is pending. Run supabase/twende_admin_hierarchy.sql in the Supabase SQL Editor.</p>');return;}
    const {data:admins,listError}=await db.rpc("twende_list_admins");
    const rows=admins||[];
    const panel=document.createElement("section");
    panel.id="twendeAdminHierarchy";
    panel.className="dash-card";
    panel.innerHTML='<h3>Administrator roles</h3><p class="muted">Primary Administrator has every operational permission, plus administrator appointment and oversight. Operations Administrators manage day-to-day TWENDE operations.</p>'+
      '<div class="dash-grid">'+rows.map(a=>'<article class="dash-card"><strong>'+esc(a.email)+'</strong><p>'+ (a.admin_role==="primary"?"Primary Administrator":"Operations Administrator")+'</p>'+(isPrimary&&a.admin_role==="operations"?'<button class="btn btn-outline" data-remove-admin="'+esc(a.user_id)+'">Remove access</button>':"")+'</article>').join("")+'</div>'+
      (isPrimary?'<form id="twendeAddAdminForm" class="dialog-form" style="max-width:560px;margin-top:16px"><label>Appoint Operations Administrator<input id="twendeAdminEmail" type="email" placeholder="registered-account@example.com" required></label><button class="btn btn-red" type="submit">Appoint administrator</button></form>':'<p class="muted">Administrator appointments are reserved for the Primary Administrator.</p>');
    host.appendChild(panel);
    panel.addEventListener("submit",async e=>{
      if(e.target.id!=="twendeAddAdminForm")return;
      e.preventDefault();
      const button=e.target.querySelector("button");button.disabled=true;
      const {error}=await db.rpc("twende_add_operations_admin",{p_email:document.getElementById("twendeAdminEmail").value.trim()});
      button.disabled=false;
      if(error){toast("Could not appoint administrator: "+error.message);return;}
      toast("Operations Administrator appointed.");panel.remove();await appendAdminControls();
    });
    panel.addEventListener("click",async e=>{
      const button=e.target.closest("[data-remove-admin]");if(!button)return;
      if(!confirm("Remove this Operations Administrator's access?"))return;
      button.disabled=true;
      const {error}=await db.rpc("twende_remove_operations_admin",{p_user_id:button.dataset.removeAdmin});
      if(error){button.disabled=false;toast("Could not remove administrator: "+error.message);return;}
      toast("Operations Administrator access removed.");panel.remove();await appendAdminControls();
    });
  }
  if(typeof original==="function"){
    window.loadAdminDashboard=async function(){
      await original();
      const snapshot=window.twendeRoleSnapshot;
      if(snapshot&&snapshot.admin)await appendAdminControls();
    };
  }
  window.addEventListener("load",()=>setTimeout(()=>window.loadAdminDashboard?.(),250));
})();
