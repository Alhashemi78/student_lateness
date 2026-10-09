'use strict';
(function(){
const el=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin=()=>access?.role==='admin';
let docs=[];
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
 else if(!approved.length){gallery.textContent='لم تُعتمد إنجازات بعد.';}
 else for(const d of approved){
  const e=events.find(x=>x.id===d.event_id);
  const card=document.createElement('article');card.className='card';
  const title=document.createElement('h3');title.textContent=e?.title||'فعالية مدرسية';card.append(title);
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
el('docForm').addEventListener('submit',async ev=>{
 ev.preventDefault();
 if(!session||!access||demo)return el('docFeedback').textContent='سجّل الدخول أولًا؛ المعاينة لا تحفظ البيانات.';
 const eventId=el('docEvent').value,evt=events.find(e=>e.id===eventId);
 if(!evt||evt.status!=='approved'||(!isAdmin()&&evt.owner_id!==session.user.id))return el('docFeedback').textContent='لا تملك صلاحية توثيق هذه الفعالية.';
 const existing=docs.find(d=>d.event_id===eventId);
 if(existing?.approval_status==='approved'){
  const image=el('docPhoto').files?.[0];
  if(!image)return el('docFeedback').textContent='التوثيق معتمد بالفعل. اختر صورة لإضافتها إلى نفس الفعالية، دون إرسال توثيق جديد.';
  if(evt.owner_id!==session.user.id)return el('docFeedback').textContent='إرفاق صورة لتوثيق معتمد متاح لصاحب الفعالية فقط حاليًا.';
  if(!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>2097152||image.size<1)return el('docFeedback').textContent='اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 2 ميغابايت.';
  el('docFeedback').textContent='جارٍ إرفاق الصورة بالتوثيق المعتمد...';
  const ext=image.type==='image/png'?'png':image.type==='image/webp'?'webp':'jpg';
  const path=eventId+'/'+session.user.id+'/'+crypto.randomUUID()+'.'+ext;
  const uploaded=await db.storage.from('school-event-private').upload(path,image,{contentType:image.type,upsert:false});
  if(uploaded.error)return el('docFeedback').textContent='تعذر رفع الصورة: '+errorText(uploaded.error);
  const saved=await db.from('school_event_photos').insert({event_id:eventId,owner_id:session.user.id,storage_path:path});
  if(saved.error){await db.storage.from('school-event-private').remove([path]);return el('docFeedback').textContent='تعذر ربط الصورة بالتوثيق: '+errorText(saved.error);}
  el('docFeedback').textContent='تم إرفاق الصورة بالتوثيق المعتمد نفسه دون إنشاء نسخة جديدة.';el('docForm').reset();await refreshDocs();return;
 }
 const payload={event_id:eventId,owner_id:evt.owner_id,description:el('docDescription').value.trim(),student_participations:Number(el('docCount').value),approval_status:'pending'};
 el('docFeedback').textContent='جارٍ الحفظ...';
 let result;
 if(existing)result=await db.from('school_event_documentation').update({description:payload.description,student_participations:payload.student_participations,approval_status:'pending',review_note:''}).eq('event_id',eventId);
 else result=await db.from('school_event_documentation').insert(payload);
 if(result.error)return el('docFeedback').textContent=errorText(result.error);

 const image=el('docPhoto').files?.[0];
 if(image){
  if(!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>2097152||image.size<1)return el('docFeedback').textContent='حُفظ التوثيق، لكن الصورة يجب أن تكون JPG أو PNG أو WebP وأقل من 2 ميغابايت.';
  const ext=image.type==='image/png'?'png':image.type==='image/webp'?'webp':'jpg';
  const path=eventId+'/'+session.user.id+'/'+crypto.randomUUID()+'.'+ext;
  const uploaded=await db.storage.from('school-event-private').upload(path,image,{contentType:image.type,upsert:false});
  if(uploaded.error)return el('docFeedback').textContent='حُفظ التوثيق، لكن رفع الصورة لم ينجح: '+errorText(uploaded.error);
  const saved=await db.from('school_event_photos').insert({event_id:eventId,owner_id:session.user.id,storage_path:path});
  if(saved.error)return el('docFeedback').textContent='رفعت الصورة لكن تعذر ربطها بالفعالية: '+errorText(saved.error);
 }
 el('docFeedback').textContent='تم حفظ التوثيق وإرساله للمراجعة.';el('docForm').reset();await refreshDocs();
});
el('docRefresh').onclick=refreshDocs;
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
document.querySelector('[data-view="documentation"]')?.addEventListener('click',()=>{refreshDocs();});
})();