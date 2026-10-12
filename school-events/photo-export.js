'use strict';
(() => {
  const button = document.getElementById('exportPhotosZip');
  const message = document.getElementById('photosZipStatus');
  const downloads = document.getElementById('photosZipDownloads');
  if (!button || !message || !downloads) return;
  const batchSize = 20;
  let queue = null, offset = 0, accountId = null, busy = false, zipPromise;
  const urls = new Set();
  const allowed = () => !!session && access?.role === 'admin' && !demo;
  function syncButton() {
    button.hidden = !allowed();
    if (accountId && (!allowed() || session.user.id !== accountId)) {
      queue = null; offset = 0; accountId = null;
      urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
      downloads.replaceChildren(); message.textContent = '';
      button.textContent = 'تنزيل صور الفعاليات ZIP';
    }
  }
  function zipLibrary() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (zipPromise) return zipPromise;
    zipPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); reject(Error('تأخر تحميل أداة التنزيل؛ حاول مرة أخرى.')); }, 20000);
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = () => { clearTimeout(timer); window.JSZip ? resolve(window.JSZip) : reject(Error('تعذر تحميل أداة التنزيل.')); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error('تعذر تحميل أداة التنزيل. تحقق من الاتصال.')); };
      document.head.append(script);
    }).catch(error => { zipPromise = null; throw error; });
    return zipPromise;
  }
  function checkAccount(id) {
    if (!allowed() || session.user.id !== id) throw Error('تغيّر حساب الدخول. أعد تسجيل الدخول قبل تنزيل الصور.');
  }
  const safeName = text => String(text || 'فعالية').replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 70) || 'فعالية';
  button.addEventListener('click', async () => {
    if (busy || !allowed()) return;
    busy = true; button.disabled = true;
    const id = session.user.id;
    try {
      if (!queue || accountId !== id || offset >= queue.length) {
        queue = null; offset = 0; accountId = id;
        message.textContent = 'جارٍ حصر صور الفعاليات المسموح لك بقراءتها…';
        const photos = [];
        for (let start = 0; ; start += 500) {
          const { data, error } = await db.from('school_event_photos').select('event_id,storage_path,created_at').order('storage_path').range(start, start + 499);
          if (error) throw error;
          checkAccount(id); photos.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        queue = photos;
      }
      if (!queue.length) { message.textContent = 'لا توجد صور متاحة لهذا الحساب.'; return; }
      const JSZip = await zipLibrary();
      const zip = new JSZip(), selected = queue.slice(offset, offset + batchSize), index = [];
      for (let i = 0; i < selected.length; i++) {
        checkAccount(id);
        const photo = selected[i], event = events.find(row => row.id === photo.event_id);
        message.textContent = `جارٍ تجهيز الصورة ${offset + i + 1} من ${queue.length}…`;
        const { data, error } = await db.storage.from('school-event-private').createSignedUrl(photo.storage_path, 300);
        if (error) throw error;
        const response = await fetch(data.signedUrl, { signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw Error('تعذر تحميل إحدى الصور. لم يتم تخطيها؛ أعد المحاولة.');
        const blob = await response.blob();
        const ext = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' })[blob.type.split(';')[0]];
        if (!ext || !blob.size) throw Error('إحدى الملفات ليست صورة مدعومة. لم يتم تخطيها.');
        const name = `${String(offset + i + 1).padStart(4,'0')}_${safeName(event?.title || photo.event_id)}.${ext}`;
        zip.file(name, blob);
        index.push({ file: name, event_id: photo.event_id, title: event?.title || '', event_date: event?.start_date || '', uploaded_at: photo.created_at });
      }
      zip.file('images-index.json', JSON.stringify(index, null, 2));
      zip.file('اقرأني.txt', 'هذه الصور قُرئت بصلاحيات الحساب المسجل من Supabase. قد تشمل صورًا أقدم استُبدلت في الواجهة. يربط images-index.json كل صورة بفعاليتها. لا يتضمن الأرشيف رموز دخول أو روابط موقعة.');
      const archive = await zip.generateAsync({ type:'blob', compression:'STORE' });
      checkAccount(id);
      const part = Math.floor(offset / batchSize) + 1, url = URL.createObjectURL(archive);
      urls.add(url);
      const link = document.createElement('a'); link.href = url; link.download = `school-event-photos-${today()}-part-${part}.zip`;
      link.className = 'btn outline'; link.textContent = `تنزيل ملف الصور ${part} (${selected.length} صورة)`;
      downloads.append(link);
      offset += selected.length;
      message.textContent = `تم تجهيز ${offset} من ${queue.length} صورة. اضغط رابط الملف لتنزيله.` + (offset < queue.length ? ' ثم اضغط تنزيل الدفعة التالية لإكمال الصور.' : ' اكتمل تجهيز جميع الصور.');
      button.textContent = offset < queue.length ? 'تنزيل الدفعة التالية من الصور' : 'تجهيز الصور من جديد';
    } catch (error) {
      message.textContent = 'تعذر تجهيز الصور: ' + (error.name === 'TimeoutError' ? 'انتهت مهلة تحميل صورة؛ أعد المحاولة.' : errorText(error));
    } finally { busy = false; button.disabled = false; syncButton(); }
  });
  document.querySelector('[data-view="documentation"]')?.addEventListener('click', syncButton);
  new MutationObserver(syncButton).observe(document.getElementById('authBtn'), { childList:true, subtree:true, characterData:true });
  window.addEventListener('pagehide', () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); });
  syncButton();
})();
