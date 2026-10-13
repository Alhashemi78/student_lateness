'use strict';
(function(){
const el=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin=()=>access?.role==='admin';
let docs=[];

async function preparePhoto(file){
 if(!file.size||file.size>25*1024*1024)throw Error('اختر صورة لا تتجاوز 25 ميغابايت.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('تعذر قراءة الصورة؛ اختر JPG أو PNG أو WebP.'));img.src=url;});
  const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let blob;
  for(const quality of [0.85,0.7,0.55,0.4]){
   blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob&&blob.size<=500*1024)break;
  }
  if(!blob||blob.size>2*1024*1024)throw Error('تعذر تصغير الصورة للحجم المسموح.');
  return blob;
 }finally{URL.revokeObjectURL(url);}
}

async function refreshDocs(){
 if(!session||!access||demo){el('docList').textContent='سجّل الدخول بحساب مصرح له لعرض التوثيق الحقيقي.';el('docEvent').replaceChildren();return;}
 const eligible=events.filter(e=>e.status==='approved'&&(isAdmin()||e.owner_id===session.user.id)&&e.start_date<=today());
 el('docEvent').innerHTML='<option value="">اختر الفعالية</option>'+eligible.map(e=>'<option value="'+safe(e.id)+'">'+safe(e.title)+' — '+safe(e.start_date)+'</option>').join('');
 const {data,error}=await db.from('school_event_documentation').select('event_id,owner_id,description,student_participations,approval_status,review_note,created_at').order('created_at',{ascending:false});
 if(error){el('docList').textContent=errorText(error);return;}
 docs=data||[];
 const gallery=el('achievementGallery');
 const approved=(data||[]).filter(d=>d.approval_status==='approved');
 const {data:photos,error:photoError}=await db.from('school_event_photos').select('event_id,storage_path').order('created_at',{ascending:false});
 const photosByEvent=new Map();
 for(const p of photos||[])if(!photosByEvent.has(p.event_id))photosByEvent.set(p.event_id,p.storage_path);
 gallery.replaceChildren();
 if(photoError){gallery.textContent='تعذر تحميل صور الإنجازات: '+errorText(photoError);}
 else if(!approved.length){gallery.textContent='لا توجد إنجازات موثقة بعد.';}
 else for(const d of approved){
  const e=events.find(x=>x.id===d.event_id);
  const card=document.createElement('article');card.className='card';
  const title=document.createElement('h3');title.textContent=e?.title||'فعالية مدرسية';card.append(title);
  const date=document.createElement('p');date.textContent='تاريخ الفعالية: '+(e?.start_date?dateLabel(e.start_date):'غير متاح');card.append(date);
  const desc=document.createElement('p');desc.textContent=d.description;card.append(desc);
  const count=document.createElement('small');count.textContent='المشاركات الطلابية: '+d.student_participations;card.append(count);
  const path=photosByEvent.get(d.event_id);
  if(path){const signed=await db.storage.from('school-event-private').createSignedUrl(path,120);
   if(!signed.error){const img=document.createElement('img');img.src=signed.data.signedUrl;img.alt='صورة توثيق '+title.textContent;img.loading='lazy';img.style.cssText='width:100%;max-height:260px;object-fit:cover;border-radius:12px;margin-top:12px';card.prepend(img);}
  }
  gallery.append(card);
 }

 const pendingDocs=docs.filter(d=>d.approval_status!=='approved');
 el('docList').innerHTML=pendingDocs.length?pendingDocs.map(d=>{
  const e=events.find(x=>x.id===d.event_id);
  return '<article class="event-card"><div><h3>'+safe(e?.title||'فعالية')+'</h3><p>'+safe(d.description)+'</p><small>المشاركات الطلابية: '+Number(d.student_participations)+' · '+safe(({pending:'قيد المراجعة',approved:'معتمد',rejected:'مرفوض'})[d.approval_status])+'</small>'+(d.review_note?'<p>'+safe(d.review_note)+'</p>':'')+'</div>'+(isAdmin()&&d.approval_status==='pending'?'<div class="actions"><button type="button" class="btn primary" data-doc-review="approved" data-doc-id="'+safe(d.event_id)+'">اعتماد</button><button type="button" class="btn outline" data-doc-review="rejected" data-doc-id="'+safe(d.event_id)+'">رفض</button></div>':'')+'</article>';
 }).join(''):'<p class="muted">لا توجد توثيقات قيد المراجعة أو مرفوضة. التوثيقات المعتمدة تظهر أعلاه مع صورها.</p>';
}
const form=el('docForm'),saveButton=form.querySelector('[type="submit"]');
let saving=false;
function syncDocMode(){
 const mode=el('docEditMode').value,photo=el('docPhoto'),desc=el('docDescription'),count=el('docCount');
 photo.disabled=mode==='details';photo.required=mode==='photo';
 desc.disabled=count.disabled=mode==='photo';desc.required=count.required=mode!=='photo';
 el('docModeHint').textContent=mode==='photo'?'سيتم تحديث الصورة فقط مع الاحتفاظ ببيانات التوثيق وحالة مراجعته.':mode==='details'?'سيتم تحديث الوصف والمشاركات مع الاحتفاظ بالصورة وحالة المراجعة.':'أرفق الصورة إن رغبت. التوثيق الجديد من الموظف يُرسل للمراجعة، وتعديل التوثيق الموجود يحتفظ بحالته.';
}
el('docEvent').addEventListener('change',()=>{
 const d=docs.find(x=>x.event_id===el('docEvent').value);
 el('docEditMode').value='details_photo';el('docPhoto').value='';
 el('docDescription').value=d?.description||'';el('docCount').value=d?.student_participations??'';
 syncDocMode();el('docFeedback').textContent='';
});
el('docEditMode').addEventListener('change',syncDocMode);
form.addEventListener('invalid',ev=>{
 const names={docEvent:'الفعالية',docDescription:'وصف التنفيذ (10 أحرف على الأقل)',docCount:'عدد المشاركات',docPhoto:'الصورة'};
 el('docFeedback').textContent='تحقق من حقل '+(names[ev.target.id]||'البيانات المطلوبة')+'.';
},true);
form.addEventListener('submit',async ev=>{
 ev.preventDefault();if(saving)return;
 const feedback=el('docFeedback');
 if(!session||!access||demo)return feedback.textContent='سجّل الدخول أولًا؛ المعاينة لا تحفظ البيانات.';
 const eventId=el('docEvent').value,evt=events.find(e=>e.id===eventId);
 if(!evt||evt.status!=='approved'||evt.start_date>today()||(!isAdmin()&&evt.owner_id!==session.user.id))return feedback.textContent='لا تملك صلاحية توثيق هذه الفعالية أو لم يبدأ موعدها بعد.';
 const mode=el('docEditMode').value,image=mode==='details'?null:el('docPhoto').files?.[0];
 if(mode==='photo'&&!image)return feedback.textContent='اختر الصورة البديلة أولًا.';
 if(image&&(!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>25*1024*1024||image.size<1))return feedback.textContent='اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 25 ميغابايت. لم يتم حفظ أي تغيير.';
 const description=el('docDescription').value.trim(),count=Number(el('docCount').value);
 if(mode!=='photo'&&(description.length<10||description.length>3000||!el('docCount').value||!Number.isInteger(count)||count<0||count>100000))return feedback.textContent='اكتب وصفًا من 10 إلى 3000 حرف وعدد مشاركات صحيحًا من 0 إلى 100000.';
 const accountId=session.user.id;
 const checkAccount=()=>{if(session?.user?.id!==accountId||!access||demo)throw Error('تغيّر حساب الدخول؛ أعد فتح التوثيق قبل المحاولة.');};
 saving=true;saveButton.disabled=true;form.setAttribute('aria-busy','true');
 el('docEvent').disabled=el('docEditMode').disabled=el('docRefresh').disabled=true;
 let detailsSaved=false,stage='تجهيز الصورة';
 try{
  const preparedImage=image?await preparePhoto(image):null;
  checkAccount();stage='قراءة التوثيق';feedback.textContent='جارٍ التحقق من التوثيق...';
  // Read the saved row on every attempt: a previous attempt may have saved details before an upload failed.
  const lookup=await db.from('school_event_documentation').select('event_id,owner_id,description,student_participations,approval_status,review_note,created_at').eq('event_id',eventId).maybeSingle();
  if(lookup.error)throw lookup.error;checkAccount();
  let existing=lookup.data;
  if(mode==='photo'&&!existing)throw Error('اختر توثيقًا موجودًا لاستبدال صورته.');
  
  if(mode!=='photo'){
   stage='حفظ بيانات التوثيق';feedback.textContent='جارٍ حفظ بيانات التوثيق...';
   // Editing content must never clear a review note or change a review decision.
   const changes={description,student_participations:count};
   const payload={...changes,event_id:eventId,owner_id:evt.owner_id,approval_status:isAdmin()?'approved':'pending'};
   const query=existing?db.from('school_event_documentation').update(changes).eq('event_id',eventId):db.from('school_event_documentation').insert(payload);
   const result=await query.select('event_id');
   if(result.error)throw result.error;
   if(!result.data?.length)throw Error('لم يتم حفظ التوثيق. تحقق من صلاحيات الحساب ثم حدّث السجل.');
   detailsSaved=true;existing=existing?{...existing,...changes}:payload;
   docs=docs.filter(d=>d.event_id!==eventId).concat(existing);checkAccount();
  }
  if(image){
   stage='رفع الصورة';feedback.textContent='جارٍ رفع الصورة...';
   const ext='jpg';
   const path=eventId+'/'+accountId+'/'+crypto.randomUUID()+'.'+ext;
   const uploaded=await db.storage.from('school-event-private').upload(path,preparedImage,{contentType:'image/jpeg',upsert:false});
   if(uploaded.error)throw uploaded.error;checkAccount();
   stage='ربط الصورة بالتوثيق';
   const linked=await db.from('school_event_photos').insert({event_id:eventId,owner_id:accountId,storage_path:path});
   if(linked.error){
    // Remove only the file from this failed attempt, never a previous event photo.
    try{await db.storage.from('school-event-private').remove([path]);}catch(_){}
    throw linked.error;
   }
  }
  checkAccount();
  const success=mode==='photo'?'تم تحديث صورة الفعالية بنجاح.':existing.approval_status==='pending'?'تم حفظ التوثيق'+(image?' والصورة':'')+' وإرساله للمراجعة.':existing.approval_status==='rejected'?'تم حفظ التعديلات'+(image?' والصورة':'')+'. التوثيق ما زال مرفوضًا ويحتاج مراجعة الإدارة.':'تم حفظ التوثيق'+(image?' والصورة':'')+' مع الاحتفاظ بالاعتماد.';
  form.reset();syncDocMode();feedback.textContent=success;
  try{await refreshDocs();}catch(err){feedback.textContent=success+' تعذر تحديث العرض: '+errorText(err);}
 }catch(err){
  const detail=String(err?.message||err).includes('Review is admin-only')?'قرار الاعتماد مخصص للإدارة. لم يكتمل الحفظ؛ تحقق من صلاحيات التوثيق.':errorText(err);
  feedback.textContent=(detailsSaved?'حُفظت بيانات التوثيق، لكن تعذر '+stage+'. يمكنك إعادة المحاولة بنفس الصورة. ':'تعذر '+stage+': ')+detail;
 }finally{
  saving=false;saveButton.disabled=false;form.removeAttribute('aria-busy');
  el('docEvent').disabled=el('docEditMode').disabled=el('docRefresh').disabled=false;
 }
});
syncDocMode();
el('exportAchievementsPdf').addEventListener('click',async()=>{
 const status=el('achievementsPdfStatus'),button=el('exportAchievementsPdf');
 if(!session||!access||demo)return status.textContent='يلزم تسجيل الدخول بحساب مصرح له.';
 const approved=docs.filter(d=>d.approval_status==='approved'&&events.some(e=>e.id===d.event_id));
 if(!approved.length)return status.textContent='لا توجد إنجازات معتمدة لتصديرها.';
 if(!window.html2canvas||!window.jspdf?.jsPDF)return status.textContent='تعذر تحميل أدوات PDF، حاول إعادة فتح الصفحة.';
 button.disabled=true;status.textContent='جارٍ تجهيز التقرير والصور...';
 const host=document.createElement('div');host.dir='rtl';host.style.cssText='position:fixed;left:-20000px;top:0;width:760px;background:white;color:#183b44;padding:32px;font-family:Cairo,Arial,sans-serif;box-sizing:border-box';
 document.body.append(host);
 try{
  const heading=document.createElement('h1');heading.textContent='الفعاليات المدرسية – العام الدراسي 2026–2027م';heading.style.cssText='text-align:center;font-size:27px';host.append(heading);
  const subtitle=document.createElement('h2');subtitle.textContent='تقرير توثيق الإنجازات المعتمدة';subtitle.style.textAlign='center';host.append(subtitle);
  const ordered=approved.slice().sort((a,b)=>(events.find(e=>e.id===a.event_id)?.start_date||'').localeCompare(events.find(e=>e.id===b.event_id)?.start_date||''));
  for(const [i,d] of ordered.entries()){
   const e=events.find(x=>x.id===d.event_id);const section=document.createElement('section');section.style.cssText='border:1px solid #d3e1e1;border-radius:12px;padding:18px;margin:20px 0;break-inside:avoid';
   const layout=document.createElement('div');layout.style.cssText='display:flex;flex-direction:row;align-items:flex-start;gap:18px;min-height:170px;direction:rtl';
   const details=document.createElement('div');details.style.cssText='flex:1;min-width:0;text-align:right';
   const title=document.createElement('h2');title.textContent=(i+1)+'. '+e.title;title.style.cssText='margin:0 0 9px;font-size:20px';details.append(title);
   for(const line of ['تاريخ الفعالية: '+dateLabel(e.start_date),'القسم: '+(e.department||'—'),'المسؤول: '+(e.employee||'—'),'عدد المشاركات الطلابية: '+d.student_participations,'وصف التنفيذ والنتائج: '+d.description]){const p=document.createElement('p');p.textContent=line;p.style.cssText='margin:7px 0;white-space:pre-wrap;font-size:15px;line-height:1.65';details.append(p);}
   layout.append(details);
   const {data:photos,error:photoError}=await db.from('school_event_photos').select('storage_path').eq('event_id',d.event_id).order('created_at',{ascending:false}).limit(1);
   if(photoError)throw photoError;
   if(photos?.length){
    try{
     const signed=await db.storage.from('school-event-private').createSignedUrl(photos[0].storage_path,300);
     if(signed.error)throw signed.error;
     const resp=await fetch(signed.data.signedUrl);if(!resp.ok)throw Error('تعذر تحميل الصورة');
     const blob=await resp.blob();if(!blob.type.startsWith('image/'))throw Error('ملف الصورة غير صالح');
     const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('تعذر قراءة الصورة'));reader.readAsDataURL(blob);});
     const img=document.createElement('img');img.alt='صورة '+e.title;img.style.cssText='width:195px;height:155px;object-fit:contain;background:#f3f7f7;border:1px solid #d3e1e1;border-radius:10px;flex:none';
     await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('تعذر تحميل الصورة'));img.src=src;});
     layout.append(img);
    }catch(imageError){console.warn('تعذر إدراج صورة الفعالية في PDF',e.id,imageError);}
   }
   section.append(layout);host.append(section);
  }
  const footer=document.createElement('p');footer.textContent='إعداد المدير المساعد: زياد الهاشمي';footer.style.cssText='text-align:center;font-weight:bold;margin:30px 0';host.append(footer);
  await document.fonts.ready;
  const canvas=await html2canvas(host,{scale:1.4,backgroundColor:'#ffffff',useCORS:true,logging:false});
  const pdf=new jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const pageW=210,pageH=297,margin=10,usableW=pageW-2*margin,usableH=pageH-2*margin;
  const pagePx=Math.floor(canvas.width*usableH/usableW);let page=0;
  for(let y=0;y<canvas.height;y+=pagePx){const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=Math.min(pagePx,canvas.height-y);slice.getContext('2d').drawImage(canvas,0,y,canvas.width,slice.height,0,0,canvas.width,slice.height);if(page++)pdf.addPage();pdf.addImage(slice.toDataURL('image/jpeg',0.87),'JPEG',margin,margin,usableW,slice.height*usableW/slice.width);}
  const blob=pdf.output('blob'),url=URL.createObjectURL(blob);status.replaceChildren();const link=document.createElement('a');link.href=url;link.download='توثيق-الإنجازات-المعتمدة.pdf';link.target='_blank';link.rel='noopener';link.textContent='اضغط هنا لتنزيل تقرير PDF';link.style.cssText='display:inline-block;padding:12px 16px;border-radius:10px;background:#173f49;color:white;font-weight:bold;text-decoration:none';status.append(link);link.click();
 }catch(err){status.textContent='تعذر تصدير التقرير: '+errorText(err);}
 finally{host.remove();button.disabled=false;}
});
async function reloadDocs(){try{await refreshDocs();}catch(err){el('docFeedback').textContent='تعذر تحميل التوثيق: '+errorText(err);}}
el('docRefresh').onclick=reloadDocs;
el('docList').addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-doc-review]');if(!b||!isAdmin()||!session)return;
 const status=b.dataset.docReview;
 const dialog=document.createElement('dialog');dialog.className='card';dialog.setAttribute('aria-label','مراجعة توثيق الفعالية');
 const form=document.createElement('form');form.method='dialog';
 const heading=document.createElement('h3');heading.textContent=status==='approved'?'اعتماد توثيق الفعالية':'رفض توثيق الفعالية';form.append(heading);
 const detail=document.createElement('p');detail.textContent=status==='approved'?'سيظهر التوثيق والصورة للمستخدمين المصرح لهم بعد الاعتماد.':'اكتب سبب رفض التوثيق.';form.append(detail);
 const reason=document.createElement('textarea');reason.placeholder='سبب الرفض';reason.rows=3;reason.maxLength=1000;reason.required=status==='rejected';if(status==='rejected')form.append(reason);
 const actions=document.createElement('div');actions.className='actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='btn outline';cancel.textContent='إلغاء';cancel.onclick=()=>dialog.close();
 const accept=document.createElement('button');accept.type='submit';accept.className='btn primary';accept.textContent='تأكيد القرار';actions.append(cancel,accept);form.append(actions);dialog.append(form);document.body.append(dialog);
 const accepted=await new Promise(resolve=>{form.addEventListener('submit',ev=>{ev.preventDefault();if(status==='rejected'&&!reason.value.trim())return;resolve(true);dialog.close();});dialog.addEventListener('close',()=>resolve(false),{once:true});dialog.showModal();});
 const note=status==='rejected'?reason.value.trim():'';
 dialog.remove();if(!accepted)return;
 const {error}=await db.from('school_event_documentation').update({approval_status:status,review_note:note||''}).eq('event_id',b.dataset.docId);
 if(error)el('docFeedback').textContent=errorText(error);else await refreshDocs();
});
document.querySelector('[data-view="documentation"]')?.addEventListener('click',()=>{if(!saving)reloadDocs();});
})();