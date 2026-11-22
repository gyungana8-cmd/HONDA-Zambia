/* TWENDE Admin-managed passenger homepage imagery.
   Public can view published images; only signed-in TWENDE admins can upload/change them. */
(function(){
  const db=window.twendeDb;
  if(!db)return;
  const bucket="twende-homepage-assets";
  const fields=[
    {key:"hero_background_path",label:"Homepage background",help:"Wide landscape photo or designed banner for the top of the passenger homepage.",accept:"image/jpeg,image/png,image/webp"},
    {key:"hero_car_path",label:"TWENDE car image",help:"Prefer a clear vehicle photo or transparent PNG/WebP, without a visible number plate.",accept:"image/jpeg,image/png,image/webp"},
    {key:"hero_motorcycle_path",label:"TWENDE motorcycle image",help:"Prefer a clear motorcycle photo or transparent PNG/WebP, without a visible number plate.",accept:"image/jpeg,image/png,image/webp"}
  ];
  let settings={id:"passenger",hero_background_path:null,hero_car_path:null,hero_motorcycle_path:null};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const publicUrl=path=>path?db.storage.from(bucket).getPublicUrl(path).data.publicUrl:null;
  function apply(){
    const hero=document.querySelector(".twende-passenger-hero");
    if(!hero)return;
    let bg=hero.querySelector(".twende-hero-admin-background");
    if(!bg){bg=document.createElement("div");bg.className="twende-hero-admin-background";bg.setAttribute("aria-hidden","true");hero.prepend(bg);}
    const bgUrl=publicUrl(settings.hero_background_path);
    bg.style.backgroundImage=bgUrl?"url('"+bgUrl.replace(/'/g,"%27")+"')":"none";
    const car=hero.querySelector(".twende-hero-car");
    const bike=hero.querySelector(".twende-hero-motorcycle");
    if(car&&settings.hero_car_path)car.src=publicUrl(settings.hero_car_path);
    if(bike&&settings.hero_motorcycle_path)bike.src=publicUrl(settings.hero_motorcycle_path);
  }
  async function load(){
    const {data,error}=await db.from("twende_homepage_settings").select("*").eq("id","passenger").maybeSingle();
    if(!error&&data)settings={...settings,...data};
    apply();
  }
  function renderAdminPanel(){
    const host=document.getElementById("adminContent");
    if(!host||host.querySelector("#twendeHomepageMediaAdmin"))return;
    const panel=document.createElement("section");
    panel.id="twendeHomepageMediaAdmin";
    panel.className="dash-card";
    panel.innerHTML='<h3>Passenger homepage appearance</h3>'+
      '<p class="muted">Change the passenger homepage images here. Updates appear on the passenger homepage without rebuilding or reinstalling the Android app.</p>'+
      '<div class="twende-homepage-media-grid">'+fields.map(f=>{
        const url=publicUrl(settings[f.key]);
        return '<article class="twende-homepage-media-item"><strong>'+f.label+'</strong><p class="muted">'+f.help+'</p>'+
          (url?'<img class="twende-homepage-media-preview" src="'+esc(url)+'" alt="'+f.label+' preview">':'<div class="twende-homepage-media-empty">Using default image</div>')+
          '<label class="twende-homepage-media-file">Choose image<input type="file" accept="'+f.accept+'" data-homepage-file="'+f.key+'"></label>'+
          '<button type="button" class="btn btn-outline" data-homepage-reset="'+f.key+'" '+(!settings[f.key]?'disabled':'')+'>Restore default</button>'+
          '</article>';
      }).join("")+'</div><p class="muted">Image formats: JPG, PNG or WebP. Maximum size: 8 MB per image.</p>'+
      '<p class="twende-homepage-media-status" id="twendeHomepageMediaStatus" role="status" aria-live="polite"></p>';
    host.appendChild(panel);
    const status=panel.querySelector("#twendeHomepageMediaStatus");
    panel.addEventListener("change",async e=>{
      const input=e.target.closest("[data-homepage-file]");
      if(!input||!input.files?.[0])return;
      const file=input.files[0],key=input.dataset.homepageFile;
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)){status.textContent="Please choose a JPG, PNG or WebP image.";input.value="";return;}
      if(file.size>8*1024*1024){status.textContent="Image is larger than 8 MB. Please choose a smaller image.";input.value="";return;}
      input.disabled=true;status.textContent="Uploading "+file.name+"…";
      try{
        const {data:userData,error:userError}=await db.auth.getUser();
        if(userError||!userData?.user)throw new Error("Please sign in again as a TWENDE administrator.");
        const ext=file.type==="image/jpeg"?"jpg":file.type==="image/png"?"png":"webp";
        const path=key+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+ext;
        const {error:uploadError}=await db.storage.from(bucket).upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
        if(uploadError)throw uploadError;
        const next={...settings,[key]:path,updated_at:new Date().toISOString(),updated_by:userData.user.id};
        const {error:saveError}=await db.from("twende_homepage_settings").upsert(next,{onConflict:"id"});
        if(saveError){await db.storage.from(bucket).remove([path]);throw saveError;}
        settings=next;apply();status.textContent="Image updated successfully. Refresh the passenger homepage to see the new image.";
        panel.remove();renderAdminPanel();
      }catch(err){status.textContent="Upload failed: "+(err.message||"Please try again.");}
      finally{input.disabled=false;input.value="";}
    });
    panel.addEventListener("click",async e=>{
      const button=e.target.closest("[data-homepage-reset]");
      if(!button)return;
      const key=button.dataset.homepageReset;
      if(!confirm("Restore the default "+fields.find(f=>f.key===key).label.toLowerCase()+"?"))return;
      button.disabled=true;status.textContent="Restoring default image…";
      try{
        const {data:userData,error:userError}=await db.auth.getUser();
        if(userError||!userData?.user)throw new Error("Please sign in again as a TWENDE administrator.");
        const next={...settings,[key]:null,updated_at:new Date().toISOString(),updated_by:userData.user.id};
        const {error}=await db.from("twende_homepage_settings").upsert(next,{onConflict:"id"});
        if(error)throw error;
        settings=next;apply();panel.remove();renderAdminPanel();
      }catch(err){status.textContent="Could not restore default: "+(err.message||"Please try again.");button.disabled=false;}
    });
  }
  window.twendeHomepageMedia={loadSettings:load,renderAdminPanel};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",load,{once:true});else load();
})();