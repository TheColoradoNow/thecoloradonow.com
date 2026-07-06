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

  window.TheColoradoNow.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
