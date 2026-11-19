/* TWENDE passenger live map: pickup, destination, route and nearby online taxis. */
(() => {
  const $ = s => document.querySelector(s);
  const home = $("#ride-services");
  if (!home) return;
  const style = document.createElement("style");
  style.textContent = `
    .twende-live-panel{margin:22px 0 28px;padding:18px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:0 8px 28px #1018200c}
    .twende-live-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .twende-live-controls label{display:grid;gap:6px;font-size:12px;font-weight:750}
    .twende-live-controls input,.twende-live-controls select{width:100%;padding:12px;border:1px solid #d9dde0;border-radius:8px;background:#fff}
    .twende-live-actions{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}
    #twendePassengerMap{height:340px;min-height:280px;border-radius:10px;background:#edf0f2;overflow:hidden;z-index:1}
    .twende-map-status{font-size:12px;color:var(--muted);margin:8px 0}
    .twende-place-results{position:relative;z-index:4;display:grid;gap:4px}
    .twende-place-results button{text-align:left;background:#fff;border:1px solid var(--line);border-radius:7px;padding:10px;color:var(--ink)}
    .twende-map-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:10px}
    .twende-map-dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;background:#d71920}
    .twende-map-dot.car{background:#1769aa}.twende-map-dot.bike{background:#198754}.twende-map-dot.dest{background:#7c3aed}
    @media(max-width:600px){.twende-live-controls{grid-template-columns:1fr}#twendePassengerMap{height:300px}}
  `;
  document.head.append(style);
  const panel=document.createElement("section");
  panel.className="twende-live-panel";
  panel.innerHTML=`
    <div class="twende-location-fields">
      <label class="twende-location-field"><span class="twende-location-symbol pickup-symbol" aria-hidden="true"></span><input id="twendePickupSearch" type="text" value="Mufumbwe, Mufumbwe District, North-Western Province" placeholder="Enter pickup location" autocomplete="off" aria-label="Pickup location"></label>
      <div id="twendePickupResults" class="twende-place-results"></div>
      <label class="twende-location-field"><span class="twende-location-symbol destination-symbol" aria-hidden="true">◎</span><input id="twendeDestinationSearch" type="search" value="Mufumbwe District Hospital, Mufumbwe" placeholder="Enter destination" autocomplete="off" aria-label="Destination"></label>
      <div id="twendeDestinationResults" class="twende-place-results"></div>
      <button class="twende-use-location" id="twendeLocateMe" type="button"><span aria-hidden="true">➤</span> Use my current location</button>
    </div>
    <div class="twende-location-extra">
      <button class="btn btn-outline" id="twendeMufumbwePickup" type="button">Choose pickup on map</button>
      <select id="twendeMapService" aria-label="Taxi type"><option value="car">Car taxi</option><option value="motorcycle">Motorcycle taxi</option></select>
      <button class="btn btn-outline" id="twendeContinueBooking" type="button">Continue to booking</button>
    </div>
    <p id="twendeMapStatus" class="twende-map-status" role="status">Edit your pickup and destination, or use your current location.</p>
    <details id="twendeMapDetails" class="twende-map-details"><summary>View map and choose a location</summary>
      <div id="twendePassengerMap" aria-label="Map showing pickup, destination and nearby TWENDE taxis"></div>
      <div class="twende-map-legend"><span><i class="twende-map-dot"></i>Pickup</span><span><i class="twende-map-dot dest"></i>Destination</span><span><i class="twende-map-dot car"></i>Car taxi</span><span><i class="twende-map-dot bike"></i>Motorcycle taxi</span></div>
    </details>
  `;
  const serviceGrid=home.querySelector(".service-grid");
  if(serviceGrid) home.insertBefore(panel,serviceGrid);
  else home.append(panel);

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
    // Let passengers choose an exact pickup or destination by tapping the map.
    map.on("click",async event=>{
      const point={lat:event.latlng.lat,lng:event.latlng.lng};
      try{
        const label=await reverse(point.lat,point.lng);
        if(!userPoint){
          userPoint={...point,label};
          window.twendePickupCoords=userPoint;
          $("#twendePickupSearch").value=label;
          $("#ridePickup").value=label;
          showPickup();
          setStatus("Pickup selected on map. You can now choose your destination.");
        }else if(!destinationPoint){
          destinationPoint={...point,label};
          window.twendeDestinationCoords=destinationPoint;
          $("#twendeDestinationSearch").value=label;
          $("#rideDestination").value=label;
          showDestination();
          setStatus("Destination selected on map. Ready to continue to booking.");
          await drawRoute();
        }else{
          destinationPoint={...point,label};
          window.twendeDestinationCoords=destinationPoint;
          $("#twendeDestinationSearch").value=label;
          $("#rideDestination").value=label;
          showDestination();
          setStatus("Destination updated on map.");
          await drawRoute();
        }
      }catch(error){setStatus("Could not read that map location. Try another point or use GPS.");}
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
        const parts=[road,locality,a.city_district,a.state,a.country].filter(Boolean);
        const label=[...new Set(parts)].join(", ");
        if(label)return label;
        if(data.display_name)return data.display_name;
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
  async function locate(){
    if(!navigator.geolocation)throw new Error("This browser does not support GPS. Please enable location services or select your pickup on the map.");
    setStatus("Requesting GPS permission…");
    const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,error=>{
      if(error.code===1)reject(new Error("Location permission is blocked. In Chrome, select the site icon beside the address, open Site settings, set Location to Allow, then reload TWENDE."));
      else if(error.code===2)reject(new Error("Your device could not determine its location. Turn on Location/GPS and try again, or tap your pickup point on the map."));
      else if(error.code===3)reject(new Error("GPS took too long. Move somewhere with a clearer sky view and try again, or tap your pickup point on the map."));
      else reject(new Error("GPS could not find your location. Check device location settings and try again."));
    },{enableHighAccuracy:true,timeout:30000,maximumAge:0}));
    // Save exact coordinates immediately. Address lookup is helpful, but must
    // never prevent a valid GPS fix from becoming the passenger's pickup.
    userPoint={lat:pos.coords.latitude,lng:pos.coords.longitude,label:"Current GPS location ("+pos.coords.latitude.toFixed(5)+", "+pos.coords.longitude.toFixed(5)+")"};
    window.twendePickupCoords=userPoint;
    $("#twendePickupSearch").value=userPoint.label;
    $("#ridePickup").value=userPoint.label;
    destinationPoint=null;
    window.twendeDestinationCoords=null;
    $("#twendeDestinationSearch").value="";
    $("#rideDestination").value="";
    await ensureMap();showPickup();map.setView([userPoint.lat,userPoint.lng],17);
    setStatus("GPS found your pickup. Getting the street address…");
    const address=await reverse(userPoint.lat,userPoint.lng);
    if(address && address!=="Current GPS location"){
      userPoint.label=address;
      $("#twendePickupSearch").value=address;
      $("#ridePickup").value=address;
    }
    setStatus("Pickup located by GPS. Choose your destination on the map or search for a place.");
    await refreshDrivers();
    return userPoint;
  }
  async function searchPlaces(q){
    if(q.trim().length<3)return [];
    const center=userPoint||{lat:fallbackCenter[0],lng:fallbackCenter[1]};
    const found=[],seen=new Set();
    // Prioritise Mufumbwe District Hospital for any Mufumbwe search,
    // including the short query "Mufumbwe". Add it before remote providers
    // so the 15-result limit cannot hide this important destination.
    if (/^mufumbwe(?: district)?$/i.test(q.trim())) {
      // Town-centre pin is the safe default for a broad Mufumbwe pickup query;
      // do not use the district-wide centroid for a local taxi fare.
      const townLat=-13.13683,townLng=25.00296;
      const townKey=townLat.toFixed(4)+","+townLng.toFixed(4);
      seen.add(townKey);
      found.push({lat:townLat,lng:townLng,label:"Mufumbwe Town Centre, Mufumbwe, North-Western Province, Zambia"});
    }
    if (/mufumbwe/i.test(q)) {
      const hospitalLat=-13.144667, hospitalLng=25.034417;
      const hospitalKey=hospitalLat.toFixed(4)+","+hospitalLng.toFixed(4);
      seen.add(hospitalKey);
      found.push({lat:hospitalLat,lng:hospitalLng,label:"Mufumbwe District Hospital, Mufumbwe, North-Western Province, Zambia"});
    }
    const add=(lat,lng,label)=>{
      lat=Number(lat);lng=Number(lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -18.5||lat > -8||lng < 21||lng > 34)return;
      const key=lat.toFixed(4)+","+lng.toFixed(4);
      if(seen.has(key))return;
      seen.add(key);found.push({lat,lng,label});
    };
    // Search globally across Zambia: never force results to Mufumbwe.
    const query=q.trim();
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
    return found.slice(0,15);
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
        marker.bindPopup((car?"Car taxi":"Motorcycle taxi")+" • Online");
      }
      setStatus(rows.length?rows.length+" nearby TWENDE driver"+(rows.length===1?"":"s")+" online within 15 km.":"No online TWENDE taxis found within 15 km yet. Try again shortly.");
    }catch(e){console.warn("Nearby TWENDE drivers:",e);setStatus("Nearby taxis could not be loaded. Apply the passenger nearby-drivers database migration and check your connection.");}
  }
  // If a passenger edits a previously selected place, invalidate its old
  // coordinates immediately so the next search/fare uses the new address.
  $("#twendePickupSearch").addEventListener("input",()=>{
    if(userPoint && $("#twendePickupSearch").value.trim()!==userPoint.label){
      userPoint=null;window.twendePickupCoords=null;
      if(pickupMarker&&map){map.removeLayer(pickupMarker);pickupMarker=null;}
      if(routeLayer&&map){map.removeLayer(routeLayer);routeLayer=null;}
      setStatus("Pickup changed. Select a search result or continue to find the new place.");
    }
  });
  $("#twendeDestinationSearch").addEventListener("input",()=>{
    if(destinationPoint && $("#twendeDestinationSearch").value.trim()!==destinationPoint.label){
      destinationPoint=null;window.twendeDestinationCoords=null;
      if(destinationMarker&&map){map.removeLayer(destinationMarker);destinationMarker=null;}
      if(routeLayer&&map){map.removeLayer(routeLayer);routeLayer=null;}
      setStatus("Destination changed. Select a search result or continue to find the new place.");
    }
  });
  addSearch("twendePickupSearch","twendePickupResults",async p=>{
    userPoint=p;window.twendePickupCoords=p;$("#ridePickup").value=p.label;
    try{await ensureMap();showPickup();map.setView([p.lat,p.lng],15);await refreshDrivers();if(destinationPoint)await drawRoute();}
    catch(e){setStatus(e.message);}
  });
  addSearch("twendeDestinationSearch","twendeDestinationResults",async p=>{
    destinationPoint=p;window.twendeDestinationCoords=p;$("#rideDestination").value=p.label;
    try{await ensureMap();showDestination();if(userPoint)await drawRoute();else setStatus("Destination selected. Set your pickup location to display the route.");}
    catch(e){setStatus(e.message);}
  });
  $("#twendeLocateMe").addEventListener("click",async()=>{
    const b=$("#twendeLocateMe");b.disabled=true;
    try{await locate();if(destinationPoint)await drawRoute();}
    catch(e){setStatus(e.message||"Could not locate you. Check GPS permission and internet connection.");}
    finally{b.disabled=false;}
  });
  $("#twendeMufumbwePickup").addEventListener("click",async()=>{
    const b=$("#twendeMufumbwePickup");b.disabled=true;
    try{
      userPoint=null;destinationPoint=null;
      window.twendePickupCoords=null;window.twendeDestinationCoords=null;
      $("#twendePickupSearch").value="";
      $("#twendeDestinationSearch").value="";
      $("#ridePickup").value="";
      $("#rideDestination").value="";
      if(pickupMarker&&map){map.removeLayer(pickupMarker);pickupMarker=null;}
      if(destinationMarker&&map){map.removeLayer(destinationMarker);destinationMarker=null;}
      if(routeLayer&&map){map.removeLayer(routeLayer);routeLayer=null;}
      await ensureMap();
      map.setView(fallbackCenter,14);
      setStatus("Mufumbwe map ready. Tap your actual pickup point on the map, or search for a nearby landmark.");
      $("#twendePassengerMap").scrollIntoView({block:"center",behavior:"smooth"});
    }catch(error){setStatus(error.message||"Could not open the Mufumbwe map. Please try again.");}
    finally{b.disabled=false;}
  });
  $("#twendeContinueBooking").addEventListener("click",async()=>{
    const button=$("#twendeContinueBooking");
    button.disabled=true;
    try{
      // Accept typed place names as well as suggestion clicks. Previously,
      // typing a pickup without tapping a suggestion left userPoint empty.
      if(!userPoint){
        const typedPickup=$("#twendePickupSearch").value.trim();
        if(!typedPickup){setStatus("Enter a pickup place or use GPS.");return;}
        setStatus("Finding your pickup place…");
        const matches=await searchPlaces(typedPickup);
        if(!matches.length){setStatus("Pickup place not found. Try a nearby town, school, clinic or landmark, or use GPS.");return;}
        userPoint=matches[0];
        window.twendePickupCoords=userPoint;
        $("#twendePickupSearch").value=userPoint.label;
        await ensureMap();showPickup();map.setView([userPoint.lat,userPoint.lng],15);
      }
      if(!destinationPoint){
        const typedDestination=$("#twendeDestinationSearch").value.trim();
        if(!typedDestination){setStatus("Enter and select a destination before continuing.");return;}
        setStatus("Finding your destination…");
        const matches=await searchPlaces(typedDestination);
        if(!matches.length){setStatus("Destination not found. Try a nearby town, school, clinic or landmark.");return;}
        destinationPoint=matches[0];
        window.twendeDestinationCoords=destinationPoint;
        $("#twendeDestinationSearch").value=destinationPoint.label;
        await ensureMap();showDestination();
      }
      $("#ridePickup").value=userPoint.label;$("#rideDestination").value=destinationPoint.label;
      window.twendePickupCoords=userPoint;window.twendeDestinationCoords=destinationPoint;
      await drawRoute();
      const service=$("#twendeMapService").value;
      const rideButton=document.querySelector('[data-ride-service="'+service+'"]');
      if(rideButton){
        rideButton.click();
        setTimeout(()=>{$("#ridePickup").value=userPoint.label;$("#rideDestination").value=destinationPoint.label;},250);
      }
    }catch(e){setStatus(e.message||"Could not prepare this booking. Please try another pickup or destination.");}
    finally{button.disabled=false;}
  });
  document.querySelectorAll("[data-ride-service]").forEach(b=>b.addEventListener("click",()=>{
    if(userPoint){window.twendePickupCoords=userPoint;setTimeout(()=>{$("#ridePickup").value=userPoint.label; if(destinationPoint)$("#rideDestination").value=destinationPoint.label;},180);}
  },true));
  // Let the passenger-facing taxi cards use the same place validation and booking path.
  document.addEventListener("click",event=>{
    const ride=event.target.closest("[data-ride-service]");
    if(!ride)return;
    if(window.twendeBookingViaLocation){window.twendeBookingViaLocation=false;return;}
    event.preventDefault();event.stopImmediatePropagation();
    $("#twendeMapService").value=ride.dataset.rideService;
    $("#twendeContinueBooking").click();
  },true);
  window.addEventListener("twende-session-ready",()=>{if(userPoint)refreshDrivers();});
  const originalRefresh=window.refreshTwendeRideViews;
  window.refreshTwendeRideViews=async()=>{await originalRefresh?.();if(userPoint)await refreshDrivers();};
  refreshTimer=setInterval(()=>{if(userPoint&&window.currentTwendeUser)refreshDrivers();},12000);
  window.addEventListener("beforeunload",()=>clearInterval(refreshTimer));
  $("#twendeMapDetails")?.addEventListener("toggle",()=>{if($("#twendeMapDetails").open)ensureMap().then(()=>setTimeout(()=>map?.invalidateSize(true),100)).catch(e=>setStatus(e.message));});
})();