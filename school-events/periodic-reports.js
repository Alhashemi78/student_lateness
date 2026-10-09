'use strict';
(function(){
const $p=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const iso=d=>d.toISOString().slice(0,10);
const dateShift=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d);};
const label=s=>new Intl.DateTimeFormat('ar-BH',{timeZone:'Asia/Bahrain',year:'numeric',month:'long',day:'numeric'}).format(new Date(s+'T12:00:00Z'));
const weekStart=s=>dateShift(s,-new Date(s+'T12:00:00Z').getUTCDay());
const dateRange=r=>label(r.period_start)+' — '+label(r.period_end);
const row=r=>'<div class="archive-row"><span>'+escapeHTML(dateRange(r))+'</span><a class="btn pdf" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(r.pdf_url)+'">فتح PDF في Google Drive ↗</a></div>';
let archive=[];
function display(){
 const now=today(),thisSunday=weekStart(now),pastStart=dateShift(thisSunday,-7),nextStart=dateShift(thisSunday,7);
 const past=archive.filter(r=>r.report_type==='past_week'&&r.period_start===pastStart);
 const next=archive.filter(r=>r.report_type==='next_week'&&r.period_start===nextStart);
 const pastLabel=label(pastStart)+' — '+label(dateShift(pastStart,4));
 const nextLabel=label(nextStart)+' — '+label(dateShift(nextStart,4));
 $p('pastWeekReport').innerHTML='<p class="muted">'+escapeHTML(pastLabel)+'</p>'+(past.length?past.map(row).join(''):'<p class="muted">لم يُحفظ رابط PDF لهذا الأسبوع بعد.</p>');
 $p('nextWeekReport').innerHTML='<p class="muted">'+escapeHTML(nextLabel)+'</p>'+(next.length?next.map(row).join(''):'<p class="muted">لم يُحفظ رابط PDF لهذا الأسبوع بعد.</p>');
 const months=archive.filter(r=>r.report_type==='monthly').sort((a,b)=>b.period_start.localeCompare(a.period_start));
 $p('monthlyReports').innerHTML=months.length?months.map(row).join(''):'<p class="muted">لا توجد روابط للتقارير الشهرية حتى الآن.</p>';
 const weeks=archive.filter(r=>r.report_type!=='monthly').sort((a,b)=>b.period_start.localeCompare(a.period_start));
 $p('weeklyArchive').innerHTML=weeks.length?weeks.map(row).join(''):'<p class="muted">لا توجد تقارير أسبوعية مؤرشفة بعد.</p>';
 $p('reportLinkAdmin').hidden=access?.role!=='admin'||demo;
}
async function refresh(){
 if(!session||!access||demo){archive=[];display();return;}
 const {data,error}=await db.from('school_event_report_archive').select('report_type,period_start,period_end,pdf_url').order('period_start',{ascending:false});
 if(error){$p('monthlyReports').textContent=errorText(error);return;}
 archive=data||[];display();
}
$p('periodicRefresh').onclick=refresh;
document.querySelector('[data-view="periodic"]')?.addEventListener('click',refresh);
$p('reportLinkForm').addEventListener('submit',async ev=>{
 ev.preventDefault();if(access?.role!=='admin'||!session||demo)return;
 const report_type=$p('archiveType').value,period_start=$p('archiveStart').value,period_end=$p('archiveEnd').value,pdf_url=$p('archiveUrl').value.trim();
 if(period_end<period_start)return $p('archiveMessage').textContent='تاريخ النهاية قبل البداية.';
 if(!/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view(?:\?.*)?$/.test(pdf_url))return $p('archiveMessage').textContent='أدخل رابط عرض ملف PDF في Google Drive.';
 const {error}=await db.from('school_event_report_archive').upsert({report_type,period_start,period_end,pdf_url},{onConflict:'report_type,period_start,period_end'});
 if(error){$p('archiveMessage').textContent=errorText(error);return;}
 $p('archiveMessage').textContent='تم حفظ الرابط مع تاريخه.';$p('reportLinkForm').reset();await refresh();
});
})();