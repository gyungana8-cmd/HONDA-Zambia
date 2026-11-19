/* TWENDE passenger navigation: stable bottom placement and direct tab actions. */
(()=>{
  const $=s=>document.querySelector(s);
  const nav=$(".twende-bottom-nav");
  const ids=["twendeTabHome","twendeTabOrders","twendeTabSupport","twendeTabProfile"];
  const active=id=>ids.forEach(x=>$("#"+x)?.classList.toggle("active",x===id));
  if(nav){
    // Android WebView can misplace fixed navigation when CSS is combined with
    // nested scroll containers. Pin the passenger bar to the viewport bottom.
    nav.style.setProperty("position","fixed","important");
    nav.style.setProperty("top","auto","important");
    nav.style.setProperty("bottom","0","important");
    nav.style.setProperty("left","0","important");
    nav.style.setProperty("right","0","important");
    nav.style.setProperty("z-index","9999","important");
    nav.style.setProperty("width","100%","important");
  }
  $("#twendeTabHome")?.addEventListener("click",()=>{
    active("twendeTabHome");
    document.body.classList.remove("twende-hub-open");
    $("#twendeAccountHub")?.classList.remove("is-active");
    $("#ride-services")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("#twendeTabOrders")?.addEventListener("click",()=>{
    active("twendeTabOrders");
    if(window.twendeShowPassengerHub)window.twendeShowPassengerHub("orders");
    else document.querySelector('[data-hub="orders"]')?.click();
  });
  $("#twendeTabSupport")?.addEventListener("click",()=>{
    active("twendeTabSupport");
    if(window.twendeShowPassengerHub)window.twendeShowPassengerHub("support");
    else document.querySelector('[data-hub="support"]')?.click();
  });
  $("#twendeTabProfile")?.addEventListener("click",()=>{
    active("twendeTabProfile");
    if(window.twendeShowPassengerHub)window.twendeShowPassengerHub("profile");
    else $("#twendeProfileButton")?.click();
  });
  document.addEventListener("click",e=>{
    if(e.target.closest("#twendeHubBack"))active("twendeTabHome");
  });
})();