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
  }

  window.TheColoradoNow.supabase = client;
})();
