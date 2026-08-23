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

    document.addEventListener('DOMContentLoaded', () => {
      const authorsList = document.getElementById('authorsManageList');
      if (!authorsList) return;
      addAuthorDeleteButtons();
      new MutationObserver(addAuthorDeleteButtons).observe(authorsList, { childList: true, subtree: true });
      authorsList.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-delete-author-slug]');
        if (!button) return;
        deleteAuthorProfile(button.dataset.deleteAuthorSlug, button.dataset.deleteAuthorName);
      });
    });
  }

  window.TheColoradoNow.supabase = client;
})();
