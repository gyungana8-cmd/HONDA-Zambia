const bikes=[
{id:1,model:"Honda CG 125",type:"Commuter",location:"Lusaka",rate:180,emoji:"🏍️",detail:"Manual • 125cc • Daily hire"},
{id:2,model:"Honda Ace 125",type:"Delivery",location:"Kitwe",rate:150,emoji:"🛵",detail:"Manual • 125cc • Delivery-ready"},
{id:3,model:"Honda XR 150",type:"Off-road",location:"Mufumbwe",rate:280,emoji:"🏍️",detail:"Manual • 150cc • Rugged roads"}
];
let role="rider", selectedBike=null, activeFilter="all";
const grid=document.querySelector("#bikeGrid"), dialog=document.querySelector("#bookingDialog");
function money(n){return "K"+Number(n).toLocaleString("en-ZM")}
function render(){
 const loc=document.querySelector("#location").value.trim().toLowerCase();
 const max=document.querySelector("#maxPrice").value;
 const filtered=bikes.filter(b=>(activeFilter==="all"||b.type===activeFilter)&&(!loc||b.location.toLowerCase().includes(loc))&&(max==="all"||b.rate<=Number(max)));
 grid.innerHTML=filtered.map(b=>`<article class="bike-card"><div class="bike-photo">${b.emoji}</div><div class="bike-info"><h3>${b.model}</h3><div class="bike-meta"><span>📍 ${b.location}</span><span>${b.type}</span></div><p class="muted">${b.detail}</p><div class="bike-bottom"><div class="price">${money(b.rate)} <small>/ day</small></div><button class="btn btn-red" data-hire="${b.id}">Request hire</button></div></div></article>`).join("")||'<p class="muted">No sample motorcycles match those filters. Try another location or budget.</p>';
 document.querySelector("#resultCount").textContent=`${filtered.length} sample listing${filtered.length===1?"":"s"}`;
}
function toast(msg){const t=document.querySelector("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function setRole(next){role=next;document.querySelector("#dashTitle").textContent=role==="rider"?"Rider dashboard":"Owner dashboard";document.querySelector("#dashCardTitle").textContent=role==="rider"?"My hire requests":"My motorcycle listings";document.querySelector("#dashCardText").textContent=role==="rider"?"Your booking requests will appear here after you request a motorcycle.":"Your motorcycles, availability and incoming hire requests will appear here.";document.querySelector("#roleTop").textContent=role==="rider"?"Rider mode":"Owner mode";document.querySelector("#switchRole").textContent=role==="rider"?"Switch to owner":"Switch to rider";}
function openOwner(){setRole("owner");document.querySelector("#ownerDialog").showModal()}
grid.addEventListener("click",e=>{const btn=e.target.closest("[data-hire]");if(!btn)return;selectedBike=bikes.find(b=>b.id===Number(btn.dataset.hire));document.querySelector("#bookingTitle").textContent=`Request ${selectedBike.model}`;document.querySelector("#bookingPrice").textContent=`${money(selectedBike.rate)} per day • ${selectedBike.location}`;document.querySelector("#total").textContent=money(selectedBike.rate);dialog.showModal()});
document.querySelector("#days").addEventListener("input",e=>{if(selectedBike)document.querySelector("#total").textContent=money(selectedBike.rate*Math.max(1,Number(e.target.value)||1))});
document.querySelector("#bookingForm").addEventListener("submit",e=>{e.preventDefault();if(!e.target.reportValidity())return;const data={bike:selectedBike.model,name:document.querySelector("#riderName").value,phone:document.querySelector("#riderPhone").value,pickup:document.querySelector("#pickup").value,start:document.querySelector("#startDate").value,days:Number(document.querySelector("#days").value),total:selectedBike.rate*Number(document.querySelector("#days").value)};const saved=JSON.parse(localStorage.getItem("hondaRequests")||"[]");saved.push(data);localStorage.setItem("hondaRequests",JSON.stringify(saved));dialog.close();e.target.reset();toast("Demo hire request saved on this device.");});
document.querySelector("#ownerForm").addEventListener("submit",e=>{e.preventDefault();if(!e.target.reportValidity())return;document.querySelector("#ownerDialog").close();e.target.reset();toast("Demo listing details captured. Backend publishing is not connected yet.");});
document.querySelector("#ownerHero").onclick=openOwner;document.querySelector("#ownerCta").onclick=openOwner;document.querySelector("#roleTop").onclick=()=>setRole(role==="rider"?"owner":"rider");document.querySelector("#switchRole").onclick=()=>setRole(role==="rider"?"owner":"rider");
document.querySelector("#searchBtn").onclick=render;document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));render()});
document.querySelector("#menuBtn").onclick=()=>document.querySelector("#nav").classList.toggle("open");
render();setRole("rider");
