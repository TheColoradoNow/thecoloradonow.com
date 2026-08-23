(function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeTags(article) {
    if (Array.isArray(article?.tags) && article.tags.length) return article.tags;
    if (Array.isArray(article?.tag)) return article.tag;
    return article?.tag ? [article.tag] : [];
  }

  function formatTagLabel(tag) {
    return String(tag ?? '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Unknown date';
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function slugifyName(name) {
    return String(name ?? '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  function makeExcerpt(html, wordCount = 40) {
    return String(html ?? '')
      .replace(/<div class="youtube-embed"[\s\S]*?<\/div>/gi, ' ')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, wordCount)
      .join(' ');
  }

  function makeArticleUrl(article) {
    return `article.html?id=${encodeURIComponent(article.id)}`;
  }

  function makeTagPillsHtml(article) {
    return normalizeTags(article).map((tag) => {
      const slug = String(tag);
      return `<a class="tag-pill" href="tag.html?tag=${encodeURIComponent(slug)}">${escapeHtml(formatTagLabel(slug))}</a>`;
    }).join('');
  }

  function articleMatchesTags(article, tags) {
    const wanted = tags.map((tag) => String(tag).toLowerCase());
    const actual = normalizeTags(article).map((tag) => String(tag).toLowerCase());
    return wanted.some((tag) => actual.includes(tag));
  }

  function createHomepageCard(article) {
    const div = document.createElement('div');
    div.className = 'homepage-article-card';
    const articleUrl = makeArticleUrl(article);
    const title = escapeHtml(article.title);
    div.innerHTML = `
      <a href="${articleUrl}">
        ${article.image ? `<img src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}" class="thumb" loading="lazy">` : ''}
        <h3>${title}</h3>
        <p>By ${escapeHtml(article.author || '')}</p>
      </a>
    `;
    return div;
  }

  function createArticleListItem(article, options = {}) {
    const div = document.createElement('div');
    div.className = options.className || 'article';

    const articleUrl = makeArticleUrl(article);
    const tagsHtml = makeTagPillsHtml(article);
    const dateStr = formatDate(article.timestamp);
    const excerpt = makeExcerpt(article.body, options.excerptWords || 40);
    const showAuthor = options.showAuthor !== false;
    const showViews = options.showViews === true && typeof article.views === 'number';
    const metaParts = [];

    if (showAuthor) metaParts.push(`By ${escapeHtml(article.author || '')}`);
    if (options.publishedPrefix) {
      metaParts.push(`${options.publishedPrefix} ${dateStr}`);
    } else {
      metaParts.push(dateStr);
    }
    if (showViews) metaParts.push(`${article.views} views`);

    div.innerHTML = `
      <h2><a href="${articleUrl}">${escapeHtml(article.title)}</a></h2>
      <div class="${options.metaClass || 'meta'}">${metaParts.join(' - ')}</div>
      ${tagsHtml ? `<div class="tag-pills">${tagsHtml}</div>` : ''}
      ${article.image ? `<a href="${articleUrl}"><img src="${escapeHtml(article.image)}" alt="Image for ${escapeHtml(article.title)}" loading="lazy" style="max-width:100%;height:auto;margin:10px 0;"></a>` : ''}
      <p class="${options.excerptClass || 'excerpt'}">${escapeHtml(excerpt)}...${options.readMore ? ` <a href="${articleUrl}" style="text-decoration:none;">Read more</a>` : ''}</p>
    `;
    return div;
  }

  window.TheColoradoNow = window.TheColoradoNow || {};
  window.TheColoradoNow.articles = {
    articleMatchesTags,
    createArticleListItem,
    createHomepageCard,
    escapeHtml,
    formatDate,
    formatTagLabel,
    makeArticleUrl,
    makeExcerpt,
    makeTagPillsHtml,
    normalizeTags,
    slugifyName
  };
})();
