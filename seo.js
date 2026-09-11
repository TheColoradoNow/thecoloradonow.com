(function () {
  'use strict';
  const base = 'https://thecoloradonow.com/';
  const logo = base + 'colorado-now-logo-2026.png';

  function meta(key, value) {
    const attribute = key.includes(':') && !key.startsWith('twitter:') ? 'property' : 'name';
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    element.content = value;
  }

  function canonical(url) {
    let element = document.head.querySelector('link[rel="canonical"]');
    if (!element) {
      element = document.createElement('link');
      element.rel = 'canonical';
      document.head.appendChild(element);
    }
    element.href = url;
    meta('og:url', url);
  }

  function plainText(value) {
    const holder = document.createElement('template');
    holder.innerHTML = String(value || '');
    holder.content.querySelectorAll('script,style,iframe').forEach((element) => element.remove());
    return holder.content.textContent.replace(/\s+/g, ' ').trim();
  }

  function page(title, description) {
    document.title = title;
    const excerpt = plainText(description).slice(0, 160);
    meta('description', excerpt);
    meta('og:title', title);
    meta('twitter:title', title);
    meta('og:description', excerpt);
    meta('twitter:description', excerpt);
  }

  function article(data, authorName, authorSlug) {
    const url = base + 'article.html?id=' + encodeURIComponent(data.id);
    canonical(url);
    page(data.title + ' | Colorado Now', data.body || data.title);
    let image = '';
    try {
      const candidate = new URL(data.image, base);
      if (data.image && ['http:', 'https:'].includes(candidate.protocol)) image = candidate.href;
    } catch (_) { /* Leave absent images out of article structured data. */ }
    meta('og:type', 'article');
    meta('og:image', image || logo);
    meta('twitter:image', image || logo);
    meta('og:image:alt', image ? data.title : 'Colorado Now logo');
    meta('twitter:image:alt', image ? data.title : 'Colorado Now logo');
    meta('twitter:card', image ? 'summary_large_image' : 'summary');
    const structured = {
      '@context': 'https://schema.org', '@type': 'NewsArticle',
      '@id': url + '#article', url, mainEntityOfPage: url, headline: data.title,
      publisher: {'@type': 'Organization', '@id': base + '#organization', name: 'Colorado Now', url: base,
        logo: {'@type': 'ImageObject', url: logo}}
    };
    if (authorName && authorName !== 'Unknown') {
      structured.author = {'@type': 'Person', name: authorName};
      if (authorSlug) structured.author.url = base + 'author.html?author=' + encodeURIComponent(authorSlug);
      meta('author', authorName);
    }
    const date = data.timestamp ? new Date(data.timestamp) : null;
    if (date && Number.isFinite(date.getTime())) {
      structured.datePublished = date.toISOString();
      meta('article:published_time', structured.datePublished);
    }
    if (image) structured.image = [image];
    let script = document.getElementById('article-jsonld');
    if (!script) {
      script = document.createElement('script');
      script.id = 'article-jsonld';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structured).replace(/</g, '\\u003c');
  }

  function notFound() {
    meta('robots', 'noindex, follow');
    document.getElementById('article-jsonld')?.remove();
  }

  const file = location.pathname.split('/').pop();
  const parameter = {'article.html': 'id', 'author.html': 'author', 'tag.html': 'tag'}[file];
  const value = new URLSearchParams(location.search).get(parameter);
  if (parameter && value) {
    canonical(base + file + '?' + parameter + '=' + encodeURIComponent(value));
  }
  window.ColoradoNowSEO = {page, article, notFound};
})();
