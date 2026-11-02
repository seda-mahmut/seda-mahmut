"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ALLOWED_TYPES, MAX_FINAL_BYTES, MAX_ORIGINAL_BYTES, detectType, friendlyError, makeId, prepareImage } from "@/lib/images";
type Wish={id:string;name:string;message:string;created_at:string;owner_id:string|null};
type Photo={id:string;file_path:string;guest_name:string|null;created_at:string;owner_id:string|null};
const BUCKET="engagement-photos";

export default function Home(){
 const [wishes,setWishes]=useState<Wish[]>([]),[photos,setPhotos]=useState<Photo[]>([]);
 const [name,setName]=useState(""),[message,setMessage]=useState(""),[guestName,setGuestName]=useState("");
 const [busyWish,setBusyWish]=useState(false),[busyPhoto,setBusyPhoto]=useState(false),[notice,setNotice]=useState(""),[configError,setConfigError]=useState(false),[selectedPhotoIndex,setSelectedPhotoIndex]=useState<number|null>(null);
 const [photoNotice,setPhotoNotice]=useState(""),[photoNoticeError,setPhotoNoticeError]=useState(false),[selectedCount,setSelectedCount]=useState(0),[progress,setProgress]=useState("");
 const [userId,setUserId]=useState<string|null>(null),[deletingId,setDeletingId]=useState<string|null>(null),[deletingWishId,setDeletingWishId]=useState<string|null>(null);
 async function loadContent(){
  if(!supabase){setConfigError(true);return;}
  const [w,p]=await Promise.all([supabase.from("wishes").select("*").order("created_at",{ascending:false}),supabase.from("photos").select("*").order("created_at",{ascending:false})]);
  if(w.error) console.error(w.error.message); if(p.error) console.error(p.error.message);
  setWishes(w.data??[]);setPhotos(p.data??[]);
 }
 useEffect(()=>{
  // Her ziyaretçiye görünmez, anonim bir kimlik verilir. Böylece herkes sadece KENDİ yüklediği fotoğrafı silebilir.
  if(!supabase)return;
  const sb=supabase;
  (async()=>{
   try{
    const {data:{session}}=await sb.auth.getSession();
    if(session?.user){setUserId(session.user.id);return;}
    const {data,error}=await sb.auth.signInAnonymously();
    if(error){console.warn("Anonim giriş kapalı, silme özelliği çalışmayacak:",error.message);return;}
    setUserId(data.user?.id??null);
   }catch(err){console.warn("Anonim giriş hatası:",err);}
  })();
 },[]);
 useEffect(()=>{loadContent();if(!supabase)return;
  const ch=supabase.channel("engagement-live-updates")
   .on("postgres_changes",{event:"*",schema:"public",table:"wishes"},loadContent)
   .on("postgres_changes",{event:"*",schema:"public",table:"photos"},loadContent).subscribe();
  return()=>{supabase?.removeChannel(ch)};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function submitWish(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase)return;setBusyWish(true);setNotice("");
  const r=await supabase.from("wishes").insert({name:name.trim(),message:message.trim()});setBusyWish(false);
  if(r.error){setNotice("Mesajın gönderilemedi. Lütfen tekrar dene.");console.error(r.error.message);return;}
  setName("");setMessage("");setNotice("Güzel mesajın için çok teşekkür ederiz. ❤️");await loadContent();
 }
 async function deleteWish(w:Wish){
  if(!supabase||deletingWishId)return;
  if(!window.confirm("Bu mesaj silinsin mi? Bu işlem geri alınamaz."))return;
  setDeletingWishId(w.id);setNotice("");
  try{
   const r=await supabase.from("wishes").delete().eq("id",w.id).select("id");
   if(r.error)throw new Error(r.error.message);
   if(!r.data||r.data.length===0)throw new Error("Bu mesajı silme iznin yok. Sadece kendi yazdığın mesajı silebilirsin.");
   setNotice("Mesaj silindi.");
  }catch(err){
   console.error("Mesaj silme hatası:",err);
   setNotice(`Mesaj silinemedi: ${friendlyError(err instanceof Error?err.message:String(err))}`);
  }finally{setDeletingWishId(null);}
  await loadContent();
 }
 async function uploadPhotos(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase){setPhotoNotice("Supabase bağlantısı kurulmamış. .env.local dosyasını kontrol et.");setPhotoNoticeError(true);return;}
  const input=document.getElementById("photo-files") as HTMLInputElement|null;
  const selected=input?Array.from(input.files??[]):[]; // FileList'in kopyasını alıyoruz
  if(!selected.length){setPhotoNotice("Lütfen önce fotoğraf seç.");setPhotoNoticeError(true);return;}
  setBusyPhoto(true);setPhotoNotice("");setPhotoNoticeError(false);
  let count=0,tooLarge=0,unsupported=0,failed=0;const reasons:string[]=[];
  try{
   for(let i=0;i<selected.length;i++){
    const f=selected[i];
    setProgress(`${i+1} / ${selected.length}`);
    try{
     const type=detectType(f);
     if(f.size>MAX_ORIGINAL_BYTES){tooLarge++;continue;}
     if(!ALLOWED_TYPES.includes(type)){unsupported++;continue;}
     const img=await prepareImage(f); // büyük fotoğrafları küçültür
     if(img.blob.size>MAX_FINAL_BYTES){tooLarge++;continue;}
     const base=f.name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,40)||"foto";
     const path=`${Date.now()}-${makeId()}-${base}.${img.ext}`;
     const up=await supabase.storage.from(BUCKET).upload(path,img.blob,{cacheControl:"3600",upsert:false,contentType:img.type});
     if(up.error){console.error("Fotoğraf yükleme hatası:",up.error);failed++;reasons.push(friendlyError(up.error.message));continue;}
     const db=await supabase.from("photos").insert({file_path:path,guest_name:guestName.trim()||null});
     if(db.error){
      console.error("Fotoğraf kaydı hatası:",db.error);failed++;reasons.push(friendlyError(db.error.message));
      await supabase.storage.from(BUCKET).remove([path]); // kayıtsız dosya kalmasın
      continue;
     }
     count++;
    }catch(err){
     console.error("Fotoğraf işlenirken hata:",err);failed++;
     reasons.push(friendlyError(err instanceof Error?err.message:String(err)));
    }
   }
  }finally{
   setBusyPhoto(false);setProgress("");
   if(input)input.value="";
   setSelectedCount(0);if(count)setGuestName("");
  }
  const messages:string[]=[];
  if(count)messages.push(`${count} fotoğraf başarıyla paylaşıldı. ❤️`);
  if(tooLarge)messages.push(`${tooLarge} fotoğraf çok büyük olduğu için eklenmedi.`);
  if(unsupported)messages.push(`${unsupported} dosyanın formatı desteklenmiyor. JPG, PNG, WEBP veya HEIC kullanabilirsin.`);
  if(failed){
   const uniq=Array.from(new Set(reasons)).slice(0,2).join("; ");
   messages.push(`${failed} fotoğraf yüklenemedi${uniq?` (${uniq})`:""}.`);
  }
  setPhotoNotice(messages.join(" ")||"Yüklenecek uygun fotoğraf bulunamadı.");
  setPhotoNoticeError(!count);
  await loadContent();
 }
 useEffect(()=>{
  if(selectedPhotoIndex===null)return;
  function handleKey(e:KeyboardEvent){
   if(e.key==="Escape")setSelectedPhotoIndex(null);
   if(e.key==="ArrowRight")setSelectedPhotoIndex(i=>i===null?null:(i+1)%photos.length);
   if(e.key==="ArrowLeft")setSelectedPhotoIndex(i=>i===null?null:(i-1+photos.length)%photos.length);
  }
  window.addEventListener("keydown",handleKey);
  document.body.style.overflow="hidden";
  return()=>{window.removeEventListener("keydown",handleKey);document.body.style.overflow="";}
 },[selectedPhotoIndex,photos.length]);
 async function deletePhoto(p:Photo){
  if(!supabase||deletingId)return;
  if(!window.confirm("Bu fotoğraf silinsin mi? Bu işlem geri alınamaz."))return;
  setDeletingId(p.id);setPhotoNotice("");setPhotoNoticeError(false);
  try{
   // Önce kayıt silinir (sadece sahibi silebilir), sonra dosyanın kendisi.
   const r=await supabase.from("photos").delete().eq("id",p.id).select("id");
   if(r.error)throw new Error(r.error.message);
   if(!r.data||r.data.length===0)throw new Error("Bu fotoğrafı silme iznin yok. Sadece kendi yüklediğin fotoğrafı silebilirsin.");
   const st=await supabase.storage.from(BUCKET).remove([p.file_path]);
   if(st.error)console.warn("Dosya depodan silinemedi:",st.error.message);
   setPhotoNotice("Fotoğraf silindi.");
  }catch(err){
   console.error("Silme hatası:",err);
   setPhotoNotice(`Fotoğraf silinemedi: ${friendlyError(err instanceof Error?err.message:String(err))}`);setPhotoNoticeError(true);
  }finally{setDeletingId(null);}
  await loadContent();
 }
 const photoUrl=(path:string)=>supabase?.storage.from(BUCKET).getPublicUrl(path).data.publicUrl??"";
 return <main>
  <section className="hero"><div className="heroGlow"/><p className="eyebrow">BİRLİKTE YENİ BİR HİKÂYE</p><h1>Seda <span>&</span> Mahmut</h1><div className="ornament">✧</div><p className="date">12 . 12 . 2026</p><p className="welcome">Bu özel günümüzde bizimle olduğunuz için teşekkür ederiz.</p><a className="scrollLink" href="#paylas">Bu günü birlikte güzelleştirelim <span>↓</span></a></section>
  <section className="intro" id="paylas"><p className="eyebrow">GÜZEL ANILAR BİRİKSİN</p><h2>Bu sayfa hepimizin.</h2><p>Bir dilek, birkaç güzel satır ya da günün en güzel fotoğrafı… Bizimle paylaşacağınız her anı çok kıymetli.</p></section>
  {configError&&<div className="configWarning">Supabase bağlantısı henüz yapılmamış. Kurulumda bağlantı bilgilerini ekleyeceğiz.</div>}
  <section className="contentGrid">
   <div className="panel"><p className="eyebrow">KALBİMİZDE KALSIN</p><h2>Bizim İçin Birkaç Satır</h2><p className="panelLead">Bize bir dilek bırakmak ister misin?</p><form onSubmit={submitWish}><label htmlFor="name">Adın</label><input id="name" value={name} onChange={e=>setName(e.target.value)} maxLength={45} placeholder="Adını yazabilirsin" required/><label htmlFor="message">Mesajın</label><textarea id="message" value={message} onChange={e=>setMessage(e.target.value)} maxLength={600} rows={5} placeholder="Güzel dileklerini bizimle paylaş..." required/><button type="submit" disabled={busyWish||configError}>{busyWish?"Gönderiliyor...":"Dileğimi bırak ♥"}</button></form></div>
   <div className="panel"><p className="eyebrow">O GÜNDEN BİR KARE</p><h2>Fotoğrafını Bizimle Paylaş</h2><p className="panelLead">Telefonundaki fotoğrafları seç, bu güzel anılar burada biriksin.</p><form onSubmit={uploadPhotos}><label htmlFor="guest-name">Adın (isteğe bağlı)</label><input id="guest-name" value={guestName} onChange={e=>setGuestName(e.target.value)} maxLength={45} placeholder="Fotoğrafı kim paylaştı?"/><label htmlFor="photo-files" className="fileLabel">Fotoğraf seç</label><input id="photo-files" className="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={e=>{setSelectedCount(e.target.files?.length??0);setPhotoNotice("")}}/>{selectedCount>0&&<p className="selectedInfo">✓ {selectedCount} fotoğraf seçildi. Şimdi aşağıdaki butona bas.</p>}<p className="hint">JPG, PNG, WEBP veya HEIC · Büyük fotoğraflar otomatik küçültülür</p><button type="submit" disabled={busyPhoto||configError}>{busyPhoto?`Yükleniyor... ${progress}`:"Fotoğrafları paylaş ♥"}</button>{photoNotice&&<p className={photoNoticeError?"photoNotice error":"photoNotice"} role="status">{photoNotice}</p>}</form></div>
  </section>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <section className="wall"><div className="sectionHeading"><p className="eyebrow">SEVGİYLE BIRAKILAN NOTLAR</p><h2>Güzel Dilekleriniz</h2></div>{wishes.length===0?<p className="empty">İlk güzel mesajı sen bırakabilirsin. ♡</p>:<div className="wishGrid">{wishes.map(w=><article className="wishCard" key={w.id}><span className="quoteMark">“</span><p>{w.message}</p><div className="wishAuthor">— {w.name}</div>{userId&&w.owner_id===userId&&<button type="button" className="wishDelete" disabled={deletingWishId===w.id} onClick={()=>deleteWish(w)}>{deletingWishId===w.id?"Siliniyor...":"🗑 Sil"}</button>}</article>)}</div>}</section>
  <section className="wall photoWall"><div className="sectionHeading"><p className="eyebrow">BİRLİKTE GÜZEL</p><h2>Anı Galerisi</h2><p>Paylaşılan fotoğraflar burada herkesle buluşacak. Yanlış bir fotoğraf yüklediysen, onu yüklediğin cihazdan “Sil” butonuyla kaldırabilirsin.</p></div>{photos.length===0?<p className="empty">İlk fotoğrafı paylaşmak için sabırsızlanıyoruz. ♡</p>:<div className="photoGrid">{photos.map((p,i)=><figure className="photoCard" key={p.id}><button type="button" className="photoOpen" onClick={()=>setSelectedPhotoIndex(i)} aria-label="Fotoğrafı büyüt"><img src={photoUrl(p.file_path)} alt={p.guest_name?`${p.guest_name} tarafından paylaşılan fotoğraf`:"Paylaşılan nişan fotoğrafı"} loading="lazy"/></button>{p.guest_name&&<figcaption>{p.guest_name}</figcaption>}{userId&&p.owner_id===userId&&<button type="button" className="photoDelete" disabled={deletingId===p.id} onClick={()=>deletePhoto(p)}>{deletingId===p.id?"Siliniyor...":"🗑 Sil"}</button>}</figure>)}</div>}</section>
  {selectedPhotoIndex!==null&&photos[selectedPhotoIndex]&&<div className="lightbox" role="dialog" aria-modal="true" aria-label="Büyük fotoğraf görünümü" onClick={()=>setSelectedPhotoIndex(null)}>
   <button type="button" className="lightboxClose" aria-label="Kapat" onClick={()=>setSelectedPhotoIndex(null)}>×</button>
   {photos.length>1&&<button type="button" className="lightboxPrev" aria-label="Önceki fotoğraf" onClick={e=>{e.stopPropagation();setSelectedPhotoIndex(i=>i===null?null:(i-1+photos.length)%photos.length)}}>‹</button>}
   <img className="lightboxImage" src={photoUrl(photos[selectedPhotoIndex].file_path)} alt={photos[selectedPhotoIndex].guest_name?`${photos[selectedPhotoIndex].guest_name} tarafından paylaşılan fotoğraf`:"Paylaşılan nişan fotoğrafı"} onClick={e=>e.stopPropagation()}/>
   {photos.length>1&&<button type="button" className="lightboxNext" aria-label="Sonraki fotoğraf" onClick={e=>{e.stopPropagation();setSelectedPhotoIndex(i=>i===null?null:(i+1)%photos.length)}}>›</button>}
   <div className="lightboxCount">{selectedPhotoIndex+1} / {photos.length}</div>
  </div>}
  <footer><div className="footerHeart">♡</div><p>Seda & Mahmut</p><span>12.12.2026 · Sevgiyle...</span></footer>
 </main>;
}
