/* Viper Ping Download Center — no API key or backend required. */
(() => {
  'use strict';
  const SOURCES = {
    android: { repo: 'v2rayNG', label: 'v2rayNG', os: 'اندروید' },
    windows: { repo: 'v2rayN', label: 'v2rayN', os: 'ویندوز' },
    linux:   { repo: 'v2rayN', label: 'v2rayN', os: 'لینوکس' },
    macos:   { repo: 'v2rayN', label: 'v2rayN', os: 'مک‌او‌اس' }
  };
  const cache = new Map();
  const state = { platform: 'android', releaseIndex: 0, showBeta: false, arch: 'all', initial: true, sequence: 0 };
  let countdownTimer = null;
  const content = document.getElementById('release-content');
  const status = document.getElementById('api-status');

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dateFa = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? 'نامشخص' : d.toLocaleDateString('fa-IR', {year:'numeric',month:'long',day:'numeric'}); };
  const sizeLabel = bytes => bytes > 0 ? `${(bytes / 1048576).toFixed(1)} MB` : '';
  const repoUrl = repo => `https://github.com/2dust/${repo}/releases`;
  function assetUrl(asset, repo) {
    try {
      const url = new URL(asset.browser_download_url);
      return url.protocol === 'https:' && url.hostname === 'github.com' &&
        url.pathname.startsWith(`/2dust/${repo}/releases/download/`) ? url.href : '';
    } catch { return ''; }
  }
  function setStatus(message, type = '') {
    status.className = 'live-pill' + (type ? ` ${type}` : '');
    status.innerHTML = `<span class="status-dot"></span> ${escapeHtml(message)}`;
  }
  function stopCountdown() { if (countdownTimer !== null) clearInterval(countdownTimer); countdownTimer = null; }
  function loading() { content.innerHTML = '<div class="loading"><div class="loader"></div><strong>در حال دریافت اطلاعات از GitHub...</strong><p>چند لحظه صبر کن</p></div>'; }

  async function loadReleases(repo) {
    const cached = cache.get(repo);
    if (cached && Date.now() - cached.time < 15 * 60 * 1000) return cached.data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://api.github.com/repos/2dust/${repo}/releases?per_page=60`, {
        headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal, cache: 'no-store'
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) throw new Error('محدودیت موقت درخواست‌های GitHub API فعال شده است.');
        throw new Error(`خطا در ارتباط با GitHub (${response.status})`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('پاسخ نامعتبر از GitHub دریافت شد.');
      const releases = data.filter(r => r && !r.draft && typeof r.tag_name === 'string' && Array.isArray(r.assets));
      if (!releases.length) throw new Error('هیچ نسخه منتشرشده‌ای پیدا نشد.');
      cache.set(repo, {data: releases, time: Date.now()});
      return releases;
    } finally { clearTimeout(timer); }
  }

  function platformAssets(release, platform) {
    const repo = SOURCES[platform].repo;
    return (release.assets || []).filter(a => {
      const name = String(a.name || '').toLowerCase();
      if (!assetUrl(a, repo) || /\.(sig|asc|sha256|sha512|txt|json)$/i.test(name)) return false;
      if (platform === 'android') return name.endsWith('.apk');
      if (platform === 'windows') return /(?:windows|win32|win64|[-_]win[-_]|[-_]win\.)/i.test(name) && /\.(zip|7z|exe|msi)$/i.test(name);
      if (platform === 'linux') return /linux/i.test(name) && /(?:\.tar\.gz|\.appimage|\.deb|\.rpm|\.zip)$/i.test(name);
      return /(?:macos|mac[-_.]|osx|darwin)/i.test(name) && /\.(zip|dmg|pkg|tar\.gz)$/i.test(name);
    });
  }
  function architecture(name) {
    const n = name.toLowerCase();
    if (/universal/.test(n)) return 'universal';
    if (/(?:arm64|aarch64|arm64-v8a)/.test(n)) return 'arm64';
    if (/(?:armeabi|armv7|arm32)/.test(n)) return 'arm32';
    if (/(?:x86_64|x64|amd64|[-_]64(?:[-_.]|$))/.test(n)) return 'x64';
    if (/(?:x86|i386|[-_]32(?:[-_.]|$))/.test(n)) return 'x86';
    if (/riscv/.test(n)) return 'riscv';
    if (/loong/.test(n)) return 'loong';
    return 'other';
  }
  function archLabel(arch) {
    return ({universal:'Universal — همه دستگاه‌ها',arm64:'ARM64',arm32:'ARM32',x64:'x64 / 64-bit',x86:'x86 / 32-bit',riscv:'RISC-V',loong:'LoongArch',other:'سایر'})[arch] || arch;
  }
  function assetName(a) {
    const n = String(a.name || '');
    const extra = /fdroid/i.test(n) ? ' · F-Droid' : '';
    const sc = /selfcontained/i.test(n) ? ' · Self-contained' : '';
    return `${archLabel(architecture(n))}${extra}${sc}`;
  }
  function filteredAssets(release) {
    const assets = platformAssets(release, state.platform);
    return state.arch === 'all' ? assets : assets.filter(a => architecture(a.name) === state.arch);
  }
  function preferredAsset(assets) {
    const rank = asset => {
      const name = asset.name.toLowerCase();
      const arch = architecture(name);
      if (state.platform === 'android') return (arch === 'universal' ? 0 : arch === 'arm64' ? 2 : 5) + (/fdroid/.test(name) ? 2 : 0);
      return (arch === 'x64' ? 0 : arch === 'arm64' ? 3 : 6) + (/selfcontained/.test(name) ? 0 : 1) + (/\.zip$/.test(name) ? 0 : 2);
    };
    return [...assets].sort((a,b) => rank(a) - rank(b))[0];
  }
  function historyList(releases) {
    return releases.map((r, i) => ({r,i})).filter(({r}) => state.showBeta || !r.prerelease);
  }
  function render(releases, allowCountdown = false) {
    stopCountdown();
    const stableIndex = releases.findIndex(r => !r.prerelease);
    if (stableIndex < 0) return renderError('نسخه پایدار پیدا نشد.', SOURCES[state.platform].repo);
    const index = state.releaseIndex >= 0 && state.releaseIndex < releases.length ? state.releaseIndex : stableIndex;
    const release = releases[index];
    const info = SOURCES[state.platform];
    const assets = filteredAssets(release);
    const chosen = preferredAsset(assets);
    const url = chosen ? assetUrl(chosen, info.repo) : '';
    const archOptions = [...new Set(platformAssets(release, state.platform).map(a => architecture(a.name)))];
    const history = historyList(releases);
    const currentVersion = release.tag_name;
    const canAuto = allowCountdown && state.platform === 'android' && state.arch === 'all' &&
      !release.prerelease && chosen && architecture(chosen.name) === 'universal' && !/fdroid/i.test(chosen.name);

    content.innerHTML = `
      <div class="release-top"><div><div class="release-title"><h3>${escapeHtml(info.label)}</h3><span class="version">${escapeHtml(currentVersion)}</span>${release.prerelease ? '<span class="version">آزمایشی</span>' : ''}</div>
      <p class="meta">انتشار: ${escapeHtml(dateFa(release.published_at))} · ${escapeHtml(info.os)} · فایل‌های رسمی 2dust</p></div>
      <a class="small-link" href="${repoUrl(info.repo)}" target="_blank" rel="noopener noreferrer">مشاهده در GitHub ↗</a></div>
      <div class="download-area"><h4>دانلود نسخه ${escapeHtml(currentVersion)}</h4><p class="hint">معماری دستگاه رو انتخاب کن یا از فایل پیشنهادی استفاده کن.</p>
      <div class="filter-bar"><label for="arch-select">معماری:</label><select id="arch-select"><option value="all">همه معماری‌ها</option>${archOptions.map(a => `<option value="${escapeHtml(a)}" ${state.arch === a ? 'selected' : ''}>${escapeHtml(archLabel(a))}</option>`).join('')}</select></div>
      ${chosen ? `<a class="primary-download" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" id="main-download">↓ دانلود پیشنهادی — ${escapeHtml(assetName(chosen))}</a>` : `<p class="empty">برای این معماری فایل پیدا نشد. از لینک GitHub نسخه‌ها را بررسی کن.</p>`}
      <div id="countdown" class="countdown" hidden>دانلود خودکار Universal تا <strong id="seconds">۱۰</strong> ثانیه دیگر · <button class="text-btn" id="cancel-auto" type="button">لغو</button></div>
      <div class="asset-list">${assets.map(a => `<a class="asset" href="${escapeHtml(assetUrl(a, info.repo))}" target="_blank" rel="noopener noreferrer"><span class="asset-info"><strong>${escapeHtml(assetName(a))}</strong><small>${escapeHtml(a.name)}${a.size ? ' · ' + escapeHtml(sizeLabel(a.size)) : ''}</small></span><span class="asset-arrow">↙</span></a>`).join('')}</div>
      <p class="note">دانلودها از GitHub انجام می‌شن؛ این سایت فایل‌ها رو تغییر نمی‌ده یا دوباره میزبانی نمی‌کنه.</p></div>
      <div class="secondary-sections"><div class="section-card"><h4>نسخه‌های قبلی</h4>
      <label class="checkbox-row"><input id="show-beta" type="checkbox" ${state.showBeta ? 'checked' : ''}> نمایش نسخه‌های آزمایشی (Beta)</label>
      <select class="history-select" id="history-select" aria-label="انتخاب نسخه قبلی">${history.map(({r,i}) => `<option value="${i}" ${i === index ? 'selected' : ''}>${escapeHtml(r.tag_name)}${r.prerelease ? ' (Beta)' : ''} — ${escapeHtml(dateFa(r.published_at))}</option>`).join('')}</select>
      <p>فهرست تا ۶۰ انتشار اخیر از GitHub دریافت می‌شه.</p></div>
      <div class="section-card"><h4>توضیحات انتشار</h4><p>برای مشاهده تغییرات این نسخه، بخش زیر رو باز کن.</p>
      ${release.body ? `<details class="notes-details"><summary>نمایش تغییرات نسخه</summary><div class="release-notes" id="release-notes"></div></details>` : '<p class="empty">توضیحی برای این نسخه ثبت نشده است.</p>'}
      <p><a class="small-link" href="${escapeHtml(release.html_url && release.html_url.startsWith(repoUrl(info.repo)) ? release.html_url : repoUrl(info.repo))}" target="_blank" rel="noopener noreferrer">صفحه رسمی همین نسخه ↗</a></p></div></div>`;

    if (release.body) document.getElementById('release-notes').textContent = release.body;
    document.getElementById('arch-select').addEventListener('change', e => {state.arch = e.target.value;render(releases);});
    document.getElementById('history-select').addEventListener('change', e => {state.releaseIndex = Number(e.target.value);state.arch = 'all';render(releases);});
    document.getElementById('show-beta').addEventListener('change', e => {state.showBeta = e.target.checked;render(releases);});
    content.querySelectorAll('a').forEach(a => a.addEventListener('click', stopCountdown));
    document.getElementById('cancel-auto').addEventListener('click', () => {stopCountdown();document.getElementById('countdown').hidden = true;});
    if (canAuto) startCountdown(url);
  }
  function startCountdown(url) {
    const el = document.getElementById('countdown');
    const counter = document.getElementById('seconds');
    if (!el || !counter || !url) return;
    let left = 10;
    el.hidden = false;
    countdownTimer = setInterval(() => {
      left -= 1;
      counter.textContent = left.toLocaleString('fa-IR');
      if (left <= 0) {
        stopCountdown();
        el.hidden = true;
        // Use the original GitHub asset URL. Browser policies may require a click to initiate a download.
        window.location.assign(url);
      }
    }, 1000);
  }
  function renderError(message, repo) {
    stopCountdown();
    setStatus('خطا در اتصال', 'error');
    content.innerHTML = `<div class="error-box"><h3>دریافت اطلاعات ممکن نشد</h3><p>${escapeHtml(message)}</p><button class="retry" type="button" id="retry">تلاش دوباره</button><p><a class="small-link" href="${repoUrl(repo)}" target="_blank" rel="noopener noreferrer">دانلود مستقیم از صفحه رسمی GitHub ↗</a></p></div>`;
    document.getElementById('retry').addEventListener('click', () => {cache.delete(repo);update();});
  }
  async function update() {
    stopCountdown();
    const seq = ++state.sequence;
    const info = SOURCES[state.platform];
    setStatus('در حال دریافت');
    loading();
    try {
      const releases = await loadReleases(info.repo);
      if (seq !== state.sequence) return;
      const stable = releases.findIndex(r => !r.prerelease);
      if (stable < 0) throw new Error('نسخه پایدار پیدا نشد.');
      if (state.initial || state.releaseIndex === null) state.releaseIndex = stable;
      const auto = state.initial && state.platform === 'android';
      state.initial = false;
      setStatus('اطلاعات به‌روز', 'success');
      render(releases, auto);
    } catch (e) { if (seq === state.sequence) renderError(e.message || 'اتصال را بررسی کن.', info.repo); }
  }
  document.querySelectorAll('.platform-tab').forEach(tab => tab.addEventListener('click', () => {
    const platform = tab.dataset.platform;
    if (!SOURCES[platform] || platform === state.platform) return;
    state.platform = platform;
    state.arch = 'all';
    state.showBeta = false;
    state.releaseIndex = null;
    state.initial = false; // Auto-download is reserved for the first visit only.
    document.querySelectorAll('.platform-tab').forEach(b => {const active = b === tab;b.classList.toggle('active', active);b.setAttribute('aria-selected', String(active));});
    update();
  }));
  update();
})();
