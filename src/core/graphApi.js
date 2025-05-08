import { db } from './firebase-config.js';
import { storage } from './firebase-config.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { ref, getDownloadURL, uploadBytes } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';
import { saveWatermark, getWatermark } from './idb.js'; // Import IndexedDB helpers

console.log("✅ [graphApi.js] loaded");

window.addEventListener('fb-token-ready', (e) => {
  fetchAllPages(e.detail);
});

async function fetchAllPages(token) {
  console.log('[DEBUG] Fetching pages with token length:', token?.length);
  
  const allPages = [];
  let url = `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account&limit=100&access_token=${token}`;

  while (url) {
    const res = await fetch(url);
    const json = await res.json();

    if (!json.data) {
      console.error("❌ No pages returned from Facebook:", json);
      break;
    }

    // Debug: Log page data
    console.log('[DEBUG] Pages returned:', json.data.map(p => ({
      id: p.id,
      name: p.name,
      hasToken: !!p.access_token,
      tokenLength: p.access_token?.length,
      hasIG: !!p.instagram_business_account
    })));

    allPages.push(...json.data);
    url = json.paging?.next || null;
  }

  const uniquePages = Object.values(
    allPages.reduce((acc, page) => {
      acc[page.id] = page;
      return acc;
    }, {})
  );

  const igPages = uniquePages
  .filter(p => p.instagram_business_account?.id)
  .map(p => ({
    id: p.instagram_business_account.id,
    name: `${p.name} (IG)`,
    parentPageId: p.id,
    picture: p.picture,
    platform: 'instagram',
    access_token: p.access_token // ✅ Needed for IG post scheduling
  }));

  console.log(`[DEBUG] Loaded ${uniquePages.length} Facebook pages`);
  console.log(`[DEBUG] Extracted ${igPages.length} Instagram accounts`);
  console.log('[DEBUG] Sample page data:', {
    fb: uniquePages[0] ? {
      id: uniquePages[0].id,
      name: uniquePages[0].name,
      hasToken: !!uniquePages[0].access_token,
      tokenLength: uniquePages[0].access_token?.length
    } : null,
    ig: igPages[0] ? {
      id: igPages[0].id,
      name: igPages[0].name,
      hasToken: !!igPages[0].access_token,
      tokenLength: igPages[0].access_token?.length
    } : null
  });

  renderPages(uniquePages, 'facebookPages', 'facebook');
  renderPages(igPages, 'instagramPages', 'instagram');
}

async function renderPages(pages, containerId, platform) {
  const container = document.getElementById(containerId);
  const sidebar = document.getElementById(platform === 'facebook' ? 'facebookSidebar' : 'instagramSidebar');
  if (!container || !sidebar) return console.warn(`⚠️ Missing elements for platform: ${platform}`);

  // Create and append each page element
  for (const page of pages) {
    const pageElement = document.createElement('div');
    pageElement.className = 'profile-container';
    
    // Check for existing watermark
    let hasWatermark = false;
    try {
      const watermarkRef = ref(storage, `watermarks/${page.id}.jpg`);
      await getDownloadURL(watermarkRef);
      hasWatermark = true;
    } catch (err) {
      hasWatermark = false;
    }

    // Get the platform icon SVG
    const platformIcon = platform === 'facebook' ? 
      '<svg class="platform-icon" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' :
      '<svg class="platform-icon" viewBox="0 0 24 24" fill="url(#instagram-gradient)"><defs><linearGradient id="instagram-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#f09433"/><stop offset="25%" style="stop-color:#e6683c"/><stop offset="50%" style="stop-color:#dc2743"/><stop offset="75%" style="stop-color:#cc2366"/><stop offset="100%" style="stop-color:#bc1888"/></linearGradient></defs><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>';

    pageElement.innerHTML = `
      <div class="profile-header">
        <img src="${page.picture?.data?.url || 'assets/default-profile.png'}" 
             alt="${page.name}" 
             onerror="this.src='assets/default-profile.png'" />
        <div class="profile-info">
          <label class="page-select">
            <input type="checkbox" 
                   data-id="${page.id}" 
                   data-name="${page.name}"
                   data-platform="${platform}"
                   data-parent-id="${page.parentPageId || ''}"
                   data-access-token="${page.access_token || ''}"
                   class="page-checkbox" />
            <span class="page-name">${page.name}</span>
          </label>
          <div class="platform-indicator">
            ${platformIcon}
            ${platform === 'facebook' ? 'Facebook' : 'Instagram'}
          </div>
        </div>
      </div>
      <div class="watermark-management">
        <button class="watermark-btn" onclick="openWatermarkModal('${page.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Manage Watermark
        </button>
        <div class="watermark-status-icon ${hasWatermark ? 'has-watermark' : 'no-watermark'}" title="${hasWatermark ? 'Watermark uploaded' : 'No watermark uploaded'}">
          ${hasWatermark ? '✓' : '⚠️'}
        </div>
      </div>
    `;

    container.appendChild(pageElement);
  }

  // Debug log the rendered pages
  console.log(`[DEBUG] Rendered ${pages.length} ${platform} pages:`, pages.map(p => ({
    id: p.id,
    name: p.name,
    hasToken: !!p.access_token,
    tokenLength: p.access_token?.length
  })));

  // Add search functionality
  const searchInput = document.getElementById(platform === 'facebook' ? 'fbSearch' : 'igSearch');
  searchInput?.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    Array.from(container.children).forEach(row => {
      const text = row.querySelector('.page-name')?.textContent.toLowerCase();
      row.style.display = text.includes(term) ? 'flex' : 'none';
    });
  });

  // Add sidebar collapse functionality
  sidebar.addEventListener('dblclick', () => {
    sidebar.classList.toggle('collapsed');
  });

  console.log(`[RENDERED] ${pages.length} ${platform} pages ✅`);
}

