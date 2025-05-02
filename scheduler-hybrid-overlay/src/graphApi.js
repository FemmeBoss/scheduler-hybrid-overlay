async function getWatermarkUrl(pageId) {
  try {
    const url = await getDownloadURL(ref(storage, `watermarks/${pageId}.jpg`));
    return url;
  } catch (err) {
    // Silently fail if watermark doesn't exist
    return null;
  }
}

async function renderPages(pages) {
  const renderedPages = [];
  for (const page of pages) {
    const watermarkUrl = await getWatermarkUrl(page.id);
    renderedPages.push({
      ...page,
      watermarkUrl
    });
  }
  return renderedPages;
}

async function fetchAllPages() {
  try {
    console.log('📱 Starting page fetch...');
    const pages = await loadPages();
    
    console.log(`✅ Successfully loaded ${pages.length} pages`);
    console.log(`📊 Stats:
    - Total pages: ${pages.length}
    - With Instagram: ${pages.filter(p => p.hasIG).length}
    - With valid tokens: ${pages.filter(p => p.hasToken).length}
    `);

    return pages;
  } catch (err) {
    console.error('❌ Error fetching pages:', err);
    throw err;
  }
} 