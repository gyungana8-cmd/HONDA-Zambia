/* TWENDE Finance Management UI v1. */
(function(){
  const db=window.twendeDb;if(!db)return;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=n=>"K"+Number(n||0).toLocaleString("en-ZM",{minimumFractionDigits:2,maximumFractionDigits:2});
  const toast=m=>{if(typeof window.twendeToast==="function")window.twendeToast(m);else alert(m);};
  const dateInput=d=>{const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");};
  const original=window.loadAdminDashboard;
  async function renderFinance(){
    const host=document.getElementById("adminContent");if(!host)return;
    const {data:allowed,error:pe}=await db.rpc("twende_admin_has_permission",{p_permission:"finance.view"});
    if(pe||!allowed)return;
    // Remove the former estimated-fare-only summary so it cannot be mistaken for accounts.
    [...host.querySelectorAll("h3")].filter(h=>h.textContent.includes("Financial overview")).forEach(h=>{const n=h.nextElementSibling;h.remove();if(n&&n.classList.contains("owner-metrics"))n.remove();});
    const [{data:canReconcile},{data:isPrimary}]=await Promise.all([db.rpc("twende_admin_has_permission",{p_permission:"finance.reconcile"}),db.rpc("twende_is_primary_admin")]);
    const now=new Date(),monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const panel=document.createElement("section");panel.id="twendeFinanceModule";panel.className="dash-card";
    panel.innerHTML='<h3>TWENDE Financial Management</h3><p class="muted">All amounts in Zambian Kwacha (ZMW). Commission is calculated at 15% for both car and motorcycle rides. Trip amounts are recorded from the fare captured when the ride is completed.</p>'+
      '<div class="dash-grid" id="twendeFinanceRates"><article class="dash-card"><h4>Car taxi commission</h4><strong id="twendeCarRate">15%</strong></article><article class="dash-card"><h4>Motorcycle taxi commission</h4><strong id="twendeMotoRate">15%</strong></article></div>'+
      (isPrimary?'<form id="twendeFinanceRateForm" class="dash-card"><h4>Commission settings</h4><label>Service<select name="service_type"><option value="car">Car taxi</option><option value="motorcycle">Motorcycle taxi</option></select></label><label>Commission percentage<input name="rate" type="number" min="0" max="100" step="0.01" value="15" required></label><button class="btn btn-outline" type="submit">Save commission rate</button></form>':"")+
      '<form id="twendeFinanceReportForm" class="dash-card"><h4>Financial report period</h4><label>From<input name="from" type="date" value="'+dateInput(monthStart)+'" required></label><label>To<input name="to" type="date" value="'+dateInput(now)+'" required></label><button class="btn btn-red" type="submit">Generate report</button></form><div id="twendeFinanceReport"><p class="muted">Loading financial report…</p></div>'+
      '<h4>Completed trips and cash reconciliation</h4><div id="twendeFinanceTrips"><p class="muted">Loading trip ledger…</p></div>';
    host.appendChild(panel);
    async function loadRates(){
      const {data,error}=await db.from("twende_finance_settings").select("service_type,commission_rate").order("service_type");
      if(error){toast("Commission settings unavailable: "+error.message);return;}
      (data||[]).forEach(x=>{const el=document.getElementById(x.service_type==="car"?"twendeCarRate":"twendeMotoRate");if(el)el.textContent=(Number(x.commission_rate)*100).toFixed(2).replace(/\.00$/,"")+"%";});
    }
    async function loadReport(from,to){
      const start=new Date(from+"T00:00:00").toISOString(),end=new Date(to+"T00:00:00");end.setDate(end.getDate()+1);
      const {data,error}=await db.rpc("twende_finance_report",{p_from:start,p_to:end.toISOString()});
      const out=document.getElementById("twendeFinanceReport");if(!out)return;
      if(error){out.innerHTML='<p class="muted">Report unavailable: '+esc(error.message)+'</p>';return;}
      const rows=data||[],tot=rows.reduce((a,x)=>{["trip_count","gross_fares","company_commission","owner_share","expected_cash","reported_cash","pending_reconciliation","short_count","over_count"].forEach(k=>a[k]=Number(a[k]||0)+Number(x[k]||0));return a;},{});
      const tr=(x,label)=>'<tr><td>'+label+'</td><td>'+Number(x.trip_count||0)+'</td><td>'+money(x.gross_fares)+'</td><td>'+money(x.company_commission)+'</td><td>'+money(x.driver_earnings)+'</td><td>'+money(x.expected_cash)+'</td><td>'+money(x.reported_cash)+'</td><td>'+Number(x.pending_reconciliation||0)+'</td></tr>';
      out.innerHTML='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Service</th><th>Trips</th><th>Gross fares</th><th>TWENDE commission</th><th>Vehicle owner share</th><th>Expected cash</th><th>Reported cash</th><th>Pending</th></tr></thead><tbody>'+rows.map(x=>tr(x,x.service_type==="car"?"Car taxi":"Motorcycle taxi")).join("")+tr(tot,"TOTAL")+'</tbody></table></div><p class="muted">Short: '+tot.short_count+' • Over: '+tot.over_count+' • Pending: '+tot.pending_reconciliation+'</p><button class="btn btn-outline" id="twendeFinanceCsv">Download report CSV</button>';
      document.getElementById("twendeFinanceCsv")?.addEventListener("click",()=>{
        const csv=[["Service","Trips","Gross fares ZMW","Company commission ZMW","Vehicle owner share ZMW","Expected cash ZMW","Reported cash ZMW","Pending","Short","Over"],...rows.map(x=>[x.service_type,x.trip_count,x.gross_fares,x.company_commission,x.driver_earnings,x.expected_cash,x.reported_cash,x.pending_reconciliation,x.short_count,x.over_count]),["TOTAL",tot.trip_count,tot.gross_fares,tot.company_commission,tot.driver_earnings,tot.expected_cash,tot.reported_cash,tot.pending_reconciliation,tot.short_count,tot.over_count]].map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n");
        const a=document.createElement("a"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.href=url;a.download="TWENDE-financial-report-"+from+"-to-"+to+".csv";a.click();URL.revokeObjectURL(url);
      });
    }
    async function loadTrips(){
      const {data,error}=await db.from("twende_trip_finances").select("ride_id,service_type,driver_id,completed_at,gross_fare,commission_rate,company_commission,driver_earnings,expected_cash,reported_cash,cash_difference,reconciliation_status,reconciliation_note").order("completed_at",{ascending:false}).limit(100);
      const out=document.getElementById("twendeFinanceTrips");if(!out)return;
      if(error){out.innerHTML='<p class="muted">Trip ledger unavailable: '+esc(error.message)+'</p>';return;}
      const rows=data||[];
      out.innerHTML=rows.map(x=>'<article class="dash-card"><strong>'+esc(x.service_type)+" taxi • "+money(x.gross_fare)+'</strong><p class="muted">'+new Date(x.completed_at).toLocaleString("en-ZM")+' • Trip '+esc(x.ride_id.slice(0,8))+'</p><p>TWENDE commission ('+(Number(x.commission_rate)*100).toFixed(2)+'%): <strong>'+money(x.company_commission)+'</strong> • Driver earnings: <strong>'+money(x.driver_earnings)+'</strong></p><p>Expected cash: '+money(x.expected_cash)+' • Reported: '+(x.reported_cash===null?"Not reported":money(x.reported_cash))+' • Status: <strong>'+esc(x.reconciliation_status)+'</strong></p>'+(x.cash_difference===null?"":'<p>Cash difference: '+money(x.cash_difference)+'</p>')+(canReconcile?'<form class="twendeCashReconcile" data-ride="'+esc(x.ride_id)+'"><label>Cash reported by driver (K)<input name="cash" type="number" min="0" step="0.01" value="'+(x.reported_cash===null?"":Number(x.reported_cash).toFixed(2))+'" required></label><label>Result<select name="status"><option value="matched">Matched</option><option value="short">Short</option><option value="over">Over</option><option value="waived">Waived</option></select></label><label>Note<input name="note" value="'+esc(x.reconciliation_note||"")+'" placeholder="Optional reconciliation note"></label><button class="btn btn-outline" type="submit">Save reconciliation</button></form>':"")+'</article>').join("")||'<p class="muted">No completed trips have been posted to the financial ledger yet.</p>';
    }
    panel.addEventListener("submit",async e=>{
      const f=e.target;
      if(f.id==="twendeFinanceRateForm"){
        e.preventDefault();const v=new FormData(f),rate=Number(v.get("rate"))/100;
        const {error}=await db.rpc("twende_finance_set_commission",{p_service_type:v.get("service_type"),p_rate:rate});
        if(error){toast("Commission update failed: "+error.message);return;}toast("Commission rate updated. This applies to future completed trips.");await loadRates();return;
      }
      if(f.id==="twendeFinanceReportForm"){e.preventDefault();const v=new FormData(f);await loadReport(v.get("from"),v.get("to"));return;}
      if(f.classList.contains("twendeCashReconcile")){
        e.preventDefault();const v=new FormData(f);
        const {error}=await db.rpc("twende_finance_reconcile_cash",{p_ride_id:f.dataset.ride,p_reported_cash:Number(v.get("cash")),p_status:v.get("status"),p_note:v.get("note")});
        if(error){toast("Reconciliation failed: "+error.message);return;}toast("Cash reconciliation saved.");await loadTrips();const rf=document.getElementById("twendeFinanceReportForm");if(rf)await loadReport(rf.elements.from.value,rf.elements.to.value);
      }
    });
    await loadRates();await loadReport(dateInput(monthStart),dateInput(now));await loadTrips();
  }
  if(typeof original==="function"){
    window.loadAdminDashboard=async function(){await original();document.getElementById("twendeFinanceModule")?.remove();await renderFinance();};
  }
  window.addEventListener("load",()=>setTimeout(()=>window.loadAdminDashboard?.(),300));
})();