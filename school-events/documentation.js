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
 el('docList').innerHTML=docs.length?docs.map(d=>{
  const e=events.find(x=>x.id===d.event_id);
  return '<article class="event-card"><div><h3>'+safe(e?.title||'فعالية')+'</h3><p>'+safe(d.description)+'</p><small>المشاركات الطلابية: '+Number(d.student_participations)+' · '+safe(({pending:'قيد المراجعة',approved:'معتمد',rejected:'مرفوض'})[d.approval_status])+'</small>'+(d.review_note?'<p>'+safe(d.review_note)+'</p>':'')+'</div>'+(isAdmin()&&d.approval_status==='pending'?'<div class="actions"><button type="button" class="btn primary" data-doc-review="approved" data-doc-id="'+safe(d.event_id)+'">اعتماد</button><button type="button" class="btn outline" data-doc-review="rejected" data-doc-id="'+safe(d.event_id)+'">رفض</button></div>':'')+'</article>';
 }).join(''):'<p class="muted">لا يوجد توثيق بعد.</p>';
}
el('docForm').addEventListener('submit',async ev=>{
 ev.preventDefault();
 if(!session||!access||demo)return el('docFeedback').textContent='سجّل الدخول أولًا؛ المعاينة لا تحفظ البيانات.';
 const eventId=el('docEvent').value,evt=events.find(e=>e.id===eventId);
 if(!evt||evt.status!=='approved'||(!isAdmin()&&evt.owner_id!==session.user.id))return el('docFeedback').textContent='لا تملك صلاحية توثيق هذه الفعالية.';
 const existing=docs.find(d=>d.event_id===eventId);
 if(existing?.approval_status==='approved')return el('docFeedback').textContent='التوثيق معتمد؛ يتطلب تغييره موافقة الإدارة.';
 const payload={event_id:eventId,owner_id:evt.owner_id,description:el('docDescription').value.trim(),student_participations:Number(el('docCount').value),approval_status:'pending'};
 el('docFeedback').textContent='جارٍ الحفظ...';
 let result;
 if(existing)result=await db.from('school_event_documentation').update({description:payload.description,student_participations:payload.student_participations,approval_status:'pending',review_note:''}).eq('event_id',eventId);
 else result=await db.from('school_event_documentation').insert(payload);
 if(result.error)return el('docFeedback').textContent=errorText(result.error);
 el('docFeedback').textContent='تم حفظ التوثيق وإرساله للمراجعة.';el('docForm').reset();await refreshDocs();
});
el('docRefresh').onclick=refreshDocs;
el('docList').addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-doc-review]');if(!b||!isAdmin()||!session)return;
 const status=b.dataset.docReview, note=status==='rejected'?prompt('سبب الرفض:'):'';if(status==='rejected'&&!note?.trim())return;
 if(!confirm(status==='approved'?'اعتماد هذا التوثيق ونشره للمستخدمين المصرح لهم؟':'رفض التوثيق؟'))return;
 const {error}=await db.from('school_event_documentation').update({approval_status:status,review_note:note||''}).eq('event_id',b.dataset.docId);
 if(error)el('docFeedback').textContent=errorText(error);else await refreshDocs();
});
document.querySelector('[data-view="documentation"]')?.addEventListener('click',()=>{refreshDocs();});
})();