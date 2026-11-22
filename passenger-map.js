/* TWENDE passenger live map: pickup, destination, route and nearby online taxis. */
(() => {
  const $ = s => document.querySelector(s);
  const home = $("#ride-services");
  if (!home) return;
  const style = document.createElement("style");
  style.textContent = `
    .twende-live-panel{margin:10px 0 18px;padding:0;border:0;background:transparent}
    .twende-location-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#fff}
    .twende-location-symbol{font-size:20px;color:#d71920}
    .twende-location-copy{display:flex;flex:1;min-width:150px;flex-direction:column;gap:2px}
    .twende-location-copy strong{font-size:14px;color:var(--ink)}
    .twende-location-copy span{font-size:12px;color:var(--muted)}
    .twende-location-action{border:0;background:#fff3bf;color:#6f5700;border-radius:10px;padding:9px 12px;font-weight:800}
    .twende-pickup-wrap{display:grid;gap:6px;margin:4px 0 10px}
    .twende-pickup-wrap label{font-size:14px;font-weight:800;color:var(--ink)}
    .twende-pickup-wrap input{width:100%;min-height:52px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font-size:15px}
    .twende-destination-wrap{margin:12px 0 14px}
    .twende-destination-wrap label{display:block;font-size:19px;font-weight:850;margin-bottom:8px;color:var(--ink)}
    .twende-destination-input{width:100%;min-height:58px;padding:15px 16px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);font-size:16px;box-shadow:0 5px 18px #1018200a}
    .twende-destination-results{display:grid;gap:6px;margin-top:5px}
    .twende-destination-results button{width:100%;text-align:left;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);min-height:44px}
    .twende-map-status{font-size:13px;color:var(--muted);margin:8px 2px}
    #twendeMapDetails{margin-top:12px}
    #twendePassengerMap{height:300px;min-height:260px;border-radius:14px;background:#edf0f2;overflow:hidden;z-index:1}
    .twende-map-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:10px}
    .twende-map-dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;background:#d71920}
    .twende-map-dot.car{background:#1769aa}.twende-map-dot.bike{background:#198754}
    /* Persistent vehicle identity labels beside live taxi markers. */
    .leaflet-tooltip.twende-vehicle-map-label{background:#fff;color:#17212b;border:1px solid #1769aa;border-radius:7px;padding:5px 8px;font-size:12px;font-weight:800;line-height:1.25;box-shadow:0 2px 8px #0003;white-space:nowrap;pointer-events:none}
    .leaflet-tooltip.twende-vehicle-map-label:before{display:none}
    .twende-available-heading{margin:22px 0 10px;font-weight:800}
    .service-grid.twende-services-hidden{display:none!important}
    .service-grid{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;margin-top:14px}
    .service-grid .service-card{display:grid!important;grid-template-columns:minmax(0,1.2fr) minmax(130px,.8fr)!important;align-items:center;min-height:170px;padding:12px!important;gap:12px!important;border-radius:18px!important;background:#fff!important}
    .service-grid .service-vehicle-image{width:100%!important;height:145px!important;object-fit:contain!important}
    .service-grid .twende-service-copy{min-width:0}
    .service-grid .twende-service-copy h3{margin:4px 0;font-size:21px}
    .service-grid .twende-vehicle-type{font-size:15px;margin:4px 0 10px}
    .service-grid .service-card .btn{width:100%;min-height:48px;white-space:normal}
    @media(max-width:420px){.service-grid .service-card{grid-template-columns:minmax(0,1fr) minmax(118px,.9fr)!important}.service-grid .service-vehicle-image{height:125px!important}}
  `;
  document.head.append(style);
  const panel=document.createElement("section");
  panel.className="twende-live-panel";
  panel.innerHTML=`
    <div class="twende-location-row">
      <span class="twende-location-symbol" aria-hidden="true">●</span>
      <div class="twende-location-copy"><strong>Your location</strong><span id="twendeCurrentLocation">Location not set yet</span></div>
      <button class="twende-location-action" id="twendeLocateMe" type="button">Use GPS</button>
    </div>
    <div class="twende-pickup-wrap"><label for="twendePickupSearch">Pickup location</label><input id="twendePickupSearch" type="text" autocomplete="street-address" placeholder="Use GPS or enter pickup location"></div>
    <div class="twende-destination-wrap">
      <label for="twendeDestinationSearch">Where to?</label>
      <input class="twende-destination-input" id="twendeDestinationSearch" type="search" autocomplete="off" placeholder="Enter destination" aria-label="Where to destination">
      <div class="twende-destination-results" id="twendeDestinationResults" role="listbox"></div>
    </div>
    <p id="twendeMapStatus" class="twende-map-status" role="status">Set your location and destination, or choose a TWENDE service below.</p>
    <div id="twendeMapDetails" hidden>
      <div id="twendePassengerMap" aria-label="Map showing your GPS pickup and available TWENDE taxis"></div>
      <div class="twende-map-legend"><span><i class="twende-map-dot"></i>Your pickup</span><span><i class="twende-map-dot car"></i>Car taxi</span><span><i class="twende-map-dot bike"></i>Motorcycle taxi</span></div>
    </div>
  `;
  const serviceGrid=home.querySelector(".service-grid");
  const rideHeading=home.querySelector(".twende-choose-ride-heading");
  if(serviceGrid){
    serviceGrid.classList.remove("twende-services-hidden");
    // Keep the pickup and destination controls directly below “Where to?”
    // and before the ride-choice heading, matching the approved passenger design.
    home.insertBefore(panel,rideHeading||serviceGrid);
  } else home.append(panel);

  const status=$("#twendeMapStatus");
  const setStatus=s=>{if(status)status.textContent=s;};
  window.addEventListener("offline",()=>setStatus("You are offline. Connect to the internet to search places and see live taxis."));
  window.addEventListener("online",()=>{setStatus("Connection restored. Refreshing nearby TWENDE taxis…");if(userPoint)refreshDrivers();});
  let map=null, pickupMarker=null, destinationMarker=null, routeLayer=null, userPoint=null, destinationPoint=null;
  let driverMarkers=new Map(), refreshTimer=null, leafletLoading=null;
  const cache=new Map();
  const fallbackCenter=[-13.13683,25.00296];
  if(!navigator.onLine)setStatus("You are offline. Connect to the internet to search places and see live taxis.");

  function loadLeaflet(){
    if(window.L)return Promise.resolve();
    if(leafletLoading)return leafletLoading;
    leafletLoading=new Promise((resolve,reject)=>{
      const cdns=[
        {css:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",js:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"},
        {css:"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",js:"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"}
      ];
      const tryCdn=index=>{
        if(index>=cdns.length){reject(new Error("Map library could not load from either map provider. Check internet access and reload TWENDE."));return;}
        const provider=cdns[index];
        if(!document.querySelector('link[data-twende-leaflet-css="'+index+'"]')){
          const css=document.createElement("link");css.rel="stylesheet";css.href=provider.css;css.dataset.twendeLeafletCss=String(index);document.head.append(css);
        }
        const script=document.createElement("script");script.src=provider.js;script.async=true;
        script.onload=()=>window.L?resolve():tryCdn(index+1);
        script.onerror=()=>tryCdn(index+1);
        document.head.append(script);
      };
      tryCdn(0);
    });
    return leafletLoading;
  }
  function pin(color,emoji){
    return window.L.divIcon({className:"",html:'<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:'+color+';border:2px solid white;box-shadow:0 2px 7px #0005;display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:16px">'+emoji+'</span></div>',iconSize:[32,32],iconAnchor:[16,30]});
  }
  async function ensureMap(){
    await loadLeaflet();
    if(map)return;
    const mapElement=$("#twendePassengerMap");
    map=L.map(mapElement,{zoomControl:true}).setView(userPoint?[userPoint.lat,userPoint.lng]:fallbackCenter,userPoint?15:12);
    // A map tap can fine-tune the pickup after GPS has located the passenger.
    map.on("click",async event=>{
      const point={lat:event.latlng.lat,lng:event.latlng.lng};
      const label=await reverse(point.lat,point.lng);
      userPoint={...point,label};
      window.twendePickupCoords=userPoint;
      $("#ridePickup").value=label;
      showPickup();
      map.setView([point.lat,point.lng],16);
      setStatus("Pickup adjusted on the map. Choose a TWENDE taxi below.");
      refreshDrivers().catch(error=>console.warn("TWENDE nearby drivers:",error));
    });
    const tileProviders=[
      {url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",options:{maxZoom:19,attribution:"© OpenStreetMap"}},
      {url:"https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",options:{maxZoom:20,subdomains:"abcd",attribution:"© OpenStreetMap © CARTO"}}
    ];
    let tileProviderIndex=0,tileFallbackStarted=false;
    let tiles=L.tileLayer(tileProviders[0].url,tileProviders[0].options).addTo(map);
    tiles.on("tileerror",()=>{
      if(tileProviderIndex===0&&!tileFallbackStarted){
        tileFallbackStarted=true;tileProviderIndex=1;
        setStatus("Switching map provider…");
        map.removeLayer(tiles);
        tiles=L.tileLayer(tileProviders[1].url,tileProviders[1].options).addTo(map);
        tiles.once("load",()=>setStatus(userPoint?"Map loaded. Searching for nearby online TWENDE drivers…":"Map loaded. Set your pickup location to find taxis."));
        tiles.on("tileerror",()=>setStatus("Map tiles are blocked or unavailable. Check internet access, then reload TWENDE."));
      }
    });
    setTimeout(()=>{if(map)map.invalidateSize(true);},250);
    window.addEventListener("resize",()=>{if(map)map.invalidateSize();},{passive:true});
  }
  async function reverse(lat,lng){
    try{
      const url="https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lng);
      const response=await fetch(url,{headers:{Accept:"application/json"}});
      if(response.ok){
        const data=await response.json(),a=data.address||{};
        // Prefer a useful local pickup label over a long administrative string.
        const locality=a.suburb||a.neighbourhood||a.village||a.town||a.city||a.hamlet||a.county;
        const road=[a.house_number,a.road].filter(Boolean).join(" ");
        const localParts=[road,locality].filter(Boolean);
        // Never display a province-only reverse-geocode result as the passenger's pickup.
        // If the map provider cannot identify a nearby locality, keep the exact GPS pin visible.
        if(localParts.length){
          const parts=[...localParts,a.city_district,a.state,a.country].filter(Boolean);
          return [...new Set(parts)].join(", ");
        }
      }
    }catch(error){console.warn("TWENDE GPS address lookup:",error);}
    return "GPS location ("+Number(lat).toFixed(5)+", "+Number(lng).toFixed(5)+")";
  }
  function showPickup(){
    if(!map||!userPoint)return;
    const p=[userPoint.lat,userPoint.lng];
    if(pickupMarker)pickupMarker.setLatLng(p);
    else pickupMarker=L.marker(p,{icon:pin("#d71920","📍")}).addTo(map);
    pickupMarker.bindPopup("Passenger pickup");
  }
  function showDestination(){
    if(!map||!destinationPoint)return;
    const p=[destinationPoint.lat,destinationPoint.lng];
    if(destinationMarker)destinationMarker.setLatLng(p);
    else destinationMarker=L.marker(p,{icon:pin("#7c3aed","🏁")}).addTo(map);
    destinationMarker.bindPopup("Selected destination");
  }
  async function getDevicePosition(){
    // The Android wrapper loads a local file:// WebView. Use its native
    // LocationManager bridge first; browser geolocation remains the web fallback.
    if(window.TwendeAndroid && typeof window.TwendeAndroid.requestCurrentLocation==="function"){
      return new Promise((resolve,reject)=>{
        let settled=false;
        const timer=setTimeout(()=>finish(new Error("Android GPS did not respond. Turn on Precise Location and try again outdoors.")),45000);
        function finish(error,position){
          if(settled)return;settled=true;clearTimeout(timer);
          window.onTwendeNativeLocation=null;
          if(error)reject(error);else resolve(position);
        }
        window.onTwendeNativeLocation=(lat,lng,accuracy,error)=>{
          if(error){finish(new Error(error));return;}
          if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng))){finish(new Error("Android returned an invalid location. Check your phone GPS."));return;}
          const metres=Number(accuracy)||Infinity;
          if(metres>100){finish(new Error("Your GPS accuracy is about "+Math.round(metres)+" metres. Enable Precise Location and wait for a stronger GPS signal outdoors."));return;}
          finish(null,{coords:{latitude:Number(lat),longitude:Number(lng),accuracy:metres}});
        };
        try{window.TwendeAndroid.requestCurrentLocation();}
        catch(error){finish(new Error("Could not start Android GPS: "+error.message));}
      });
    }
    if(!navigator.geolocation)throw new Error("This browser does not support GPS. Please enable location services or select your pickup on the map.");
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>{
      const accuracy=Number(position.coords.accuracy)||Infinity;
      if(accuracy>100){reject(new Error("Your location is only accurate to about "+Math.round(accuracy)+" metres. Turn on Precise Location and GPS, then try again outdoors."));return;}
      resolve(position);
    },error=>{
      if(error.code===1)reject(new Error("Location permission is blocked. Allow precise location access for TWENDE in Android settings."));
      else if(error.code===2)reject(new Error("Your device could not determine its location. Turn on Location/GPS and try again, or tap your pickup point on the map."));
      else if(error.code===3)reject(new Error("GPS took too long. Move somewhere with a clearer sky view and try again, or tap your pickup point on the map."));
      else reject(new Error("GPS could not find your location. Check device location settings and try again."));
    },{enableHighAccuracy:true,timeout:45000,maximumAge:0}));
  }
  async function locate(){
    setStatus("Requesting your phone's GPS location…");
    const pos=await getDevicePosition();
    userPoint={lat:pos.coords.latitude,lng:pos.coords.longitude,label:"Current GPS location ("+pos.coords.latitude.toFixed(5)+", "+pos.coords.longitude.toFixed(5)+")"};
    window.twendePickupCoords=userPoint;
    $("#ridePickup").value=userPoint.label;
    if($("#twendePickupSearch"))$("#twendePickupSearch").value=userPoint.label;
    const locationLabel=$("#twendeCurrentLocation");
    if(locationLabel)locationLabel.textContent="Finding your address…";
    destinationPoint=null;
    window.twendeDestinationCoords=null;
    $("#rideDestination").value="";
    setStatus("GPS found your pickup. Updating the address…");
    $("#twendeMapDetails").hidden=false;
    const grid=home.querySelector(".service-grid");
    if(grid)grid.classList.remove("twende-services-hidden");
    try{
      await ensureMap();
      showPickup();
      map.setView([userPoint.lat,userPoint.lng],16);
      setTimeout(()=>map&&map.invalidateSize(true),120);
      await refreshDrivers();
    }catch(error){
      console.warn("TWENDE map display:",error);
      setStatus("Your GPS pickup is saved, but the map could not load. You can still book a TWENDE taxi.");
    }
    reverse(userPoint.lat,userPoint.lng).then(address=>{
      if(address){
        userPoint.label=address;
        $("#ridePickup").value=address;
        if(locationLabel)locationLabel.textContent=address;
      }else if(locationLabel)locationLabel.textContent="Current GPS location";
      setStatus("Pickup located by GPS. Enter your destination under Where to?.");
    }).catch(()=>{
      if(locationLabel)locationLabel.textContent="Current GPS location";
      setStatus("Pickup located by GPS. Enter your destination under Where to?.");
    });
    return userPoint;
  }
  async function searchPlaces(q){
    const query=q.trim();
    if(query.length<3)return [];
    const normalizedInput=query.toLowerCase();
    // Known Mufumbwe destinations take priority over broad geocoder hits.
    // This keeps the district hospital selectable even if Photon returns a
    // generic "hospital" or a less relevant place first.
    const localQuery=query.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const isNearMufumbwe=!userPoint || (Math.abs(userPoint.lat+13.14)<0.35 && Math.abs(userPoint.lng-25.02)<0.45);
    if(/^mufumbwe(?: district)?(?:,.*)?$/i.test(query)){
      return [{lat:-13.13683,lng:25.00296,label:"Mufumbwe Town Centre, Mufumbwe, North-Western Province, Zambia"}];
    }
    if((localQuery.includes("mufumbwe") && (localQuery.includes("hospital") || localQuery.includes("district"))) ||
       (isNearMufumbwe && (localQuery==="hospital" || localQuery==="district hospital" || localQuery==="mufumbwe hospital"))){
      return [{lat:-13.144667,lng:25.034417,label:"Mufumbwe District Hospital, Mufumbwe, North-Western Province, Zambia"}];
    }
    const normalized=normalizedInput.replace(/\\s+/g," ");
    if(cache.has(normalized))return cache.get(normalized);
    const center=userPoint||{lat:fallbackCenter[0],lng:fallbackCenter[1]};
    const found=[],seen=new Set();
    const add=(lat,lng,label)=>{
      lat=Number(lat);lng=Number(lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -18.5||lat > -8||lng < 21||lng > 34)return;
      const key=lat.toFixed(4)+","+lng.toFixed(4);
      if(seen.has(key))return;
      seen.add(key);found.push({lat,lng,label});
    };
    // Search globally across Zambia: never force results to Mufumbwe.
    
    // Photon provides towns, streets, landmarks, businesses and many public places.
    try{
      const url="https://photon.komoot.io/api/?q="+encodeURIComponent(query+", Zambia")+"&lat="+center.lat+"&lon="+center.lng+"&limit=15&lang=en";
      const r=await fetch(url);if(r.ok){
        const j=await r.json();
        for(const f of (j.features||[])){
          const p=f.properties||{};
          const label=[p.name,p.street,p.city,p.district,p.county,p.state,"Zambia"].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(", ");
          add(f.geometry?.coordinates?.[1],f.geometry?.coordinates?.[0],label||query);
        }
      }
    }catch(e){console.warn("Photon search:",e);}
    // Add named OpenStreetMap features across Mufumbwe and North-Western Province.
    // This covers schools, health facilities, markets, roads and named compounds
    // where those features have been mapped by local contributors.
    try{
      const term=query.trim().replace(/[.*+?^${}()|[\]\\]/g,"\\    }catch(e){console.warn("Photon search:",e);}
    // Use slower school-register and Nominatim lookups only if Photon found nothing.
    if(found.length){const result=found.slice(0,15);cache.set(normalized,result);return result;}").slice(0,70);
      const bbox="(-14.8,21.5,-8.0,26.8)"; // South, West, North, East: North-Western Province search area
      const qLower=query.toLowerCase();
      const selectors=[];
      if(/school|primary|secondary|college|university|class|academy/.test(qLower)){
        selectors.push('nwr["amenity"~"school|college|university|kindergarten|training" i]'+bbox+';');
      }
      if(/hospital|clinic|health|medical|dispensary|pharmacy/.test(qLower)){
        selectors.push('nwr["amenity"~"hospital|clinic|doctors|health_post|pharmacy" i]'+bbox+';');
      }
      if(/market|trading|shop/.test(qLower)){
        selectors.push('nwr["amenity"="marketplace"]'+bbox+';');
        selectors.push('nwr["shop"="market"]'+bbox+';');
      }
      if(/road|street|avenue|highway/.test(qLower)){
        selectors.push('way["highway"]["name"~"'+term+'",i]'+bbox+';');
      }
      if(/compound|township|residential|neighbourhood|neighborhood/.test(qLower)){
        selectors.push('nwr["place"~"suburb|neighbourhood|quarter|residential" i]'+bbox+';');
        selectors.push('nwr["landuse"="residential"]["name"~"'+term+'",i]'+bbox+';');
      }
      if(!selectors.length) selectors.push('nwr["name"~"'+term+'",i]'+bbox+';');
      const overpassQuery='[out:json][timeout:18];('+selectors.join('')+');out center tags 30;';
      const body=new URLSearchParams({data:overpassQuery});
      const response=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body});
      if(response.ok){
        const data=await response.json();
        for(const element of (data.elements||[])){
          const tags=element.tags||{};
          const lat=element.lat??element.center?.lat;
          const lng=element.lon??element.center?.lon;
          const name=tags.name||tags["name:en"]||tags["name:local"]||query;
          const district=tags["addr:district"]||tags["is_in:district"]||"";
          const category=tags.amenity||tags.shop||tags.highway||tags.place||tags.landuse||"";
          const label=[name,category,district,"North-Western Province","Zambia"].filter(Boolean).join(", ");
          add(lat,lng,label);
        }
      }
    }catch(e){console.warn("North-Western OpenStreetMap place search:",e);}
    // Keep a good result set from both Photon and the regional OSM feature search.
    if(found.length){const result=found.slice(0,15);cache.set(normalized,result);return result;}
    // Zambia GRID3/NSDI operational school point register. This is a
    // province-wide school dataset compiled from ZamStats and Ministry of
    // General Education sources; query North-Western Province by school name.
    try{
      const term=query.replace(/'/g,"''").toUpperCase();
      const where="Province = 'North-Western' AND (UPPER(Name) LIKE '%"+term+"%' OR UPPER(Orig_Name) LIKE '%"+term+"%')";
      const params=new URLSearchParams({where,outFields:"Name,Orig_Name,Type,SubType,Province,District,LAT,LONG",returnGeometry:"false",resultRecordCount:"100",f:"json"});
      const url="https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services/GRID3_ZMB_School_v01beta/FeatureServer/0/query?"+params.toString();
      const r=await fetch(url);if(r.ok){
        const j=await r.json();
        for(const feature of (j.features||[])){
          const a=feature.attributes||{};
          const name=a.Name||a.Orig_Name||query;
          add(a.LAT,a.LONG,[name,a.District,a.Province,"Zambia"].filter(Boolean).join(", "));
        }
      }
    }catch(e){console.warn("North-Western school register search:",e);}
    // Explicitly support the Mufumbwe school names supplied for TWENDE.
    // The official school register and geocoder provide the coordinates;
    // these aliases improve matching when names differ slightly.
    const mufumbweSchools=[
      "Shukwe West","Shukwe East","Katumba Primary","Chizela Primary","Mufumbwe Secondary",
      "Kakikasa Primary","Kalende Secondary","Kalende Bible College","Mufumbwe Boarding",
      "Kafwebu","Kakilufya Primary","Kyamwina Primary","Kabambo Primary","Kamabuta Primary",
      "Kamabuta Secondary","Kifuwe Primary","Kamahembe Primary","Matushi Primary",
      "Wishimanga Secondary","Kamazovu Primary","Kashima East Primary","Kashima West Secondary",
      "Chilemba Secondary","Lumwe Primary","Lumwe East Primary","Munyambala Primary","Kalengwa Primary"
    ];
    const normalizedSchoolQuery=query.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const matchingMufumbweSchools=mufumbweSchools.filter(name=>{
      const n=name.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
      return n.includes(normalizedSchoolQuery)||normalizedSchoolQuery.includes(n);
    });
    // If the government point layer does not contain a supplied school name,
    // ask the geocoder specifically for that school in Mufumbwe, Zambia.
    for(const schoolName of matchingMufumbweSchools){
      try{
        const params=new URLSearchParams({format:"jsonv2",q:schoolName+", Mufumbwe, North-Western Province, Zambia",countrycodes:"zm",limit:"3",addressdetails:"1"});
        const r=await fetch("https://nominatim.openstreetmap.org/search?"+params.toString(),{headers:{Accept:"application/json"}});
        if(r.ok){const rows=await r.json();for(const item of rows||[])add(item.lat,item.lon,[schoolName,"Mufumbwe","North-Western Province","Zambia"].join(", "));}
      }catch(e){console.warn("Mufumbwe school lookup:",schoolName,e);}
    }
    // Verified official facility entry: Mufumbwe District Hospital.
    // Keep this local record so the exact hospital remains searchable even when
    // third-party geocoders omit or mislabel the facility.
    const normalizedQuery=query.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    if(normalizedQuery.includes("mufumbwe") && (normalizedQuery.includes("hospital") || normalizedQuery.includes("district"))){
      add(-13.144667,25.034417,"Mufumbwe District Hospital, Mufumbwe, North-Western Province, Zambia");
    }
    // Nominatim fallback broadens results to named places throughout Zambia.
    try{
      const params=new URLSearchParams({format:"jsonv2",q:query+", Zambia",countrycodes:"zm",limit:"10",addressdetails:"1"});
      const r=await fetch("https://nominatim.openstreetmap.org/search?"+params.toString(),{headers:{Accept:"application/json"}});
      if(r.ok){const rows=await r.json();for(const item of rows||[])add(item.lat,item.lon,item.display_name||query);}
    }catch(e){console.warn("Nominatim search:",e);}
    // Verified directory fallback for Mufumbwe District Hospital.
    // Coordinates cross-checked against Zambia's consolidated health-facility register.
    if (/mufumbwe.*district.*hospital|district.*hospital.*mufumbwe|mufumbwe hospital/i.test(query)) {
      add(-13.144667,25.034417,"Mufumbwe District Hospital, Mufumbwe, North-Western Province, Zambia");
    }
    const result=found.slice(0,15);cache.set(normalized,result);return result;
  }
  function addSearch(inputId,resultsId,onSelect){
    const input=$("#"+inputId),results=$("#"+resultsId);let timer=null;
    input.addEventListener("input",()=>{
      clearTimeout(timer);const q=input.value.trim();if(q.length<3){results.replaceChildren();return;}
      timer=setTimeout(async()=>{
        try{
          const places=await searchPlaces(q);
          results.replaceChildren(...places.map(p=>{
            const b=document.createElement("button");b.type="button";b.textContent=p.label;
            b.addEventListener("click",()=>{input.value=p.label;results.replaceChildren();onSelect(p);});
            return b;
          }));
          if(!places.length){const p=document.createElement("p");p.className="muted";p.textContent="No matching places found. Try a nearby landmark or town.";results.replaceChildren(p);}
        }catch(e){setStatus(e.message);}
      },350);
    });
  }
  async function drawRoute(){
    if(!userPoint||!destinationPoint)return;
    await ensureMap();
    const url="https://router.project-osrm.org/route/v1/driving/"+userPoint.lng+","+userPoint.lat+";"+destinationPoint.lng+","+destinationPoint.lat+"?overview=full&geometries=geojson";
    const r=await fetch(url);if(!r.ok)throw new Error("Could not calculate the route.");
    const j=await r.json();if(j.code!=="Ok"||!j.routes?.length)throw new Error("No road route was found for those locations.");
    if(routeLayer)map.removeLayer(routeLayer);
    routeLayer=L.geoJSON(j.routes[0].geometry,{style:{color:"#d71920",weight:5,opacity:.8}}).addTo(map);
    map.fitBounds(routeLayer.getBounds().pad(.15));
    setStatus("Route found: "+(j.routes[0].distance/1000).toFixed(1)+" km • "+Math.round(j.routes[0].duration/60)+" min estimated driving time.");
  }
  async function refreshDrivers(){
    if(!userPoint)return;
    if(!window.twendeDb||!window.currentTwendeUser){setStatus("Map is ready. Sign in or set your pickup to see available TWENDE drivers.");return;}
    try{
      const {data,error}=await window.twendeDb.rpc("get_nearby_twende_drivers",{p_latitude:userPoint.lat,p_longitude:userPoint.lng,p_radius_km:15});
      if(error)throw error;
      const rows=data||[],active=new Set(rows.map(x=>x.driver_id));
      for(const [id,m] of driverMarkers){if(!active.has(id)){map.removeLayer(m);driverMarkers.delete(id);}}
      for(const d of rows){
        const p=[Number(d.latitude),Number(d.longitude)];
        let marker=driverMarkers.get(d.driver_id);
        const car=d.vehicle_type==="car";
        if(!marker){marker=L.marker(p,{icon:pin(car?"#1769aa":"#198754",car?"🚕":"🏍️")}).addTo(map);driverMarkers.set(d.driver_id,marker);}
        else marker.setLatLng(p);
        const safe=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
        const photo=d.vehicle_photo_url?'<img src="'+safe(d.vehicle_photo_url)+'" alt="Vehicle photo" style="width:100%;max-width:230px;height:125px;object-fit:cover;border-radius:9px;margin-bottom:7px">':'';
        const vehicleName=[d.vehicle_make,d.vehicle_model].filter(Boolean).map(safe).join(" ")|| (car?"Car taxi":"Motorcycle taxi");
        const details='<div style="min-width:190px;max-width:245px">'+photo+
          '<strong>'+vehicleName+'</strong><br>'+
          'Colour: <strong>'+safe(d.vehicle_color||"Not provided")+'</strong><br>'+
          'Registration: <strong>'+safe(d.plate_number||"Not provided")+'</strong><br>'+
          '<span style="color:#16803c;font-weight:700">Available • Online</span></div>';
        marker.bindPopup(details);
        // Keep the actual vehicle identity visible beside its map marker,
        // rather than showing only a generic car/motorcycle icon.
        const markerLabel=vehicleName+" • "+safe(d.plate_number||"Registration unavailable");
        marker.bindTooltip(markerLabel,{permanent:true,direction:"top",offset:[0,-24],opacity:0.96,className:"twende-vehicle-map-label"});
      }
      setStatus(rows.length?rows.length+" nearby TWENDE driver"+(rows.length===1?"":"s")+" online within 15 km.":"No online TWENDE taxis found within 15 km yet. Try again shortly.");
    }catch(e){console.warn("Nearby TWENDE drivers:",e);setStatus("Nearby taxis could not be loaded. Apply the passenger nearby-drivers database migration and check your connection.");}
  }
  // GPS is the only initial pickup action. Once located, the map and both
  // branded service cards are revealed; their original app.js booking handlers
  // open the matching booking dialog directly.
  $("#twendeLocateMe").addEventListener("click",async()=>{
    const button=$("#twendeLocateMe");
    button.disabled=true;
    button.textContent="Locating…";
    try{
      await locate();
      setStatus("Your location is set. Enter where you want to go, then choose a TWENDE taxi.");
    }catch(error){
      setStatus(error.message||"Could not get your current location. Check device GPS permissions and try again.");
    }finally{
      button.disabled=false;
      button.textContent="Use GPS";
    }
  });
  $("#twendePickupSearch").addEventListener("input",()=>{
    const value=$("#twendePickupSearch").value.trim();
    $("#ridePickup").value=value;
    if(value)window.twendePickupCoords=null;
  });
  $("#twendeDestinationSearch").addEventListener("input",()=>{
    const typed=$("#twendeDestinationSearch").value.trim();
    if(typed){$("#rideDestination").value=typed;}
    else{$("#rideDestination").value="";destinationPoint=null;window.twendeDestinationCoords=null;}
  });
  addSearch("twendeDestinationSearch","twendeDestinationResults",async place=>{
    destinationPoint=place;
    window.twendeDestinationCoords=place;
    $("#rideDestination").value=place.label;
    if(userPoint){
      try{
        await ensureMap();
        showPickup();showDestination();
        map.fitBounds([[userPoint.lat,userPoint.lng],[place.lat,place.lng]],{padding:[30,30]});
        drawRoute().catch(error=>console.warn("TWENDE route preview:",error));
      }catch(error){console.warn("TWENDE destination map:",error);}
    }
    setStatus("Destination selected. Choose Book TWENDE Taxi or Book TWENDE Motorcycle.");
  });
  // Taxi cards open the booking dialog directly from their own click action.
  window.addEventListener("twende-session-ready",()=>{if(map&&userPoint)refreshDrivers();});
  const originalRefresh=window.refreshTwendeRideViews;
  window.refreshTwendeRideViews=async()=>{await originalRefresh?.();if(map&&userPoint)await refreshDrivers();};
  refreshTimer=setInterval(()=>{if(map&&userPoint&&window.currentTwendeUser)refreshDrivers();},45000);
  window.addEventListener("beforeunload",()=>clearInterval(refreshTimer));
  $("#twendeMapDetails")?.addEventListener("toggle",()=>{if($("#twendeMapDetails").open)ensureMap().then(()=>setTimeout(()=>map?.invalidateSize(true),100)).catch(e=>setStatus(e.message));});
})();