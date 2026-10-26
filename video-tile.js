(function () {
  'use strict';
  const app = window.TheColoradoNow;
  if (!app?.supabase) return;
  const bucket = app.supabase.storage.from('article-assets');
  const settingsPath = 'site-settings/homepage-video.json';
  const settingsUrl = bucket.getPublicUrl(settingsPath).data.publicUrl;
  const approvedEditors = new Set(['julianhanes5@gmail.com', 'julian.hanes@thecoloradonow.com']);

  function videoIdFromUrl(value) {
    let url;
    try { url = new URL(String(value || '').trim()); } catch (_) { throw new Error('Enter a valid YouTube video link.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a valid YouTube video link.');
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    let id = '';
    if (host === 'youtu.be' && parts.length === 1) id = parts[0];
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (['shorts', 'embed', 'live'].includes(parts[0]) && parts.length === 2) id = parts[1];
    }
    if (host === 'youtube-nocookie.com' && parts[0] === 'embed' && parts.length === 2) id = parts[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Use a link to an individual YouTube video, not a channel or playlist.');
    return id;
  }

  function normalizeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The saved video tile could not be read.');
    const enabled = value.enabled === true;
    const videoId = typeof value.videoId === 'string' ? value.videoId : '';
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const byline = typeof value.byline === 'string' ? value.byline.trim() : '';
    if (enabled && (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title || !byline)) throw new Error('Add a YouTube video, title, and author byline.');
    if (title.length > 200 || byline.length > 120) throw new Error('Use a title of up to 200 characters and a byline of up to 120 characters.');
    return { version: 1, enabled, videoId, title, byline };
  }

  async function readSettings() {
    const url = new URL(settingsUrl);
    url.searchParams.set('v', String(Date.now()));
    const response = await fetch(url.href, { cache: 'no-store' });
    if (!response.ok) {
      let details = null;
      try { details = await response.json(); } catch (_) {}
      const missing = details?.code === 'NoSuchKey' || details?.error === 'not_found' || /object not found/i.test(details?.message || '');
      if (response.status === 404 || (response.status === 400 && missing)) return null;
      throw new Error('Could not load the current video tile. Please try again.');
    }
    return normalizeSettings(await response.json());
  }

  function renderCard(container, settings) {
    container.replaceChildren();
    if (!settings?.enabled) return;
    const card = document.createElement('article');
    card.className = 'homepage-article-card homepage-video-card';
    const media = document.createElement('div');
    media.className = 'homepage-video-player';
    const player = document.createElement('iframe');
    // Keep YouTube's native play control: never call playVideo() or enable autoplay.
    player.src = 'https://www.youtube.com/embed/' + settings.videoId + '?autoplay=0&playsinline=1&rel=0';
    player.title = settings.title;
    player.width = '480';
    player.height = '270';
    player.loading = 'lazy';
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    player.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
    player.allowFullscreen = true;
    media.appendChild(player);
    const title = document.createElement('h3');
    title.className = 'homepage-video-title';
    title.textContent = settings.title;
    const byline = document.createElement('p');
    byline.className = 'homepage-video-byline';
    byline.textContent = 'By ' + settings.byline;
    const external = document.createElement('a');
    external.className = 'homepage-video-watch-link';
    external.href = 'https://www.youtube.com/watch?v=' + settings.videoId;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    external.textContent = 'Watch on YouTube';
    card.append(media, title, byline, external);
    container.appendChild(card);
  }

  async function initHomepage() {
    const section = document.getElementById('homepage-video');
    if (!section) return;
    try {
      const settings = await readSettings();
      if (!settings?.enabled) return;
      renderCard(section, settings);
      section.hidden = false;
    } catch (error) { console.warn('Homepage video unavailable:', error.message); }
  }

  function initAdmin() {
    const form = document.getElementById('videoTileForm');
    if (!form) return;
    const enabled = document.getElementById('videoTileEnabled');
    const url = document.getElementById('videoTileUrl');
    const title = document.getElementById('videoTileTitle');
    const byline = document.getElementById('videoTileByline');
    const status = document.getElementById('videoTileStatus');
    const preview = document.getElementById('videoTilePreview');
    const save = document.getElementById('saveVideoTile');
    const reload = document.getElementById('reloadVideoTile');
    const previewButton = document.getElementById('previewVideoTile');
    let loaded = false;
    let busy = false;
    function message(text, error = false) {
      status.textContent = text;
      status.classList.toggle('auth-status-error', error);
    }
    function updateRequired() { [url, title, byline].forEach(input => { input.required = enabled.checked; }); }
    function fromForm() {
      const link = url.value.trim();
      return normalizeSettings({ enabled: enabled.checked, videoId: link ? videoIdFromUrl(link) : '', title: title.value, byline: byline.value });
    }
    async function load() {
      if (busy) return;
      busy = true; save.disabled = true; reload.disabled = true; previewButton.disabled = true;
      message('Loading video tile...');
      try {
        const settings = await readSettings();
        enabled.checked = settings ? settings.enabled : true;
        url.value = settings?.videoId ? 'https://www.youtube.com/watch?v=' + settings.videoId : '';
        title.value = settings?.title || '';
        byline.value = settings?.byline || '';
        updateRequired();
        renderCard(preview, settings);
        loaded = true;
        message(settings?.enabled ? 'Current homepage video loaded.' : 'No video is showing. Add a video and save to display it on the homepage.');
      } catch (error) { loaded = false; message(error.message, true); }
      finally { busy = false; save.disabled = !loaded; reload.disabled = false; previewButton.disabled = !loaded; }
    }
    enabled.addEventListener('change', updateRequired);
    document.querySelector('[data-panel="video-tile-panel"]').addEventListener('click', () => { if (!loaded) load(); });
    reload.addEventListener('click', load);
    previewButton.addEventListener('click', () => {
      try { renderCard(preview, fromForm()); message('Preview updated. Save to update the homepage.'); }
      catch (error) { message(error.message, true); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !loaded) return;
      let settings;
      try { settings = fromForm(); } catch (error) { message(error.message, true); return; }
      busy = true; save.disabled = true; reload.disabled = true; previewButton.disabled = true;
      save.textContent = 'Saving...'; message('Saving video tile...');
      try {
        const { data, error: sessionError } = await app.supabase.auth.getSession();
        if (sessionError || !approvedEditors.has(String(data?.session?.user?.email || '').trim().toLowerCase())) throw new Error('Please sign in with an approved editor account before saving.');
        const body = new Blob([JSON.stringify(settings)], { type: 'application/json' });
        const { error } = await bucket.upload(settingsPath, body, { upsert: true, cacheControl: '0', contentType: 'application/json' });
        if (error) throw new Error('Could not save the video tile: ' + error.message);
        const saved = await readSettings();
        if (JSON.stringify(saved) !== JSON.stringify(settings)) throw new Error('The save could not be verified. Reload the current tile before trying again.');
        renderCard(preview, saved);
        message(saved.enabled ? 'Video tile saved. It is now available on the homepage.' : 'Saved. The video tile is hidden from the homepage.');
      } catch (error) { message(error.message, true); }
      finally { busy = false; save.disabled = false; reload.disabled = false; previewButton.disabled = false; save.textContent = 'Save Video Tile'; }
    });
    updateRequired();
  }

  app.videoTile = { videoIdFromUrl, normalizeSettings, readSettings, renderCard };
  initHomepage();
  initAdmin();
})();
