(function () {
  const EMUS_PER_CSS_PIXEL = 9525;
  const WORD_DRAWING_NAMESPACE = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const DRAWING_NAMESPACE = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function normalizedWidth(value) {
    const text = String(value || '').trim();
    if (/^\d+(?:\.\d+)?px$/i.test(text)) return text;
    if (/^\d+(?:\.\d+)?%$/.test(text)) return text;
    const number = Number.parseFloat(text);
    return Number.isFinite(number) && number > 0 ? `${number}px` : '';
  }

  function elementWidth(image) {
    return normalizedWidth(image?.style?.width || image?.getAttribute?.('width'));
  }

  function elementWidthPixels(image) {
    const width = elementWidth(image);
    if (!width.endsWith('px')) return null;
    const pixels = Number.parseFloat(width);
    return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
  }

  function figureWidthPixels(figure) {
    const width = String(figure?.style?.width || '');
    if (!width.endsWith('px')) return null;
    const pixels = Number.parseFloat(width);
    return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
  }

  function transferImageWidthToFigure(image, figure) {
    const width = elementWidth(image);
    if (width) figure.style.width = width;
    figure.style.maxWidth = '100%';
    image.removeAttribute('width');
    image.removeAttribute('height');
    image.style.removeProperty('width');
    image.style.removeProperty('height');
    image.style.maxWidth = '100%';
    return width;
  }

  function applyWordImageSizes(html, sizes) {
    const holder = document.createElement('div');
    holder.innerHTML = String(html || '');
    holder.querySelectorAll('img').forEach((image, index) => {
      const width = Number(sizes?.[index]?.width);
      if (!Number.isFinite(width) || width <= 0) return;
      image.style.width = `${Math.round(width * 10) / 10}px`;
      image.style.height = 'auto';
      image.style.maxWidth = '100%';
    });
    return holder.innerHTML;
  }

  async function readWordImageSizes(arrayBuffer) {
    if (!window.JSZip) throw new Error('The Word image-size reader did not load.');
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const documentEntry = zip.file('word/document.xml');
    const relationshipsEntry = zip.file('word/_rels/document.xml.rels');
    if (!documentEntry || !relationshipsEntry) return [];

    const parser = new DOMParser();
    const [documentXml, relationshipsXml] = await Promise.all([
      documentEntry.async('string'),
      relationshipsEntry.async('string')
    ]);
    const relationshipDocument = parser.parseFromString(relationshipsXml, 'application/xml');
    const imageRelationships = new Set();
    Array.from(relationshipDocument.getElementsByTagName('Relationship')).forEach((relationship) => {
      const target = relationship.getAttribute('Target') || '';
      if (/(^|\/)media\//i.test(target)) imageRelationships.add(relationship.getAttribute('Id'));
    });

    const wordDocument = parser.parseFromString(documentXml, 'application/xml');
    return Array.from(wordDocument.getElementsByTagNameNS(WORD_DRAWING_NAMESPACE, 'extent')).flatMap((extent) => {
      const drawing = extent.parentElement;
      const blip = drawing?.getElementsByTagNameNS(DRAWING_NAMESPACE, 'blip')?.[0];
      const relationshipId = blip?.getAttributeNS(RELATIONSHIP_NAMESPACE, 'embed') || blip?.getAttribute('r:embed');
      if (!relationshipId || !imageRelationships.has(relationshipId)) return [];
      const width = Number(extent.getAttribute('cx')) / EMUS_PER_CSS_PIXEL;
      const height = Number(extent.getAttribute('cy')) / EMUS_PER_CSS_PIXEL;
      return Number.isFinite(width) && width > 0 ? [{ width, height }] : [];
    });
  }

  window.TheColoradoNow = window.TheColoradoNow || {};
  window.TheColoradoNow.articleImages = {
    applyWordImageSizes,
    elementWidth,
    elementWidthPixels,
    figureWidthPixels,
    readWordImageSizes,
    transferImageWidthToFigure
  };
})();

