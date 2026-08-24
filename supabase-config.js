(function () {
  const SUPABASE_URL = 'https://ilhlwostiitksxhhaqbt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsaGx3b3N0aWl0a3N4aGhhcWJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDIyMzQsImV4cCI6MjA5ODQxODIzNH0.qlQSseaPMy2bYHxnR3xchAtmFTQ-gs1ndR85hhjaIrs';

  window.TheColoradoNow = window.TheColoradoNow || {};
  window.TheColoradoNow.supabaseUrl = SUPABASE_URL;
  window.TheColoradoNow.supabaseAnonKey = SUPABASE_ANON_KEY;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase client library is not loaded.');
    return;
  }

  if (SUPABASE_ANON_KEY === 'PASTE_NEW_SUPABASE_ANON_PUBLIC_KEY_HERE') {
    console.error('Add the new Supabase anon public key in supabase-config.js.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  if (window.location.pathname.endsWith('/admin.html')) {
    const approvedEditorEmails = new Set([
      'julianhanes5@gmail.com',
      'julian.hanes@thecoloradonow.com'
    ]);
    const originalFrom = client.from.bind(client);
    client.from = function guardedFrom(tableName) {
      const builder = originalFrom(tableName);
      if (tableName !== 'authors') return builder;

      return new Proxy(builder, {
        get(target, prop) {
          if (prop !== 'upsert') {
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
          }

          return async function preserveExistingAuthorDetails(payload) {
            const author = Array.isArray(payload) ? payload[0] : payload;
            if (!author || !author.slug) return target.upsert(payload);

            const { data: existing, error: readError } = await originalFrom('authors')
              .select('*')
              .eq('slug', author.slug)
              .maybeSingle();

            if (readError) return { data: null, error: readError };

            if (!existing) return originalFrom('authors').insert(payload);

            const nextAuthor = {
              slug: author.slug,
              name: author.name || existing.name || author.slug,
              bio: author.bio || existing.bio || null,
              photo: author.photo || existing.photo || null
            };

            return originalFrom('authors').update(nextAuthor).eq('slug', author.slug);
          };
        }
      });
    };

    function isApprovedEditor(email) {
      return approvedEditorEmails.has(String(email || '').trim().toLowerCase());
    }

    function addAuthorDeleteButtons() {
      document.querySelectorAll('#authorsManageList button[data-author-action="edit"]').forEach((editButton) => {
        const slug = editButton.dataset.slug;
        if (!slug || editButton.parentElement?.querySelector(`button[data-delete-author-slug="${CSS.escape(slug)}"]`)) return;
        const card = editButton.closest('.admin-item-card');
        const title = card?.querySelector('h3')?.textContent?.trim() || slug;
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'danger-button';
        deleteButton.textContent = 'Delete Author';
        deleteButton.dataset.deleteAuthorSlug = slug;
        deleteButton.dataset.deleteAuthorName = title;
        editButton.insertAdjacentElement('afterend', deleteButton);
      });
    }

    async function deleteAuthorProfile(slug, name) {
      const { data: { session } } = await client.auth.getSession();
      if (!session || !isApprovedEditor(session.user?.email)) {
        alert('You are not approved to delete authors.');
        await client.auth.signOut();
        return;
      }

      const confirmed = window.confirm(`Delete ${name || slug}? This removes the author profile, but it will not delete that author's articles.`);
      if (!confirmed) return;

      const secondConfirmed = window.confirm("Are you sure you're sure? This author profile will be removed from Supabase.");
      if (!secondConfirmed) return;

      const { error } = await originalFrom('authors').delete().eq('slug', slug);
      if (error) {
        console.error(error);
        alert('Failed to delete author: ' + error.message);
        return;
      }

      alert('Author deleted.');
      document.getElementById('refreshAuthors')?.click();
    }

    function getYouTubeVideoId(value) {
      const text = String(value || '').trim();
      if (!text) return '';

      try {
        const url = new URL(text);
        const host = url.hostname.replace(/^www\./, '');
        const parts = url.pathname.split('/').filter(Boolean);

        if (host === 'youtu.be') return parts[0] || '';
        if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
          if (url.pathname === '/watch') return url.searchParams.get('v') || '';
          if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) return parts[1];
        }
      } catch (error) {
        const match = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
        return match ? match[1] : '';
      }

      return '';
    }

    function makeYouTubeEmbedHtml(videoId) {
      const safeVideoId = String(videoId || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!safeVideoId) return '';
      return `<div class="youtube-embed"><iframe src="https://www.youtube.com/embed/${safeVideoId}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`;
    }

    function setAdminArticleBody(html, statusText) {
      const body = document.getElementById('body');
      const preview = document.getElementById('bodyPreview');
      const docStatus = document.getElementById('docStatus');
      if (!body || !preview) return;
      body.value = html || '';
      preview.innerHTML = html || '<p>No document content loaded.</p>';
      if (docStatus && statusText) docStatus.textContent = statusText;
    }

    function addYouTubeEmbedTool() {
      if (document.getElementById('youtubeEmbedTool')) return;
      const bodyPreview = document.getElementById('bodyPreview');
      if (!bodyPreview) return;

      bodyPreview.insertAdjacentHTML('afterend', `
        <div id="youtubeEmbedTool" class="youtube-embed-tool">
          <label for="youtubeEmbedUrl">YouTube Video URL:</label>
          <input type="url" id="youtubeEmbedUrl" placeholder="https://www.youtube.com/watch?v=...">
          <button type="button" id="addYouTubeEmbed" class="secondary-button">Add YouTube Video</button>
          <p id="youtubeEmbedStatus" class="file-status">Paste a YouTube link. It will appear below the thumbnail and above the article text.</p>
        </div>
      `);

      document.getElementById('addYouTubeEmbed')?.addEventListener('click', () => {
        const input = document.getElementById('youtubeEmbedUrl');
        const status = document.getElementById('youtubeEmbedStatus');
        const currentBody = document.getElementById('body')?.value || '';
        const videoId = getYouTubeVideoId(input?.value);
        const embedHtml = makeYouTubeEmbedHtml(videoId);

        if (!embedHtml) {
          if (status) status.textContent = 'That does not look like a supported YouTube link.';
          return;
        }

        const bodyHolder = document.createElement('div');
        bodyHolder.innerHTML = currentBody;
        bodyHolder.querySelectorAll('.youtube-embed').forEach((existingEmbed) => existingEmbed.remove());
        const remainingBody = bodyHolder.innerHTML.trim();
        const nextBody = `${embedHtml}${remainingBody ? `\n\n${remainingBody}` : ''}`;
        setAdminArticleBody(nextBody, 'YouTube video added below the thumbnail and above the article text.');
        if (input) input.value = '';
        if (status) status.textContent = 'YouTube video ready below the thumbnail. Save or update the article to publish it.';
      });
    }

    function addAdminEmbedStyles() {
      if (document.getElementById('adminYouTubeEmbedStyles')) return;
      const style = document.createElement('style');
      style.id = 'adminYouTubeEmbedStyles';
      style.textContent = `
        .youtube-embed-tool {
          border-top: 1px solid #ddd;
          margin-top: 12px;
          padding-top: 12px;
        }
        .youtube-embed-tool label {
          margin-top: 0;
        }
        .youtube-embed-tool button {
          width: auto;
          margin-top: 8px;
        }
        .youtube-embed {
          aspect-ratio: 16 / 9;
          margin: 20px 0;
          width: 100%;
        }
        .youtube-embed iframe {
          border: 0;
          display: block;
          height: 100%;
          width: 100%;
        }
      `;
      document.head.appendChild(style);
    }

    function runAdminEnhancements() {
      const authorsList = document.getElementById('authorsManageList');
      if (authorsList) {
        addAuthorDeleteButtons();
        new MutationObserver(addAuthorDeleteButtons).observe(authorsList, { childList: true, subtree: true });
        authorsList.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-delete-author-slug]');
          if (!button) return;
          deleteAuthorProfile(button.dataset.deleteAuthorSlug, button.dataset.deleteAuthorName);
        });
      }

      addAdminEmbedStyles();
      addYouTubeEmbedTool();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runAdminEnhancements);
    } else {
      runAdminEnhancements();
    }
  }

  window.TheColoradoNow.supabase = client;
})();

