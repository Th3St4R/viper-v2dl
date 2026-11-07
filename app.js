/* Viper Ping Download Center | links come directly from the official 2dust GitHub releases. */
(() => {
  'use strict';
  const SOURCES = {
    android: {repo:'v2rayNG', label:'v2rayNG', os:'اندروید'},
    windows: {repo:'v2rayN', label:'v2rayN', os:'ویندوز'},
    linux:   {repo:'v2rayN', label:'v2rayN', os:'لینوکس'},
    macos:   {repo:'v2rayN', label:'v2rayN', os:'مک'}
  };
  const state = {platform:'android', releaseIndex:null, showBeta:false, arch:'all', firstLoad:true, sequence:0};
  const cache = new Map();
  const content = document.getElementById('release-content');
  const status = document.getElementById('api-status');
  let countdownTimer = null;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateFa = value => {const d = new Date(value);return Number.isNaN(d.getTime()) ? 'نامشخص' : d.toLocaleDateString('fa-IR',{year:'numeric',month:'long',day:'numeric'});};
  const sizeLabel = bytes => bytes > 0 ? `${(bytes/1048576).toFixed(1)} MB` : '';
  const repoUrl = repo => `https://github.com/2dust/${repo}/releases`;

  function assetUrl(asset, repo) {
    try {
      const u = new URL(asset.browser_download_url);
      return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/2dust/${repo}/releases/download/`) ? u.href : '';
    } catch {return '';}
  }
  function setStatus(message, type='') {
    status.className = 'api-pill' + (type ? ` ${type}` : '');
    status.innerHTML = `<span class="api-dot"></span>${escapeHtml(message)}`;
  }
  function stopCountdown() {if(countdownTimer!==null) clearInterval(countdownTimer);countdownTimer=null;}
  function showLoading() {content.innerHTML='<div class="loading"><div class="loader"></div><strong>داریم آخرین نسخه‌ها رو پیدا می‌کنیم...</strong><p>یه لحظه صبر کن</p></div>';}

  async function loadReleases(repo) {
    const cached = cache.get(repo);
    if(cached && Date.now()-cached.time < 15*60*1000) return cached.data;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),12000);
    try {
      const response = await fetch(`https://api.github.com/repos/2dust/${repo}/releases?per_page=60`,{
        headers:{Accept:'application/vnd.github+json'},signal:controller.signal,cache:'no-store'
      });
      if(!response.ok) {
        if(response.status===403 || response.status===429) throw new Error('گیت‌هاب فعلاً درخواست‌های زیادی دریافت کرده. چند دقیقه دیگه دوباره امتحان کن.');
        throw new Error(`ارتباط با گیت‌هاب برقرار نشد (خطای ${response.status}).`);
      }
      const result = await response.json();
      if(!Array.isArray(result)) throw new Error('پاسخ گیت‌هاب قابل‌خواندن نبود.');
      const releases = result.filter(r=>r && !r.draft && typeof r.tag_name==='string' && Array.isArray(r.assets));
      if(!releases.length) throw new Error('فعلاً نسخه‌ای برای دانلود پیدا نشد.');
      cache.set(repo,{data:releases,time:Date.now()});
      return releases;
    } catch(e) {
      if(e.name==='AbortError') throw new Error('پاسخ گیت‌هاب طول کشید. لطفاً دوباره امتحان کن.');
      throw e;
    } finally {clearTimeout(timeout);}
  }

  function platformAssets(release, platform) {
    const repo = SOURCES[platform].repo;
    return (release.assets||[]).filter(asset=>{
      const name=String(asset.name||'').toLowerCase();
      if(!assetUrl(asset,repo) || /\.(sig|asc|sha256|sha512|txt|json)$/i.test(name)) return false;
      if(platform==='android') return name.endsWith('.apk');
      if(platform==='windows') return /(?:windows|win32|win64|[-_]win[-_]|[-_]win\.)/i.test(name) && /\.(zip|7z|exe|msi)$/i.test(name);
      if(platform==='linux') return /linux/i.test(name) && /(?:\.tar\.gz|\.appimage|\.deb|\.rpm|\.zip)$/i.test(name);
      return /(?:macos|mac[-_.]|osx|darwin)/i.test(name) && /\.(zip|dmg|pkg|tar\.gz)$/i.test(name);
    });
  }
  function architecture(name) {
    const n=String(name).toLowerCase();
    if(/universal/.test(n)) return 'universal';
    if(/(?:arm64|aarch64|arm64-v8a)/.test(n)) return 'arm64';
    if(/(?:armeabi|armv7|arm32)/.test(n)) return 'arm32';
    if(/(?:x86_64|x64|amd64|[-_]64(?:[-_.]|$))/.test(n)) return 'x64';
    if(/(?:x86|i386|[-_]32(?:[-_.]|$))/.test(n)) return 'x86';
    if(/riscv/.test(n)) return 'riscv';
    if(/loong/.test(n)) return 'loong';
    return 'other';
  }
  function archLabel(arch) {return ({universal:'Universal — مناسب بیشتر دستگاه‌ها',arm64:'ARM64',arm32:'ARM32',x64:'x64 / 64-bit',x86:'x86 / 32-bit',riscv:'RISC-V',loong:'LoongArch',other:'سایر'})[arch]||arch;}
  function assetName(asset) {
    const n=String(asset.name||'');
    return archLabel(architecture(n)) + (/fdroid/i.test(n)?' · F-Droid':'') + (/selfcontained/i.test(n)?' · Self-contained':'');
  }
  function preferredAsset(assets) {
    const rank=asset=>{
      const name=asset.name.toLowerCase(), arch=architecture(name);
      if(state.platform==='android') return (arch==='universal'?0:arch==='arm64'?2:5)+(/fdroid/.test(name)?2:0);
      return (arch==='x64'?0:arch==='arm64'?3:6)+(/selfcontained/.test(name)?0:1)+(/\.zip$/.test(name)?0:2);
    };
    return [...assets].sort((a,b)=>rank(a)-rank(b))[0];
  }
  function availableReleases(releases) {
    return releases.map((r,i)=>({r,i})).filter(({r})=>platformAssets(r,state.platform).length>0);
  }
  function showError(message,repo) {
    stopCountdown();setStatus('مشکل در دریافت اطلاعات','error');
    content.innerHTML=`<div class="error-box"><h3>فعلاً نتونستیم نسخه‌ها رو بگیریم</h3><p>${escapeHtml(message)}</p><button class="retry" type="button" id="retry">یه بار دیگه تلاش کن</button><p>اگه عجله داری، <a class="small-link" href="${repoUrl(repo)}" target="_blank" rel="noopener noreferrer">از صفحه رسمی GitHub دانلود کن ↗</a></p></div>`;
    document.getElementById('retry').addEventListener('click',()=>{cache.delete(repo);update();});
  }
  function render(releases,allowCountdown=false) {
    stopCountdown();
    const candidates=availableReleases(releases);
    const stable=candidates.find(({r})=>!r.prerelease);
    if(!stable) return showError('نسخه پایدار مناسب این دستگاه پیدا نشد.',SOURCES[state.platform].repo);
    const index=candidates.some(({i})=>i===state.releaseIndex)?state.releaseIndex:stable.i;
    const release=releases[index], info=SOURCES[state.platform];
    const allAssets=platformAssets(release,state.platform);
    const assets=state.arch==='all'?allAssets:allAssets.filter(a=>architecture(a.name)===state.arch);
    const chosen=preferredAsset(assets);
    const chosenUrl=chosen?assetUrl(chosen,info.repo):'';
    const archOptions=[...new Set(allAssets.map(a=>architecture(a.name)))];
    const history=candidates.filter(({r})=>state.showBeta||!r.prerelease);
    const canAuto=allowCountdown && state.platform==='android' && state.arch==='all' && !release.prerelease && chosen && architecture(chosen.name)==='universal' && !/fdroid/i.test(chosen.name);
    content.innerHTML=`
      <div class="release-top"><div><div class="release-title"><h3>${escapeHtml(info.label)}</h3><span class="version">${escapeHtml(release.tag_name)}</span>${release.prerelease?'<span class="version beta">نسخه آزمایشی</span>':''}</div><p class="meta">انتشار: ${escapeHtml(dateFa(release.published_at))} · مخصوص ${escapeHtml(info.os)} · نسخه اصلی سازنده</p></div><a class="small-link" href="${repoUrl(info.repo)}" target="_blank" rel="noopener noreferrer">صفحه رسمی برنامه ↗</a></div>
      <div class="download-area"><h4>آماده دانلودی؟</h4><p class="hint">فایل پیشنهادی رو بگیر، یا از فهرست پایین معماری دستگاهت رو انتخاب کن.</p>
      <div class="filter-bar"><label for="arch-select">نوع فایل / معماری:</label><select id="arch-select"><option value="all">نمایش همه فایل‌ها</option>${archOptions.map(a=>`<option value="${escapeHtml(a)}" ${state.arch===a?'selected':''}>${escapeHtml(archLabel(a))}</option>`).join('')}</select></div>
      ${chosen?`<a class="primary-download" id="main-download" href="${escapeHtml(chosenUrl)}" target="_blank" rel="noopener noreferrer">↓ دانلود ${escapeHtml(info.label)} — ${escapeHtml(assetName(chosen))}</a>`:'<p class="empty">برای این معماری فایلی پیدا نکردیم؛ گزینه «نمایش همه فایل‌ها» رو انتخاب کن.</p>'}
      <div class="countdown" id="countdown" hidden>دانلود خودکار فایل Universal تا <strong id="seconds">۱۰</strong> ثانیه دیگه شروع می‌شه. <button class="text-btn" type="button" id="cancel-auto">لغو دانلود خودکار</button></div>
      <div class="asset-list">${assets.map(a=>`<a class="asset" href="${escapeHtml(assetUrl(a,info.repo))}" target="_blank" rel="noopener noreferrer"><span class="asset-info"><strong>${escapeHtml(assetName(a))}</strong><small>${escapeHtml(a.name)}${a.size?' · '+escapeHtml(sizeLabel(a.size)):''}</small></span><span class="asset-arrow" aria-hidden="true">↙</span></a>`).join('')}</div>
      <p class="note">لینک‌ها مستقیم به GitHub می‌رن و فایل‌ها از سرور وایپرپینگ دانلود نمی‌شن.</p></div>
      <div class="secondary-sections"><div class="section-card"><h4>نسخه دیگه‌ای لازم داری؟</h4><label class="checkbox-row"><input id="show-beta" type="checkbox" ${state.showBeta?'checked':''}> نسخه‌های آزمایشی (Beta) رو هم نشون بده</label><select class="history-select" id="history-select" aria-label="انتخاب نسخه">${history.map(({r,i})=>`<option value="${i}" ${i===index?'selected':''}>${escapeHtml(r.tag_name)}${r.prerelease?' (Beta)':''} — ${escapeHtml(dateFa(r.published_at))}</option>`).join('')}</select><p>نسخه‌های قبلی رو هم می‌تونی از همین‌جا انتخاب کنی.</p></div>
      <div class="section-card"><h4>تغییرات این نسخه</h4><p>دوست داری بدونی توی این آپدیت چی عوض شده؟</p>${release.body?'<details class="notes-details"><summary>توضیحات سازنده رو ببین</summary><div class="release-notes" id="release-notes"></div></details>':'<p class="empty">سازنده توضیحی برای این نسخه ننوشته.</p>'}<p><a class="small-link" href="${escapeHtml(safeReleaseUrl(release,info.repo))}" target="_blank" rel="noopener noreferrer">مشاهده همین نسخه در GitHub ↗</a></p></div></div>`;
    if(release.body) document.getElementById('release-notes').textContent=release.body;
    document.getElementById('arch-select').addEventListener('change',e=>{state.arch=e.target.value;render(releases);});
    document.getElementById('history-select').addEventListener('change',e=>{state.releaseIndex=Number(e.target.value);state.arch='all';render(releases);});
    document.getElementById('show-beta').addEventListener('change',e=>{state.showBeta=e.target.checked;if(!state.showBeta&&release.prerelease)state.releaseIndex=null;render(releases);});
    content.querySelectorAll('a').forEach(a=>a.addEventListener('click',stopCountdown));
    document.getElementById('cancel-auto').addEventListener('click',()=>{stopCountdown();document.getElementById('countdown').hidden=true;});
    if(canAuto) startCountdown(chosenUrl);
  }
  function safeReleaseUrl(release,repo) {
    try {const u=new URL(release.html_url);if(u.protocol==='https:'&&u.hostname==='github.com'&&u.pathname.startsWith(`/2dust/${repo}/releases/`))return u.href;} catch{}
    return repoUrl(repo);
  }
  function startCountdown(url) {
    const el=document.getElementById('countdown'),counter=document.getElementById('seconds');
    if(!el||!counter||!url)return;
    let remaining=10;el.hidden=false;
    countdownTimer=setInterval(()=>{remaining--;counter.textContent=remaining.toLocaleString('fa-IR');if(remaining<=0){stopCountdown();el.hidden=true;window.location.assign(url);}},1000);
  }
  async function update() {
    stopCountdown();const sequence=++state.sequence,info=SOURCES[state.platform];
    setStatus('در حال بررسی نسخه‌ها');showLoading();
    try {
      const releases=await loadReleases(info.repo);
      if(sequence!==state.sequence)return;
      const stable=availableReleases(releases).find(({r})=>!r.prerelease);
      if(!stable)throw new Error('نسخه پایدار مناسبی برای این دستگاه پیدا نشد.');
      if(state.releaseIndex===null)state.releaseIndex=stable.i;
      const auto=state.firstLoad&&state.platform==='android';state.firstLoad=false;
      setStatus('نسخه‌ها به‌روز هستن','success');render(releases,auto);
    } catch(e) {if(sequence===state.sequence)showError(e.message||'لطفاً اتصال اینترنتت رو بررسی کن.',info.repo);}
  }
  document.querySelectorAll('.platform-tab').forEach(tab=>tab.addEventListener('click',()=>{
    const platform=tab.dataset.platform;
    if(!SOURCES[platform]||platform===state.platform)return;
    state.platform=platform;state.releaseIndex=null;state.arch='all';state.showBeta=false;state.firstLoad=false;
    document.querySelectorAll('.platform-tab').forEach(button=>{const active=button===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    update();
  }));
  update();
})();
