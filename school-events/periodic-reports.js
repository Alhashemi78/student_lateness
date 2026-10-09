'use strict';
(function(){
const $p=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const iso=d=>d.toISOString().slice(0,10);
const dateShift=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d);};
const label=s=>new Intl.DateTimeFormat('ar-BH',{timeZone:'Asia/Bahrain',year:'numeric',month:'long',day:'numeric'}).format(new Date(s+'T12:00:00Z'));
const weekStart=s=>dateShift(s,-new Date(s+'T12:00:00Z').getUTCDay());
const dateRange=r=>label(r.period_start)+' — '+label(r.period_end);
const row=r=>'<div class="archive-row periodic-archive-row"><span>'+escapeHTML(dateRange(r))+'</span><a class="periodic-pdf-link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(r.pdf_url)+'">↗ PDF</a></div>';
let archive=[];
const numeric=v=>Number(v)||0;
const records=()=>Array.isArray(events)?events.filter(e=>e.status!=='rejected'):[];
function periodEvents(start,end){return records().filter(e=>e.start_date<=end&&(e.end_date||e.start_date)>=start);}
function summary(rows){const departments=new Set(rows.map(e=>e.department).filter(Boolean));return {count:rows.length,participations:rows.reduce((n,e)=>n+numeric(e.participants_count??e.participants??e.participant_count),0),departments:departments.size};}
function statsHTML(rows){const m=summary(rows);return '<div class="periodic-stats"><div><strong>'+m.count+'</strong><small>فعالية</small></div><div><strong>'+m.departments+'</strong><small>قسم</small></div></div>';}
function eventRows(rows){return rows.length?rows.slice().sort((a,b)=>a.start_date.localeCompare(b.start_date)).map(e=>'<div class="periodic-event"><span class="periodic-date">'+escapeHTML(label(e.start_date))+'</span><strong>'+escapeHTML(e.title)+'</strong><small>'+escapeHTML(e.department||'غير محدد')+'</small></div>').join(''):'<p class="muted">لا توجد فعاليات مسجلة لهذه الفترة.</p>';}
function archiveLinks(type,start){return archive.filter(r=>r.report_type===type&&r.period_start===start).map(row).join('');}
function display(){
 const now=today(),thisSunday=weekStart(now),pastStart=dateShift(thisSunday,-7),nextStart=dateShift(thisSunday,7),pastEnd=dateShift(pastStart,4),nextEnd=dateShift(nextStart,4);
 const past=periodEvents(pastStart,pastEnd),next=periodEvents(nextStart,nextEnd);
 const monthStart=now.slice(0,7)+'-01',monthEnd=dateShift(dateShift(monthStart,32).slice(0,7)+'-01',-1),current=periodEvents(monthStart,monthEnd);
 $p('periodicOverview').innerHTML='<div class="periodic-overview-item"><span>الأسبوع السابق</span><strong>'+past.length+'</strong><small>فعالية</small></div><div class="periodic-overview-item"><span>الأسبوع القادم</span><strong>'+next.length+'</strong><small>فعالية</small></div><div class="periodic-overview-item"><span>الشهر الحالي</span><strong>'+current.length+'</strong><small>فعالية</small></div>';
 $p('pastWeekReport').innerHTML='<p class="periodic-range">'+escapeHTML(label(pastStart)+' — '+label(pastEnd))+'</p>'+statsHTML(past)+eventRows(past)+archiveLinks('past_week',pastStart);
 $p('nextWeekReport').innerHTML='<p class="periodic-range">'+escapeHTML(label(nextStart)+' — '+label(nextEnd))+'</p>'+statsHTML(next)+eventRows(next)+archiveLinks('next_week',nextStart);
 const months=new Set(records().map(e=>e.start_date?.slice(0,7)).filter(Boolean));months.add(now.slice(0,7));archive.filter(r=>r.report_type==='monthly').forEach(r=>months.add(r.period_start.slice(0,7)));
 $p('monthlyReports').innerHTML=[...months].sort().reverse().slice(0,18).map(m=>{const first=m+'-01',last=dateShift(dateShift(first,32).slice(0,7)+'-01',-1),rows=periodEvents(first,last);return '<details class="periodic-month"><summary><span>'+escapeHTML(new Intl.DateTimeFormat('ar-BH',{month:'long',year:'numeric',timeZone:'Asia/Bahrain'}).format(new Date(first+'T12:00:00Z')))+'</span><span>'+rows.length+' فعالية</span></summary>'+statsHTML(rows)+eventRows(rows)+archive.filter(r=>r.report_type==='monthly'&&r.period_start.slice(0,7)===m).map(row).join('')+'</details>';}).join('');
 const weeks=archive.filter(r=>r.report_type!=='monthly').sort((a,b)=>b.period_start.localeCompare(a.period_start));
 $p('weeklyArchive').innerHTML=weeks.length?weeks.map(row).join(''):'<p class="muted">لا توجد روابط PDF مؤرشفة حتى الآن.</p>';
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