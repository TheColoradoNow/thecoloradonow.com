(function () {
  const SUPABASE_URL = 'https://hnvcbrlyuytmawlpgaal.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiOiJodHRwczovL2hudmNicmx5dXl0bWF3bHBnYWFsLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc1NTU0Mjk1NiwiZXhwIjoyMDcxMTE4OTU2fQ.WRONG';

  window.TheColoradoNow = window.TheColoradoNow || {};
  window.TheColoradoNow.supabaseUrl = SUPABASE_URL;
  window.TheColoradoNow.supabaseAnonKey = SUPABASE_ANON_KEY;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase client library is not loaded.');
    return;
  }

  window.TheColoradoNow.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
