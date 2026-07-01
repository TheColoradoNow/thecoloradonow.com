(function () {
  const SUPABASE_URL = 'https://hnvcbrlyuytmawlpgaal.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImhudmNicmx5dXl0bWF3bHBnYWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NDI5NTYsImV4cCI6MjA3MTExODk1Nn0.Ik4LauJ_QOJGOo9ZOCbxmyldyqVtJy_PfCt-2rH4hLw';

  window.TheColoradoNow = window.TheColoradoNow || {};
  window.TheColoradoNow.supabaseUrl = SUPABASE_URL;
  window.TheColoradoNow.supabaseAnonKey = SUPABASE_ANON_KEY;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase client library is not loaded.');
    return;
  }

  window.TheColoradoNow.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
