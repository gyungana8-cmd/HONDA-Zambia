/* TWENDE Driver Wallet & Earnings Transparency.
   Shows immutable completed-trip splits and the driver's accepted owner agreement.
   This is an earnings statement, not a stored-value account or payout rail. */
(()=> {
 const db=window.twendeDb;if(!db)return;
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const money=n=>"K"+Number(n||0).toLocaleString("en-ZM",{minimumFractionDigits:2,maximumFractionDigits:2});
 const labels={fixed_daily:"Fixed daily payment",fixed_monthly:"Fixed monthly payment",percentage_owner_share:"Percentage of owner's 85% share",other:"Other arrangement"};
 async function renderWallet(){
  const snap=window.twendeRoleSnapshot,host=document.getElementById("driverDashboard");
  if(!host||!snap?.signedIn||snap.guest||snap.activePortal!=="driver")return;
  document.getElementById("twendeDriverWallet")?.remove();
  const user=window.currentTwendeUser;
  if(!user?.id)return;
  const section=document.createElement("section");section.id="twendeDriverWallet";section.className="twende-agreements";
  section.innerHTML='<h3>Driver Wallet & Earnings</h3><p class="muted">Your completed bookings are recorded independently of the vehicle owner. TWENDE commission is 15%; the vehicle owner is entitled to 85%. Your pay is determined by the owner agreement you accepted. This is a transparent earnings statement, not an electronic cash balance or payout service.</p><div class="dash-grid" id="twendeDriverWalletSummary"><p class="muted">Loading your completed-trip earnings…</p></div><h4>Completed booking statements</h4><div id="twendeDriverWalletEntries"><p class="muted">Loading trip statements…</p></div>';
  const agreementSection=document.getElementById("twendeDriverAgreements");
  if(agreementSection&&agreementSection.parentElement===host)host.insertBefore(section,agreementSection);else host.appendChild(section);
  const {data:rows,error}=await db.from("twende_driver_wallet_entries")
    .select("ride_id,vehicle_id,completed_at,gross_fare,twende_commission,owner_entitlement,compensation_type,compensation_amount,compensation_percentage,driver_earnings,agreement_terms")
    .eq("driver_id",user.id).order("completed_at",{ascending:false}).limit(200);
  if(error){
   section.querySelector("#twendeDriverWalletSummary").innerHTML='<p class="muted">Driver wallet setup is pending. Ask the Primary Administrator to apply supabase/twende_driver_wallet.sql after the finance and owner-driver agreement migrations. Details: '+esc(error.message)+'</p>';
   section.querySelector("#twendeDriverWalletEntries").innerHTML="";
   return;
  }
  const entries=rows||[];
  const sum=k=>entries.reduce((n,x)=>n+Number(x[k]||0),0);
  const driverEarnings=sum("driver_earnings");
  const calculatedCount=entries.filter(x=>x.driver_earnings!==null).length;
  section.querySelector("#twendeDriverWalletSummary").innerHTML=
   '<article class="metric-card"><span>Completed bookings</span><strong>'+entries.length+'</strong></article>'+
   '<article class="metric-card"><span>Completed trip value</span><strong>'+money(sum("gross_fare"))+'</strong></article>'+
   '<article class="metric-card"><span>TWENDE commission (15%)</span><strong>'+money(sum("twende_commission"))+'</strong></article>'+
   '<article class="metric-card"><span>Vehicle owner entitlement (85%)</span><strong>'+money(sum("owner_entitlement"))+'</strong></article>'+
   '<article class="metric-card"><span>Calculated driver earnings</span><strong>'+money(driverEarnings)+'</strong><small>'+calculatedCount+' trips with percentage-based agreements</small></article>';
  section.querySelector("#twendeDriverWalletEntries").innerHTML=entries.map(x=>{
   let pay;
   if(x.compensation_type==="percentage_owner_share"){
    pay='<p>Agreed driver share: <strong>'+esc(x.compensation_percentage)+'% of owner entitlement • '+money(x.driver_earnings)+'</strong></p>';
   }else if(x.compensation_type==="fixed_daily"||x.compensation_type==="fixed_monthly"){
    pay='<p>Agreed driver pay: <strong>'+money(x.compensation_amount)+(x.compensation_type==="fixed_daily"?" per day":" per month")+'</strong></p><p class="muted">This fixed payment is not allocated to an individual booking.</p>';
   }else if(x.compensation_type==="other"){
    pay='<p>Agreed driver pay: <strong>Other arrangement</strong></p>';
   }else{
    pay='<p class="muted"><strong>No accepted owner-driver agreement was recorded for this trip.</strong> Ask the owner to agree and record payment terms before further work.</p>';
   }
   return '<article class="dash-card"><strong>'+(x.completed_at?new Date(x.completed_at).toLocaleString("en-ZM"):"Completed trip")+'</strong><p class="muted">Booking reference: '+esc(String(x.ride_id).slice(0,8).toUpperCase())+'</p><p>Passenger fare: <strong>'+money(x.gross_fare)+'</strong></p><p>TWENDE commission (15%): '+money(x.twende_commission)+'</p><p>Vehicle owner entitlement (85%): '+money(x.owner_entitlement)+'</p>'+pay+(x.agreement_terms?'<p>Agreement terms: '+esc(x.agreement_terms)+'</p>':"")+'</article>';
  }).join("")||'<p class="muted">No completed taxi bookings have been recorded in your wallet yet. Each completed trip will appear here with its fare split.</p>';
 }
 const original=window.loadDriverDashboard;
 if(typeof original==="function")window.loadDriverDashboard=async function(){await original();await renderWallet();};
 window.addEventListener("load",()=>setTimeout(renderWallet,1000));
 window.twendeRefreshDriverWallet=renderWallet;
})();