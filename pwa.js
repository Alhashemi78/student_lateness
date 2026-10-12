(() => {
  'use strict';
  const appRoot = new URL('./', document.currentScript.src);
  const button = document.getElementById('installApp');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;
  const installed = () => standalone.matches || navigator.standalone === true;
  const updateButton = () => { button.hidden = installed(); };
  updateButton();
  standalone.addEventListener?.('change', updateButton);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateButton();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.hidden = true;
  });
  const help = document.createElement('dialog');
  help.className = 'install-help';
  help.setAttribute('aria-labelledby', 'installHeading');
  help.innerHTML = '<h2 id="installHeading">تثبيت مدرستي الرقمية</h2>' +
    '<p>على Android: افتح الرابط في Chrome، ثم من القائمة ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>' +
    '<p>على iPhone: افتح الرابط في Safari، واضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية».</p>' +
    '<p>إذا فتحت الرابط داخل تطبيق آخر، افتحه أولًا في متصفح الهاتف. تسجيل الدخول والحفظ يحتاجان اتصالًا بالإنترنت.</p>' +
    '<form method="dialog"><button type="submit" class="install-app">حسنًا</button></form>';
  document.body.append(help);
  button.addEventListener('click', async () => {
    if (!installPrompt) { help.showModal(); return; }
    button.disabled = true;
    try {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      help.showModal();
    } finally {
      button.disabled = false;
    }
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('sw.js', appRoot).href, { scope: appRoot.pathname })
      .catch(() => { /* Browser menu instructions remain available. */ });
  }
})();
