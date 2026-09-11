// Run with Node.js 18+ after publishing or removing articles, then deploy sitemap.xml.
// Uses only the same public, read-only article access as the website.
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const config = await readFile(new URL('supabase-config.js', root), 'utf8');
const endpoint = config.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
const key = config.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
if (!endpoint || !key) throw new Error('Public website database configuration was not found.');

const base = 'https://thecoloradonow.com/';
const urls = new Set(['', 'news.html', 'community.html', 'opinion.html', 'about.html', 'subscribe.html', 'all-articles.html'].map(path => base + path));
let offset = 0;
while (true) {
  const response = await fetch(`${endpoint}/rest/v1/articles?select=id&order=id.asc&offset=${offset}&limit=1000`, {
    headers: {apikey: key, Authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Article lookup failed (${response.status}); existing sitemap was not changed.`);
  const articles = await response.json();
  if (!Array.isArray(articles)) throw new Error('Unexpected article response; existing sitemap was not changed.');
  if (!articles.length) break;
  for (const article of articles) {
    if (article.id === null || article.id === undefined || !Number.isFinite(Number(article.id))) throw new Error('Invalid article ID.');
    urls.add(base + 'article.html?id=' + encodeURIComponent(article.id));
  }
  offset += articles.length;
  if (urls.size > 50000) throw new Error('A sitemap index is required for more than 50,000 URLs.');
}
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  [...urls].map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n') + '\n</urlset>\n';
await writeFile(new URL('sitemap.xml', root), xml);
console.log(`Generated sitemap.xml with ${urls.size} URLs (${offset} articles).`);