// --- Time Modal Management ---
function openTimeModal(pageId, pageName) {
  const modal = document.getElementById('timeModal');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveTimeBtn');

  if (!modal || !title || !saveBtn) {
    console.error("❌ Modal elements not found.");
    return;
  }

  modal.style.display = 'block';
  title.innerText = `Set Default Times for ${pageName}`;
  loadDefaultTimes(pageId);

  saveBtn.onclick = () => {
    const selectedDays = Array.from(document.querySelectorAll('.weekday-checkbox:checked')).map(cb => cb.value);
    const selectedTime = document.getElementById('modalTime').value;
    saveDefaultTimes(pageId, selectedDays, selectedTime);
    modal.style.display = 'none';
  };
}

document.getElementById('closeModal')?.addEventListener('click', () => {
  const modal = document.getElementById('timeModal');
  if (modal) modal.style.display = 'none';
});

async function saveDefaultTimes(pageId, days, time) {
  try {
    await setDoc(doc(db, 'default_times', pageId), { days, time });
    console.log("[DEBUG] Saved default times for", pageId);
  } catch (err) {
    console.error("🔥 Error saving default times:", err);
  }
}

async function loadDefaultTimes(pageId) {
  try {
    const snap = await getDoc(doc(db, 'default_times', pageId));
    if (!snap.exists()) return;

    const { days = [], time = '' } = snap.data();
    document.getElementById('modalTime').value = time;
    document.querySelectorAll('.weekday-checkbox').forEach(cb => {
      cb.checked = days.includes(cb.value);
    });
  } catch (err) {
    console.error("🔥 Error loading default times:", err);
  }
}

async function handleWatermarkUpload(pageId, file) {
  try {
    // Upload to Firebase Storage
    const storageRef = ref(storage, `watermarks/${pageId}.jpg`);
    await uploadBytes(storageRef, file);
    const watermarkUrl = await getDownloadURL(storageRef);

    // Save to IndexedDB
    await saveWatermark(pageId, watermarkUrl);

    // Update the UI
    const container = document.querySelector(`.profile-container input[data-id="${pageId}"]`)?.closest('.profile-container');
    if (container) {
      const statusIcon = container.querySelector('.watermark-status-icon');
      if (statusIcon) {
        statusIcon.className = 'watermark-status-icon has-watermark';
        statusIcon.innerHTML = '✓';
        statusIcon.title = 'Watermark uploaded';
      }
    }

    showNotification('Watermark uploaded successfully', 'success');
    return watermarkUrl;
  } catch (error) {
    console.error('Failed to upload watermark:', error);
    showNotification('Failed to upload watermark', 'error');
    throw error;
  }
}

// Make it globally available
window.handleWatermarkUpload = handleWatermarkUpload;

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}