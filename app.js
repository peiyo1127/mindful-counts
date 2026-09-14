(async()=>{
  try{
    const cssParts=['styles.css.01.part','styles.css.02.part','styles.css.03.part','styles.css.04.part'];
    const jsParts=['app.js.01.part','app.js.02.part','app.js.03.part','app.js.04.part','app.js.05.part','app.js.06.part'];
    const css=(await Promise.all(cssParts.map(p=>fetch('./'+p).then(r=>{if(!r.ok)throw new Error(p);return r.text()})))).join('');
    const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
    const js=(await Promise.all(jsParts.map(p=>fetch('./'+p).then(r=>{if(!r.ok)throw new Error(p);return r.text()})))).join('');
    (0,eval)(js);
  }catch(err){
    console.error('mindful counts failed to load',err);
    document.body.innerHTML='<main style="max-width:420px;margin:80px auto;padding:24px;font-family:serif;color:#333"><h1 style="font-weight:300">mindful counts</h1><p>載入失敗，請重新整理頁面。</p></main>';
  }
})();

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service worker registration failed',err)));
}
