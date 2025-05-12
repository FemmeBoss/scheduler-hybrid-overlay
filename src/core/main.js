import { fetchAllPages } from './core/graphApi.js';

// Add event listener for pages ready
window.addEventListener('fb-pages-ready', (e) => {
  console.log("[DEBUG] Pages ready event received");
  const pages = e.detail;
  if (pages && pages.length > 0) {
    // Get the pages container
    const pagesContainer = document.getElementById('pages-container');
    if (pagesContainer) {
      // Clear existing content
      pagesContainer.innerHTML = '';
      
      // Create page elements
      pages.forEach(page => {
        const pageElement = document.createElement('div');
        pageElement.className = 'page-item';
        pageElement.innerHTML = `
          <img src="${page.picture?.data?.url || 'default-page-icon.png'}" alt="${page.name}" class="page-icon">
          <span class="page-name">${page.name}</span>
          ${page.instagram_business_account ? '<span class="instagram-badge">Instagram</span>' : ''}
        `;
        
        // Add click handler
        pageElement.addEventListener('click', () => {
          // Store selected page
          localStorage.setItem('selected_page', JSON.stringify(page));
          // Update UI to show selected state
          document.querySelectorAll('.page-item').forEach(el => el.classList.remove('selected'));
          pageElement.classList.add('selected');
        });
        
        pagesContainer.appendChild(pageElement);
      });
    }
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  try {
    const pages = await fetchAllPages();
    const event = new CustomEvent('fb-pages-ready', {
      detail: pages
    });
    window.dispatchEvent(event);
  } catch (err) {
    console.error('[ERROR] Failed to load pages:', err);
  }
}); 