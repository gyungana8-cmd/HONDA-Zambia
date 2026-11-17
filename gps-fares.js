/* TWENDE GPS + route-distance + configurable fare estimates.
   Requires supabase/gps_fares_phase2.sql. Geolocation requires HTTPS and user permission.
   OSRM demo routing and Nominatim geocoding are prototype services; production needs a contracted provider. */
(() => {
  const $ = s => document.querySelector(s);
  const money = n => "K" + Number(n).toFixed(2);
  let driverWatchId = null;
  let lastGps = null;

  function notify(msg) {
    const t=$("#toast"); if(!t) return;
    t.textContent=msg; t.classList.add("show");
    setTimeout(()=>t.classList.remove("show"),3500);
  }
  function getPosition(options={}) {
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation) return reject(new Error("This device/browser does not support GPS."));
      navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:10000,...options});
    });
  }

  async function reverseGeocode(lat,lng) {
    const url="https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lng);
    const response=await fetch(url,{headers:{Accept:"application/json"}});
    if(!response.ok) throw new Error("GPS found your position, but the address could not be identified. Enter your pickup manually.");
    const data=await response.json();
    return data.display_name||"Current GPS location";
  }
  window.twendeCapturePassengerLocation=async()=>{
    const p=await getPosition();
    const label=await reverseGeocode(p.coords.latitude,p.coords.longitude);
    return {lat:p.coords.latitude,lng:p.coords.longitude,label};
  };
  // Mufumbwe-focused place search. Photon provides live suggestions; selected
  // results retain their exact coordinates so fare routing does not geocode a label again.
  const placeCache = new Map();
  const MUFUMBWE_BIAS = {lat:-13.68, lon:24.80};
  function placeLabel(p) {
    const parts=[p.name,p.street,p.district,p.city,p.county,p.state,p.country].filter(Boolean);
    return [...new Set(parts)].join(", ");
  }
  async function searchPlaces(query) {
    const q=query.trim();
    if(q.length<3) return [];
    const center=window.twendePickupCoords||MUFUMBWE_BIAS;
    const url="https://photon.komoot.io/api/?q="+encodeURIComponent(q+", Zambia")+
      "&lat="+center.lat+"&lon="+(center.lng??center.lon)+"&limit=8&lang=en";
    const response=await fetch(url,{headers:{Accept:"application/json"}});
    if(!response.ok) throw new Error("Destination search is temporarily unavailable.");
    const data=await response.json();
    return (data.features||[]).filter(f=>{
      const lng=Number(f.geometry?.coordinates?.[0]),lat=Number(f.geometry?.coordinates?.[1]);
      // Accept valid Zambia coordinates even when Photon omits its country label.
      return Number.isFinite(lng)&&Number.isFinite(lat)&&lat>=-18.5&&lat<=-8&&lng>=21&&lng<=34;
    }).map(f=>{
      const p=f.properties||{}, label=placeLabel(p)||q;
      const point={lat:Number(f.geometry.coordinates[1]),lng:Number(f.geometry.coordinates[0]),label};
      placeCache.set(label.toLowerCase(),point);
      return point;
    });
  }
  async function geocode(address) {
    const q=address.trim();
    if(!q) throw new Error("Enter a destination in Zambia.");
    const cached=placeCache.get(q.toLowerCase());
    if(cached) return cached;
    // First try the Mufumbwe-biased search service.
    try {
      const matches=await searchPlaces(q);
      if(matches.length) return matches[0];
    } catch(err) { console.warn("Photon place search:",err.message); }
    // Fallback to Zambia-restricted Nominatim search with a Mufumbwe view bias.
    const params=new URLSearchParams({format:"jsonv2",limit:"5",countrycodes:"zm",q:q+", Zambia"});
    const response=await fetch("https://nominatim.openstreetmap.org/search?"+params.toString(),{headers:{Accept:"application/json"}});
    if(!response.ok) throw new Error("Could not search destinations in Zambia. Check your internet connection and try again.");
    const rows=await response.json();
    if(!rows.length) throw new Error("Destination not found in Zambia. Try a nearby school, clinic, market, village or landmark name.");
    return {lat:Number(rows[0].lat),lng:Number(rows[0].lon),label:rows[0].display_name};
  }
  function attachDestinationSuggestions() {
    const input=$("#rideDestination");
    if(!input) return;
    const list=document.createElement("datalist");
    list.id="twendeDestinationSuggestions";
    input.setAttribute("list",list.id);
    input.setAttribute("autocomplete","off");
    input.setAttribute("placeholder","Search a town, hospital, school or landmark in Zambia…");
    input.insertAdjacentElement("afterend",list);
    let timer=null, lastQuery="";
    input.addEventListener("input",()=>{
      clearTimeout(timer);
      const q=input.value.trim();
      if(q.length<3){list.replaceChildren();return;}
      timer=setTimeout(async()=>{
        if(q===lastQuery) return;
        lastQuery=q;
        try {
          const places=await searchPlaces(q);
          list.replaceChildren(...places.map(place=>{
            const option=document.createElement("option");
            option.value=place.label;
            return option;
          }));
        } catch(err) { console.warn("TWENDE destination suggestions:",err.message); }
      },450);
    });
    input.addEventListener("change",()=>{
      const selected=placeCache.get(input.value.trim().toLowerCase());
      if(selected) input.dataset.latitude=String(selected.lat),input.dataset.longitude=String(selected.lng);
      else {delete input.dataset.latitude;delete input.dataset.longitude;}
    });
  }
  attachDestinationSuggestions();
  async function routeDistance(from,to) {
    const url="https://router.project-osrm.org/route/v1/driving/"+from.lng+","+from.lat+";"+to.lng+","+to.lat+"?overview=false&alternatives=false&steps=false";
    const response=await fetch(url);
    if(!response.ok) throw new Error("Route service is temporarily unavailable. Try again.");
    const data=await response.json();
    if(data.code!=="Ok"||!data.routes?.length) throw new Error("A road route could not be found for those locations.");
    return data.routes[0].distance/1000;
  }
  async function fareFor(type,km) {
    const {data,error}=await window.twendeDb.from("taxi_fare_settings")
      .select("base_fare,per_km,minimum_fare,is_active").eq("service_type",type).maybeSingle();
    if(error) throw new Error("Fare settings are not installed yet. Apply the GPS and fares SQL migration.");
    if(!data?.is_active) throw new Error("TWENDE has not activated the approved "+type+" fare rate yet.");
    const calculated=Number(data.base_fare)+km*Number(data.per_km);
    return Math.max(Number(data.minimum_fare),calculated);
  }
  function startDriverGps() {
    if(driverWatchId!==null || !navigator.geolocation) return;
    driverWatchId=navigator.geolocation.watchPosition(async p=>{
      lastGps=p.coords;
      const {error}=await window.twendeDb.rpc("update_twende_driver_location",{
        p_latitude:p.coords.latitude,p_longitude:p.coords.longitude,
        p_accuracy_m:p.coords.accuracy,p_heading:p.coords.heading,
        p_speed_mps:p.coords.speed
      });
      if(error) console.warn("TWENDE GPS update:",error.message);
      const status=$("#driverGpsStatus");
      if(status) status.textContent="GPS sharing active • accuracy ±"+Math.round(p.coords.accuracy)+" m";
    },err=>{
      notify("GPS unavailable: "+err.message);
      stopDriverGps();
    },{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
    let status=$("#driverGpsStatus"); if(!status){status=document.createElement("p");status.id="driverGpsStatus";status.className="muted";$("#driverDashboard")?.prepend(status);} status.textContent="Waiting for GPS fix…";
  }
  function stopDriverGps() {
    if(driverWatchId!==null) navigator.geolocation.clearWatch(driverWatchId);
    driverWatchId=null;
    const status=$("#driverGpsStatus"); if(status) status.textContent="GPS sharing stopped";
  }

  // Attach GPS controls to the approved driver's dashboard.
  const driverPanel=$("#driverDashboard");
  if(driverPanel) driverPanel.addEventListener("click",e=>{
    const b=e.target.closest("#driverOnlineBtn"); if(!b) return;
    if(b.dataset.online==="true") {
      // The existing dashboard handler performs the online RPC; start tracking after it returns.
      setTimeout(()=>startDriverGps(),1200);
    } else stopDriverGps();
  },true);

  // The app's normal ride submit handler is intercepted so we can attach GPS, route distance and fare.
  const rideForm=$("#rideForm");
  if(rideForm) {
    const estimate=document.createElement("p");
    estimate.id="gpsFareEstimate"; estimate.className="muted";
    estimate.textContent="GPS route and fare estimate will be calculated before sending your request.";
    const submit=rideForm.querySelector('button[type="submit"]');
    submit?.before(estimate);
    rideForm.addEventListener("submit",async e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      const b=e.submitter||submit; if(!window.currentTwendeUser){notify("Please sign in first.");return;}
      b.disabled=true;
      try {
        notify("Getting your pickup location…");
        let pickup=window.twendePickupCoords?{lat:window.twendePickupCoords.lat,lng:window.twendePickupCoords.lng}:null;
        if(!pickup) {
          try {
            const pos=await getPosition();
            pickup={lat:pos.coords.latitude,lng:pos.coords.longitude};
          } catch(gpsError) {
            notify("GPS permission unavailable. Using the pickup address you entered…");
            pickup=await geocode($("#ridePickup").value.trim());
          }
        }
        const destination=await geocode($("#rideDestination").value.trim());
        notify("Calculating road distance and fare…");
        const km=await routeDistance(pickup,destination);
        const type=$("#rideServiceType").value;
        const fare=await fareFor(type,km);
        estimate.textContent="Estimated road distance: "+km.toFixed(1)+" km • Estimated fare: "+money(fare)+" (cash to driver)";
        const row={
          rider_id:window.currentTwendeUser.id,
          passenger_name:$("#passengerName").value.trim(),
          passenger_phone:$("#passengerPhone").value.trim(),
          service_type:type,pickup_text:$("#ridePickup").value.trim(),
          destination_text:$("#rideDestination").value.trim(),
          payment_method:"cash",status:"pending",
          pickup_lat:pickup.lat,pickup_lng:pickup.lng,
          destination_lat:destination.lat,destination_lng:destination.lng,
          route_distance_km:Number(km.toFixed(2)),estimated_fare:Number(fare.toFixed(2)),fare_currency:"ZMW"
        };
        const {error}=await window.twendeDb.from("ride_requests").insert(row);
        if(error) throw error;
        $("#rideDialog").close(); rideForm.reset();
        notify("Taxi request sent. Estimate "+money(fare)+" for "+km.toFixed(1)+" km. Confirm final fare with driver.");
        await window.refreshTwendeRideViews?.();
      } catch(err) {
        console.error("GPS/fare request:",err);
        notify(err.message||"Could not calculate the route and fare.");
      } finally {b.disabled=false;}
    },true);
  }

  // Show the assigned driver's latest shared location on a passenger's accepted ride.
  async function refreshDriverLocation() {
    const host=$("#passengerRides");
    const user=window.currentTwendeUser;
    if(!host||!user) return;
    const {data:rides}=await window.twendeDb.from("ride_requests")
      .select("id,driver_id,status").eq("rider_id",user.id).eq("status","accepted");
    for(const ride of rides||[]) {
      if(!ride.driver_id) continue;
      const {data:loc}=await window.twendeDb.from("driver_locations")
        .select("latitude,longitude,updated_at").eq("driver_id",ride.driver_id).maybeSingle();
      if(!loc) continue;
      const link="https://www.openstreetmap.org/?mlat="+loc.latitude+"&mlon="+loc.longitude+"#map=16/"+loc.latitude+"/"+loc.longitude;
      let el=host.querySelector('[data-driver-gps="'+ride.id+'"]');
      if(!el){el=document.createElement("p");el.dataset.driverGps=ride.id;host.append(el);}
      el.innerHTML='Driver shared location: <a target="_blank" rel="noopener" href="'+link+'">View on map</a> • Updated '+new Date(loc.updated_at).toLocaleTimeString();
    }
  }
  window.refreshTwendeRideViews=async()=>{
    await window.loadTwendePassengerRides?.();
    await refreshDriverLocation();
  };
  // Expose only the minimum existing app state/functions needed by this extension.
  window.addEventListener("twende-session-ready",()=>{refreshDriverLocation();});
  setInterval(refreshDriverLocation,15000);
  window.addEventListener("beforeunload",stopDriverGps);
})();
