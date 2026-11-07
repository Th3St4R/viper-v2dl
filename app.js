/* Viper Ping — latest official stable downloads from GitHub Releases. */
(() => {
  'use strict';
  const PLATFORMS = {
    android: {repo:'v2rayNG', title:'v2rayNG', name:'اندروید'},
    windows: {repo:'v2rayN', title:'v2rayN', name:'ویندوز'},
    linux:   {repo:'v2rayN', title:'v2rayN', name:'لینوکس'},
    macos:   {repo:'v2rayN', title:'v2rayN', name:'مک'}
  };
  const state = {platform:'android', requestId:0};
  const cache = new Map();
  const panel = document.getElementById('release-content');
  const status = document.getElementById('api-status');
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const repoPage = repo => `https://github.com/2dust/${repo}/releases`;
  const formatSize = size => size ? `${(size/1048576).toFixed(1)} MB` : '';
  const formatDate = iso => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fa-IR', {year:'numeric',month:'long',day:'numeric'});
  };
  function validAssetUrl(asset, repo) {
    try {
      const u = new URL(asset.browser_download_url);
      return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/2dust/${repo}/releases/download/`) ? u.href : '';
    } catch {return '';}
  }
  function matchingAssets(release, platform) {
    const repo = PLATFORMS[platform].repo;
    return (release.assets || []).filter(asset => {
      const name = String(asset.name || '').toLowerCase();
      if (!validAssetUrl(asset, repo) || /(?:\.sha\d*|\.sig|\.asc|\.txt|\.json|\.md5)$/i.test(name)) return false;
      if (platform === 'android') return /\.apk$/.test(name);
      if (platform === 'windows') return /(?:windows|win32|win64|[-_]win[-_.])/i.test(name) && /\.(?:zip|7z|exe|msi)$/i.test(name);
      if (platform === 'linux') return /linux/i.test(name) && /(?:\.tar\.gz|\.appimage|\.deb|\.rpm|\.zip)$/i.test(name);
      return /(?:macos|mac[-_.]|osx|darwin)/i.test(name) && /(?:\.zip|\.dmg|\.pkg|\.tar\.gz)$/i.test(name);
    });
  }
  function arch(name) {
    const n = name.toLowerCase();
    if (/universal/.test(n)) return 'Universal';
    if (/arm64|aarch64|arm64-v8a/.test(n)) return 'ARM64';
    if (/armeabi|armv7|arm32/.test(n)) return 'ARM32';
    if (/x86_64|x64|amd64|[-_]64(?:[-_.]|$)/.test(n)) return '64-bit';
    if (/x86|i386|[-_]32(?:[-_.]|$)/.test(n)) return '32-bit';
    return 'سایر';
  }
  function pickPreferred(assets, platform) {
    return [...assets].sort((a,b) => {
      function score(asset) {
        const n = asset.name.toLowerCase();
        if (platform === 'android') return (/universal/.test(n)?0:/arm64/.test(n)?2:5) + (/fdroid/.test(n)?2:0);
        if (platform === 'windows') return (/x64|amd64|[-_]64(?:[-_.]|$)/.test(n)?0:/arm64/.test(n)?3:5) + (/selfcontained/.test(n)?0:1) + (/\.zip$/.test(n)?0:2);
        if (platform === 'macos') return (/arm64|aarch64/.test(n)?0:/x64|amd64|[-_]64(?:[-_.]|$)/.test(n)?1:3) + (/\.zip$/.test(n)?0:1);
        return (/x64|amd64|[-_]64(?:[-_.]|$)/.test(n)?0:/arm64|aarch64/.test(n)?2:4) + (/\.deb$/.test(n)?0:1);
      }
      return score(a)-score(b);
    })[0];
  }
  function setStatus(message, error=false) {
    status.className = 'status' + (error ? ' error' : '');
    status.innerHTML = `<span class="status-dot"></span>${esc(message)}`;
  }
  async function getReleases(repo) {
    const cached = cache.get(repo);
    if (cached && Date.now() - cached.time < 10*60*1000) return cached.data;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`https://api.github.com/repos/2dust/${repo}/releases?per_page=40`, {
        headers:{Accept:'application/vnd.github+json'}, signal:controller.signal, cache:'no-store'
      });
      if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'گیت‌هاب فعلاً محدودیت درخواست داره.' : 'ارتباط با گیت‌هاب برقرار نشد.');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('اطلاعات نسخه‌ها دریافت نشد.');
      const stable = data.filter(r => r && !r.draft && !r.prerelease && Array.isArray(r.assets));
      cache.set(repo, {time:Date.now(),data:stable});
      return stable;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('گیت‌هاب دیر جواب داد.');
      throw e;
    } finally {clearTimeout(timeout);}
  }
  function errorView(message, repo) {
    setStatus('خطا در دریافت نسخه', true);
    panel.innerHTML = `<div class="error-box"><h3>فعلاً لینک دانلود بارگذاری نشد</h3><p>${esc(message)} می‌تونی دوباره امتحان کنی یا از صفحه رسمی برنامه دانلود کنی.</p><button class="retry" id="retry" type="button">تلاش دوباره</button><p><a class="official-link" href="${repoPage(repo)}" target="_blank" rel="noopener noreferrer">صفحه دانلود رسمی در GitHub ↗</a></p></div>`;
    document.getElementById('retry').addEventListener('click', () => {cache.delete(repo);update();});
  }
  function render(release, assets, platform) {
    const info = PLATFORMS[platform];
    const preferred = pickPreferred(assets, platform);
    const preferredUrl = validAssetUrl(preferred, info.repo);
    const extras = assets.filter(a => a !== preferred);
    setStatus('آخرین نسخه آماده‌ست');
    panel.innerHTML = `
      <div class="release-head">
        <div><div class="release-title"><h3>${esc(info.title)}</h3><span class="version">${esc(release.tag_name)}</span></div><p class="release-meta">آخرین نسخه پایدار برای ${esc(info.name)}${release.published_at ? ' · '+esc(formatDate(release.published_at)) : ''}</p></div>
        <a class="official-link" href="${repoPage(info.repo)}" target="_blank" rel="noopener noreferrer">GitHub رسمی ↗</a>
      </div>
      <div class="download-main">
        <div class="download-info"><strong>دانلود پیشنهادی ${esc(info.name)} — ${esc(arch(preferred.name))}</strong><small>${esc(preferred.name)}${preferred.size ? ' · '+esc(formatSize(preferred.size)) : ''}</small></div>
        <a class="main-download" href="${esc(preferredUrl)}" target="_blank" rel="noopener noreferrer">↓ دانلود آخرین نسخه</a>
      </div>
      ${extras.length ? `<p class="other-title">فایل‌های دیگه همین نسخه:</p><div class="asset-list">${extras.map(a => `<a class="asset-link" href="${esc(validAssetUrl(a, info.repo))}" target="_blank" rel="noopener noreferrer"><span><strong>${esc(arch(a.name))}</strong><small>${esc(a.name)}${a.size ? ' · '+esc(formatSize(a.size)) : ''}</small></span><span aria-hidden="true">↙</span></a>`).join('')}</div>` : ''}`;
  }
  async function update() {
    const id = ++state.requestId;
    const platform = state.platform;
    const repo = PLATFORMS[platform].repo;
    setStatus('در حال بررسی');
    panel.innerHTML = '<div class="loading"><div class="spinner"></div><p>یه لحظه، داریم آخرین نسخه رو پیدا می‌کنیم…</p></div>';
    try {
      const releases = await getReleases(repo);
      if (id !== state.requestId) return;
      const release = releases.find(r => matchingAssets(r, platform).length);
      if (!release) throw new Error('فایل مناسب این دستگاه پیدا نشد.');
      render(release, matchingAssets(release, platform), platform);
    } catch (e) {
      if (id === state.requestId) errorView(e.message || 'مشکلی پیش اومده.', repo);
    }
  }
  document.querySelectorAll('.platform').forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.platform;
    if (!PLATFORMS[next] || next === state.platform) return;
    state.platform = next;
    document.querySelectorAll('.platform').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    update();
  }));
  document.getElementById('year').textContent = String(new Date().getFullYear());
  update();
})();
