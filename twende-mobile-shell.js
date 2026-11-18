/* TWENDE passenger bottom navigation */
(()=>{const $=s=>document.querySelector(s);const tabs=["twendeTabHome","twendeTabOrders","twendeTabSupport","twendeTabProfile"];function active(id){tabs.forEach(x=>$("#"+x)?.classList.toggle("active",x===id));}
$("#twendeTabHome")?.addEventListener("click",()=>{active("twendeTabHome");document.body.classList.remove("twende-hub-open");$("#twendeAccountHub")?.classList.remove("is-active");$("#ride-services")?.scrollIntoView({behavior:"smooth",block:"start"});});
$("#twendeTabOrders")?.addEventListener("click",()=>{active("twendeTabOrders");document.querySelector('[data-hub="orders"]')?.click();});
$("#twendeTabSupport")?.addEventListener("click",()=>{active("twendeTabSupport");document.querySelector('[data-hub="support"]')?.click();});
$("#twendeTabProfile")?.addEventListener("click",()=>{active("twendeTabProfile");$("#twendeProfileButton")?.click();});
document.addEventListener("click",e=>{if(e.target.closest("#twendeHubBack"))active("twendeTabHome");});
})();