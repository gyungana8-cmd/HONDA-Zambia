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
  const MUFUMBWE_BIAS = {lat:-13.13683, lon:25.00296};
  function placeLabel(p) {
    const parts=[p.name,p.street,p.district,p.city,p.county,p.state,p.country].filter(Boolean);
    return [...new Set(parts)].join(", ");
  }
  async function searchPlaces(query) {
    const q=query.trim();
    if(q.length<3) return [];
    const center=window.twendePickupCoords||MUFUMBWE_BIAS;
    const localResults=[];
    // "Mufumbwe District" is a large administrative area, not a usable
    // passenger pickup point. For this broad town-only query, offer the
    // documented Mufumbwe Town Centre coordinates first.
    if(/^mufumbwe(?: district)?$/i.test(q)) {
      const town={lat:-13.13683,lng:25.00296,label:"Mufumbwe Town Centre, Mufumbwe, North-Western Province, Zambia"};
      placeCache.set(town.label.toLowerCase(),town);
      localResults.push(town);
    }
    const url="https://photon.komoot.io/api/?q="+encodeURIComponent(q+", Zambia")+
      "&lat="+center.lat+"&lon="+(center.lng??center.lon)+"&limit=8&lang=en";
    const response=await fetch(url,{headers:{Accept:"application/json"}});
    if(!response.ok) throw new Error("Destination search is temporarily unavailable.");
    const data=await response.json();
    const remote=(data.features||[]).filter(f=>{
      const lng=Number(f.geometry?.coordinates?.[0]),lat=Number(f.geometry?.coordinates?.[1]);
      // Accept valid Zambia coordinates even when Photon omits its country label.
      return Number.isFinite(lng)&&Number.isFinite(lat)&&lat>=-18.5&&lat<=-8&&lng>=21&&lng<=34;
    }).map(f=>{
      const p=f.properties||{}, label=placeLabel(p)||q;
      const point={lat:Number(f.geometry.coordinates[1]),lng:Number(f.geometry.coordinates[0]),label};
      placeCache.set(label.toLowerCase(),point);
      return point;
    });
    return [...localResults,...remote.filter(p=>!localResults.some(x=>x.label.toLowerCase()===p.label.toLowerCase()))];
  }
  async function geocode(address) {
    const q=address.trim();
    if(!q) throw new Error("Enter a destination in Zambia.");
    if(/^mufumbwe(?: district)?$/i.test(q)) {
      return {lat:-13.13683,lng:25.00296,label:"Mufumbwe Town Centre, Mufumbwe, North-Western Province, Zambia"};
    }
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
  async function resolvePickup(pickupLabel) {
    const selected=window.twendePickupCoords;
    if(selected && selected.label===pickupLabel &&
       Number.isFinite(Number(selected.lat)) && Number.isFinite(Number(selected.lng))) {
      return {lat:Number(selected.lat),lng:Number(selected.lng)};
    }
    // Only use device GPS when the passenger explicitly chose a current-location
    // pickup. A manually entered address must never be silently replaced by GPS.
    if(/^(my )?(current|present) (gps )?location$|^gps location$/i.test(pickupLabel.trim())) {
      const pos=await getPosition();
      return {lat:pos.coords.latitude,lng:pos.coords.longitude};
    }
    return geocode(pickupLabel);
  }
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

  // Start/stop GPS from the current multi-vehicle availability control.
  window.addEventListener("twende-vehicle-online",event=>{
    if(event.detail?.online) startDriverGps();
    else stopDriverGps();
  });
  // Retain compatibility with the legacy single-driver control.
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

    // Keep a passenger fare estimate visible before submission and reuse the
    // exact same estimate when the ride request is saved.
    let passengerFareEstimate=null;
    let estimateTimer=null;
    async function calculatePassengerFare(showMessages=false) {
      const pickupLabel=$("#ridePickup")?.value.trim()||"";
      const destinationLabel=$("#rideDestination")?.value.trim()||"";
      const type=$("#rideServiceType")?.value||"";
      if(!pickupLabel||!destinationLabel||!type) {
        passengerFareEstimate=null;
        estimate.textContent="Enter pickup and destination to calculate your fare.";
        return null;
      }
      const pickup=await resolvePickup(pickupLabel);
      const selectedDestination=window.twendeDestinationCoords;
      const destination=selectedDestination&&selectedDestination.label===destinationLabel
        ?{lat:Number(selectedDestination.lat),lng:Number(selectedDestination.lng),label:selectedDestination.label}
        :await geocode(destinationLabel);
      const km=await routeDistance(pickup,destination);
      const fare=await fareFor(type,km);
      passengerFareEstimate={pickupLabel,destinationLabel,type,pickup,destination,km,fare};
      estimate.textContent="Estimated road distance: "+km.toFixed(1)+" km • Estimated fare: "+money(fare)+" (cash to driver)";
      estimate.classList.add("fare-ready");
      return passengerFareEstimate;
    }
    function schedulePassengerFare() {
      clearTimeout(estimateTimer);
      passengerFareEstimate=null;
      estimate.textContent="Updating your route and fare estimate…";
      estimateTimer=setTimeout(()=>{
        calculatePassengerFare(false).catch(err=>{
          passengerFareEstimate=null;
          estimate.textContent=err.message||"Fare estimate is temporarily unavailable. Check your pickup and destination.";
          estimate.classList.remove("fare-ready");
        });
      },350);
    }
    ["input","change"].forEach(eventName=>{
      $("#ridePickup")?.addEventListener(eventName,schedulePassengerFare);
      $("#rideDestination")?.addEventListener(eventName,schedulePassengerFare);
      $("#rideServiceType")?.addEventListener(eventName,schedulePassengerFare);
    });
    document.querySelectorAll("[data-ride-service]").forEach(button=>{
      button.addEventListener("click",()=>setTimeout(schedulePassengerFare,450),true);
    });
    $("#rideDialog")?.addEventListener("close",()=>{passengerFareEstimate=null;});
    $("#rideDialog")?.addEventListener("toggle",()=>{
      if($("#rideDialog").open)setTimeout(schedulePassengerFare,300);
    });
    // Booking submission is handled by app.js. Do not intercept it here:
    // the previous capture-phase handler blocked the canonical insert and
    // made third-party route/fare APIs a hard requirement for every booking.

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
