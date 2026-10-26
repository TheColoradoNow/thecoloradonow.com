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

  function normalizeVideo(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The saved video tile could not be read.');
    const enabled = value.enabled === true;
    const videoId = typeof value.videoId === 'string' ? value.videoId : '';
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const byline = typeof value.byline === 'string' ? value.byline.trim() : '';
    if (enabled && (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title || !byline)) throw new Error('Add a YouTube video, title, and author byline.');
    if (title.length > 200 || byline.length > 120) throw new Error('Use a title of up to 200 characters and a byline of up to 120 characters.');
    return { enabled, videoId, title, byline };
  }

  function normalizeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The saved video tiles could not be read.');
    // Upgrade the original single-video format in memory; do not write until an editor saves.
    if (value.version === 1) return { version: 2, videos: [normalizeVideo(value), normalizeVideo({})] };
    if (value.version !== 2 || !Array.isArray(value.videos) || value.videos.length !== 2) throw new Error('The saved video tiles could not be read.');
    return { version: 2, videos: value.videos.map(normalizeVideo) };
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
      if (!settings) return;
      const grid = section.querySelector('.homepage-video-grid');
      const screen = window.matchMedia('(min-width: 761px)');
      const slots = settings.videos.map((video, index) => {
        const slot = document.createElement('div');
        slot.className = 'homepage-video-slot';
        slot.dataset.videoSlot = String(index + 1);
        grid.appendChild(slot);
        return slot;
      });
      function updateLayout() {
        settings.videos.forEach((video, index) => {
          const visible = video.enabled && (index === 0 || screen.matches);
          slots[index].hidden = !visible;
          if (!visible) slots[index].replaceChildren();
          // Preserve the primary player when resizing across the mobile breakpoint.
          else if (!slots[index].childElementCount) renderCard(slots[index], video);
        });
        section.hidden = !settings.videos.some((video, index) => video.enabled && (index === 0 || screen.matches));
      }
      updateLayout();
      screen.addEventListener('change', updateLayout);
    } catch (error) { console.warn('Homepage video unavailable:', error.message); }
  }

  function initAdmin() {
    const form = document.getElementById('videoTileForm');
    if (!form) return;
    const fields = [1, 2].map(index => ({
      enabled: document.getElementById('videoTileEnabled' + index),
      url: document.getElementById('videoTileUrl' + index),
      title: document.getElementById('videoTileTitle' + index),
      byline: document.getElementById('videoTileByline' + index)
    }));
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
    function updateRequired() {
      fields.forEach(({ enabled, url, title, byline }) => {
        [url, title, byline].forEach(input => { input.required = enabled.checked; });
      });
    }
    function fromForm() {
      return normalizeSettings({ version: 2, videos: fields.map(({ enabled, url, title, byline }, index) => {
        try {
          const link = url.value.trim();
          return normalizeVideo({ enabled: enabled.checked, videoId: link ? videoIdFromUrl(link) : '', title: title.value, byline: byline.value });
        } catch (error) { throw new Error('Video ' + (index + 1) + ': ' + error.message); }
      }) });
    }
    function renderPreview(settings) {
      preview.replaceChildren();
      settings?.videos.forEach((video, index) => {
        if (!video.enabled) return;
        const item = document.createElement('div');
        const label = document.createElement('p');
        label.className = 'file-status';
        label.textContent = index === 0 ? 'Video 1 — all screen sizes' : 'Video 2 — larger screens only';
        const holder = document.createElement('div');
        renderCard(holder, video);
        item.append(label, holder);
        preview.appendChild(item);
      });
    }
    async function load() {
      if (busy) return;
      busy = true; save.disabled = true; reload.disabled = true; previewButton.disabled = true;
      message('Loading video tiles...');
      try {
        const settings = await readSettings();
        fields.forEach(({ enabled, url, title, byline }, index) => {
          const video = settings?.videos[index];
          enabled.checked = video ? video.enabled : index === 0;
          url.value = video?.videoId ? 'https://www.youtube.com/watch?v=' + video.videoId : '';
          title.value = video?.title || '';
          byline.value = video?.byline || '';
        });
        updateRequired();
        renderPreview(settings);
        loaded = true;
        message(settings?.videos.some(video => video.enabled) ? 'Saved video tiles loaded. Video 1 is also shown on mobile.' : 'No videos are showing. Add a video and save to display it on the homepage.');
      } catch (error) { loaded = false; message(error.message, true); }
      finally { busy = false; save.disabled = !loaded; reload.disabled = false; previewButton.disabled = !loaded; }
    }
    fields.forEach(({ enabled }) => enabled.addEventListener('change', updateRequired));
    document.querySelector('[data-panel="video-tile-panel"]').addEventListener('click', () => { if (!loaded) load(); });
    reload.addEventListener('click', load);
    previewButton.addEventListener('click', () => {
      try { renderPreview(fromForm()); message('Preview updated. Save to update the homepage.'); }
      catch (error) { message(error.message, true); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !loaded) return;
      let settings;
      try { settings = fromForm(); } catch (error) { message(error.message, true); return; }
      busy = true; save.disabled = true; reload.disabled = true; previewButton.disabled = true;
      save.textContent = 'Saving...'; message('Saving video tiles...');
      try {
        const { data, error: sessionError } = await app.supabase.auth.getSession();
        if (sessionError || !approvedEditors.has(String(data?.session?.user?.email || '').trim().toLowerCase())) throw new Error('Please sign in with an approved editor account before saving.');
        const body = new Blob([JSON.stringify(settings)], { type: 'application/json' });
        const { error } = await bucket.upload(settingsPath, body, { upsert: true, cacheControl: '0', contentType: 'application/json' });
        if (error) throw new Error('Could not save the video tile: ' + error.message);
        const saved = await readSettings();
        if (JSON.stringify(saved) !== JSON.stringify(settings)) throw new Error('The save could not be verified. Reload the current tile before trying again.');
        renderPreview(saved);
        message(saved.videos.some(video => video.enabled) ? 'Video tiles saved. The homepage now uses these settings; only Video 1 appears on mobile.' : 'Saved. Both video tiles are hidden from the homepage.');
      } catch (error) { message(error.message, true); }
      finally { busy = false; save.disabled = false; reload.disabled = false; previewButton.disabled = false; save.textContent = 'Save Video Tiles'; }
    });
    updateRequired();
  }

  app.videoTile = { videoIdFromUrl, normalizeSettings, readSettings, renderCard };
  initHomepage();
  initAdmin();
})();
