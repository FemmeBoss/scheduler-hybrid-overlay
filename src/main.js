// --- OFFLINE HANDLER ---
import '../offlineHandler.js';  // ✅

// --- CORE ---
import './core/auth.js';
import './core/graphApi.js';
import './core/firebase-config.js';  // Correct path
import './core/firebaseTimes.js';
import './core/idb.js';
import './core/scheduler.js';
import './core/uploader.js';

// --- FIREBASE STORAGE (needed for watermark management) ---
import { db, storage } from './core/firebase-config.js';
import { ref, getDownloadURL, uploadBytes, deleteObject } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

// --- FEATURES ---
import './features/viewscheduled.js';
import './features/groupManager.js';
import './features/timeModal.js';
import './features/deleteScheduled.js';
import './features/popup.js';
import './features/timeSettings.js';
import './features/timeManager.js';
import './features/csvParser.js';
import './features/imageLoader.js';

// --- ENHANCEMENTS ---
import './enhancements/dragDropCsv.js';
import './enhancements/sessionStorageHandler.js';
import './enhancements/processInBatches.js';
import './enhancements/retryHelper.js';

// --- RESTORE SESSION ---
import { restorePageSelections } from './enhancements/sessionStorageHandler.js';
import { checkAuth, getToken } from './core/auth.js';

import { collection, getDocs, doc, deleteDoc, updateDoc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getWatermark, saveWatermark, openDatabase } from './core/idb.js';

import { fetchAllPages } from './core/graphApi.js';

// Initialize scheduledPosts array
let scheduledPosts = [];

// Track selected pages
let selectedPages = {
  facebook: new Set(),
  instagram: new Set()
};

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// --- INIT ---
window.addEventListener('DOMContentLoaded', async () => {
  console.log('[DEBUG] Checking authentication before initializing...');
  const isAuthenticated = await checkAuth();
  
  if (!isAuthenticated) {
    console.log('[DEBUG] User not authenticated, skipping initialization');
    return;
  }
  
  console.log('[DEBUG] User authenticated, initializing page...');
  
  try {
    const token = await getToken();
    if (!token) {
      console.error('[ERROR] No Facebook access token found.');
      return;
    }
    const pages = await fetchAllPages(token);
    window.dispatchEvent(new CustomEvent('fb-pages-ready', { detail: pages }));

    restorePageSelections();
    injectManageWatermarkButtons();
    updateScheduleButton();

    const csvInput = document.getElementById('postCsv');
    const status = document.getElementById('csvUploadStatus');
    const text = document.getElementById('csvUploadText');
    // Add or create a CSV confirmation badge
    let csvConfirm = document.getElementById('csvConfirmBadge');
    if (!csvConfirm) {
      csvConfirm = document.createElement('div');
      csvConfirm.id = 'csvConfirmBadge';
      csvConfirm.style.fontSize = '13px';
      csvConfirm.style.color = '#228B22';
      csvConfirm.style.marginTop = '4px';
      csvConfirm.style.display = 'none';
      csvConfirm.style.alignItems = 'center';
      csvConfirm.style.gap = '6px';
      csvInput?.parentNode?.insertBefore(csvConfirm, csvInput.nextSibling);
    }

    if (csvInput && status && text) {
      csvInput.addEventListener('change', async (e) => {
        console.log('[DEBUG] CSV input change event fired');
        if (e.target.files.length > 0) {
          const file = e.target.files[0];
          console.log('[DEBUG] CSV file selected:', file.name);
          text.textContent = `CSV uploaded: ${file.name}`;
          status.style.opacity = '1';
          try {
            const posts = await parseCsv(file);
            console.log('[DEBUG] Parsed posts from CSV:', posts);
            showNotification(`CSV file uploaded: ${file.name} (${posts.length} posts detected)`, 'success');
            text.textContent += ` (${posts.length} posts)`;
            // Show confirmation badge
            csvConfirm.innerHTML = `✔️ <strong>CSV attached:</strong> ${file.name} <span style='color:#888;'>(${posts.length} posts)</span>`;
            csvConfirm.style.display = 'flex';
          } catch (err) {
            console.error('[DEBUG] Error parsing CSV file:', err);
            showNotification('Error parsing CSV file', 'error');
            text.textContent += ' (Error reading file)';
            csvConfirm.innerHTML = `<span style='color:#b00;'>❌ CSV error</span>`;
            csvConfirm.style.display = 'flex';
          }
        } else {
          text.textContent = '';
          status.style.opacity = '0';
          csvConfirm.style.display = 'none';
        }
      });
    }

    // Sidebar Toggle Functionality
    const sidebars = document.querySelectorAll('.sidebar');
    const mainContainer = document.getElementById('mainContainer');

    sidebars.forEach(sidebar => {
      const toggle = sidebar.querySelector('.sidebar-toggle');
      
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        // Check if both sidebars are collapsed
        const allCollapsed = Array.from(sidebars).every(s => s.classList.contains('collapsed'));
        mainContainer.classList.toggle('sidebar-collapsed', allCollapsed);
        
        // Save state to localStorage
        const sidebarId = sidebar.id;
        localStorage.setItem(`${sidebarId}-collapsed`, sidebar.classList.contains('collapsed'));
      });
    });

    // Restore sidebar states from localStorage
    sidebars.forEach(sidebar => {
      const sidebarId = sidebar.id;
      const isCollapsed = localStorage.getItem(`${sidebarId}-collapsed`) === 'true';
      if (isCollapsed) {
        sidebar.classList.add('collapsed');
      }
    });

    // Check initial state for mainContainer
    const allCollapsed = Array.from(sidebars).every(s => s.classList.contains('collapsed'));
    mainContainer.classList.toggle('sidebar-collapsed', allCollapsed);

    initializePageSelections();
    
    console.log('[DEBUG] Page initialization complete');
  } catch (error) {
    console.error('[DEBUG] Error during initialization:', error);
    showNotification('Error initializing page: ' + error.message, 'error');
  }
});

// --- WATERMARK MANAGER ---
let currentProfileId = null;

document.addEventListener('click', function (e) {
  if (e.target.classList.contains('manage-watermark-btn')) {
    currentProfileId = e.target.dataset.profileId;
    openWatermarkModal(currentProfileId);
  }
});

// Modal handling functions
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'block';
  }
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('edit-modal') || e.target.classList.contains('confirm-modal')) {
    hideModal(e.target.id);
  }
});

// Close buttons for modals
document.querySelectorAll('.edit-modal-close, #cancelEdit, #cancelDelete').forEach(btn => {
  btn.addEventListener('click', () => {
    hideModal(btn.closest('.edit-modal, .confirm-modal').id);
  });
});

function openEditModal(postId) {
  const post = scheduledPosts.find(p => p.id === postId);
  if (!post) {
    console.error('Post not found:', postId);
    return;
  }

  currentEditPostId = postId;
  const modal = document.getElementById('editModal');
  const captionInput = document.getElementById('editCaption');
  const timeInput = document.getElementById('editScheduledTime');

  captionInput.value = post.caption;
  // Only set the time input if the post has a scheduled time
  if (post.scheduledTime || post.scheduleDate) {
    const scheduledDate = new Date(post.scheduledTime || post.scheduleDate);
    timeInput.value = formatDateTimeForInput(scheduledDate);
  } else {
    // Do not set the time input to now; leave it unchanged
    timeInput.value = '';
  }

  showModal('editModal');
}

function openDeleteModal(postId) {
  const modal = document.getElementById('deleteModal');
  modal.dataset.postId = postId;
  showModal('deleteModal');
}

function openWatermarkModal(profileId) {
  currentProfileId = profileId;
  const modal = document.getElementById('watermarkModal');
  const preview = document.getElementById('watermarkPreview');
  const msg = document.getElementById('noWatermarkMsg');
  preview.src = '';
  msg.textContent = '';

  getWatermark(profileId)
    .then(dataUrl => {
      if (dataUrl) {
        preview.src = dataUrl;
        msg.textContent = '';
      } else {
        msg.textContent = 'No watermark found for this profile.';
      }
    })
    .catch(() => {
      msg.textContent = 'No watermark found for this profile.';
    });

  modal.classList.add('active');
}

document.getElementById('closeWatermarkModal').onclick = () => {
  document.getElementById('watermarkModal').classList.remove('active');
};

document.getElementById('uploadWatermarkBtn').onclick = async () => {
  const file = document.getElementById('watermarkUploadInput').files[0];
  if (!file) return alert('Choose a file first!');
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    try {
      await saveWatermark(currentProfileId, dataUrl);
      alert('✅ Watermark uploaded!');
      openWatermarkModal(currentProfileId);
    } catch (err) {
      console.error(err);
      alert('❌ Failed to upload watermark.');
    }
  };
  reader.readAsDataURL(file);
};

document.getElementById('deleteWatermarkBtn').onclick = async () => {
  if (!confirm('⚠️ Are you sure you want to delete this watermark?')) return;
  try {
    // Remove from IndexedDB using openDatabase from idb.js
    const db = await openDatabase();
    const tx = db.transaction('watermarks', 'readwrite');
    tx.objectStore('watermarks').delete(currentProfileId);
    tx.oncomplete = async () => {
      // Remove from Firebase Storage
      const { storage } = await import('./core/firebase-config.js');
      const { ref, deleteObject } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js');
      const fileRef = ref(storage, `watermarks/${currentProfileId}.jpg`);
      try {
        await deleteObject(fileRef);
        alert('✅ Watermark deleted!');
      } catch (err) {
        console.error(err);
        alert('❌ Failed to delete watermark from cloud.');
      }
      openWatermarkModal(currentProfileId);
    };
    tx.onerror = () => {
      alert('❌ Failed to delete watermark locally.');
    };
  } catch (err) {
    console.error(err);
    alert('❌ Failed to delete watermark.');
  }
};

// Edit and Delete functionality for scheduled posts
let currentEditPostId = null;

function initializePostActions() {
  // Edit button click handler
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const postId = e.target.closest('.scheduled-post').dataset.postId;
      const post = scheduledPosts.find(p => p.id === postId);
      if (post) {
        openEditModal(post.id);
      }
    });
  });

  // Delete button click handler
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const postId = e.target.closest('.scheduled-post').dataset.postId;
      openDeleteModal(postId);
    });
  });
}

// Save edit
document.getElementById('saveEdit').addEventListener('click', async () => {
  if (!currentEditPostId) return;

  const caption = document.getElementById('editCaption').value;
  const scheduledTimeLocal = document.getElementById('editScheduledTime').value; // e.g. '2025-05-12T14:42'
  const scheduledTime = new Date(scheduledTimeLocal); // This is local time

  try {
    const postRef = doc(db, 'scheduledPosts', currentEditPostId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const post = postSnap.data();
    
    // Cancel the original scheduled post if it's a Facebook post
    if (post.platform === 'facebook' && post.postId) {
      try {
        await fetch(`https://graph.facebook.com/${post.postId}?access_token=${post.pageAccessToken}`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.warn('Failed to delete original Facebook post:', error);
      }
    }

    // For Instagram, remove from pending queue if not yet published
    if (post.platform === 'instagram' && post.creationId) {
      const pendingQuery = query(
        collection(db, 'pendingIGPosts'),
        where('creationId', '==', post.creationId)
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      pendingSnapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });
    }

    // Update the post in Firestore with new status
    await updateDoc(postRef, {
      caption,
      scheduleDate: scheduledTime.toISOString(),
      scheduledTime: scheduledTime.toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'edited',
      originalPostId: post.postId, // Store the original post ID
      postId: null // Clear the post ID as it's a new schedule
    });

    // Update local state
    const postIndex = scheduledPosts.findIndex(p => p.id === currentEditPostId);
    if (postIndex !== -1) {
      scheduledPosts[postIndex] = {
        ...scheduledPosts[postIndex],
        caption,
        scheduleDate: scheduledTime.toISOString(),
        scheduledTime: scheduledTime.toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'edited',
        originalPostId: post.postId,
        postId: null
      };
    }

    hideModal('editModal');
    showNotification('Post updated successfully! The post will be rescheduled.', 'success');
    renderScheduledPosts();
  } catch (error) {
    console.error('Error updating post:', error);
    showNotification('Failed to update post. Please try again.', 'error');
  }
});

// Confirm delete
document.getElementById('confirmDelete').addEventListener('click', async () => {
  const modal = document.getElementById('deleteModal');
  const postId = modal.dataset.postId;

  try {
    const postRef = doc(db, 'scheduledPosts', postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) throw new Error('Post not found');

    const post = postSnap.data();

    // Cancel Facebook scheduled post if it exists
    if (post.platform === 'facebook' && post.postId) {
      try {
        await fetch(`https://graph.facebook.com/${post.postId}?access_token=${post.pageAccessToken}`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.warn('Failed to delete Facebook post:', error);
      }
    }

    // Remove from Instagram pending queue if it exists
    if (post.platform === 'instagram' && post.creationId) {
      const pendingQuery = query(
        collection(db, 'pendingIGPosts'),
        where('creationId', '==', post.creationId)
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      pendingSnapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });
    }

    // Update the post status instead of deleting
    await updateDoc(postRef, {
      status: 'deleted',
      deletedAt: new Date().toISOString()
    });

    // Update local state
    scheduledPosts = scheduledPosts.filter(p => p.id !== postId);
    
    hideModal('deleteModal');
    showNotification('Post deleted successfully!', 'success');
    renderScheduledPosts();
  } catch (error) {
    console.error('Error deleting post:', error);
    showNotification('Failed to delete post. Please try again.', 'error');
  }
});

// Helper function to format date for datetime-local input
function formatDateTimeForInput(date) {
  // Format as YYYY-MM-DDTHH:mm in local time
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Update the renderScheduledPosts function
function renderScheduledPosts() {
  const container = document.getElementById('scheduledPostsContainer');
  if (!container) return;

  // Get current time
  const now = new Date();

  // Filter posts to only show future scheduled posts
  const futureScheduledPosts = scheduledPosts.filter(post => {
    const scheduledTime = new Date(post.scheduledTime || post.scheduleDate);
    return scheduledTime > now;
  });

  // Sort posts by scheduled time (earliest first)
  futureScheduledPosts.sort((a, b) => {
    const timeA = new Date(a.scheduledTime || a.scheduleDate);
    const timeB = new Date(b.scheduledTime || b.scheduleDate);
    return timeA - timeB;
  });

  if (futureScheduledPosts.length === 0) {
    container.innerHTML = '<p class="no-posts-message">No upcoming scheduled posts</p>';
    return;
  }

  container.innerHTML = futureScheduledPosts.map(post => `
    <div class="scheduled-post" data-post-id="${post.id}" style="display: flex; align-items: flex-start; gap: 1.25rem; padding: 1rem 0; border-bottom: 1px solid #f0f0f0;">
      <div class="scheduled-thumb" style="flex: 0 0 72px; width: 72px; height: 72px; border-radius: 8px; overflow: hidden; background: #f8f9fa; display: flex; align-items: center; justify-content: center;">
        <img src="${post.imageUrl || 'assets/default-profile.png'}" alt="Post thumbnail" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;" onerror="this.src='assets/default-profile.png'" />
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong>${post.pageName || 'Unnamed Page'}</strong>
            <span class="platform-badge ${post.platform}">${post.platform}</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="action-btn edit-btn" onclick="openEditModal('${post.id}')">Edit</button>
            <button class="action-btn delete-btn" onclick="openDeleteModal('${post.id}')">Delete</button>
          </div>
        </div>
        <div class="post-caption" style="margin: 0.5rem 0 0.25rem 0;">${post.caption}</div>
        <div class="post-meta" style="font-size: 0.95em; color: #666;">
          <span class="scheduled-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${new Date(post.scheduledTime || post.scheduleDate).toLocaleString()}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// Update page selection handlers
function initializePageSelections() {
  const fbPages = document.getElementById('facebookPages');
  const igPages = document.getElementById('instagramPages');

  if (fbPages) {
    fbPages.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const pageId = e.target.dataset.id;
        const pageName = e.target.dataset.name;
        if (e.target.checked) {
          selectedPages.facebook.add({ id: pageId, name: pageName });
        } else {
          selectedPages.facebook.delete({ id: pageId, name: pageName });
        }
        updateScheduleButton();
      }
    });
  }

  if (igPages) {
    igPages.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const pageId = e.target.dataset.id;
        const pageName = e.target.dataset.name;
        if (e.target.checked) {
          selectedPages.instagram.add({ id: pageId, name: pageName });
        } else {
          selectedPages.instagram.delete({ id: pageId, name: pageName });
        }
        updateScheduleButton();
      }
    });
  }
}

// Update schedule button state
function updateScheduleButton() {
  const scheduleBtn = document.getElementById('scheduleBtn');
  const hasSelectedPages = selectedPages.facebook.size > 0 || selectedPages.instagram.size > 0;
  const previewContainer = document.getElementById('previewContainer');
  const hasPosts = previewContainer && previewContainer.querySelectorAll('.preview-card').length > 0;
  
  if (scheduleBtn) {
    scheduleBtn.disabled = !hasSelectedPages || !hasPosts;
    console.log('Schedule button state:', { hasSelectedPages, hasPosts, disabled: !hasSelectedPages || !hasPosts });
  }
}

// Schedule posts to selected pages
async function scheduleToSelectedPages(posts) {
  const totalPages = selectedPages.facebook.size + selectedPages.instagram.size;
  if (totalPages === 0) {
    showNotification('Please select at least one page to schedule posts to.', 'error');
    return;
  }

  try {
    showNotification(`Scheduling posts to ${totalPages} pages...`, 'info');
    
    // Schedule to Facebook pages
    for (const page of selectedPages.facebook) {
      for (const post of posts) {
        await schedulePost({
          ...post,
          pageId: page.id,
          pageName: page.name,
          platform: 'facebook'
        });
      }
    }

    // Schedule to Instagram pages
    for (const page of selectedPages.instagram) {
      for (const post of posts) {
        await schedulePost({
          ...post,
          pageId: page.id,
          pageName: page.name,
          platform: 'instagram'
        });
      }
    }

    showNotification(`Successfully scheduled posts to ${totalPages} pages!`, 'success');
  } catch (error) {
    console.error('Error scheduling posts:', error);
    showNotification('Failed to schedule posts. Please try again.', 'error');
  }
}

// Update the schedule button click handler
document.getElementById('scheduleBtn').addEventListener('click', async () => {
  const posts = getPostsFromPreview(); // Get posts from preview container
  if (!posts || posts.length === 0) {
    showNotification('No posts to schedule. Please preview posts first.', 'error');
    return;
  }

  await scheduleToSelectedPages(posts);
});

// Helper function to get posts from preview
function getPostsFromPreview() {
  const previewContainer = document.getElementById('previewContainer');
  if (!previewContainer) return [];

  const posts = [];
  const previewCards = previewContainer.querySelectorAll('.preview-card');
  
  previewCards.forEach(card => {
    const imageUrl = card.querySelector('.preview-image')?.src;
    const caption = card.querySelector('.preview-caption')?.textContent;
    const scheduledTime = card.querySelector('.preview-schedule')?.textContent;

    if (imageUrl && caption && scheduledTime) {
      posts.push({
        imageUrl,
        caption,
        scheduledTime: new Date(scheduledTime.replace('📅 ', '')).toISOString()
      });
    }
  });

  return posts;
}

// Add function to display default time in sidebar
async function displayDefaultTimesInSidebar() {
  const fbProfiles = document.querySelectorAll('#facebookPages .profile-container');
  const igProfiles = document.querySelectorAll('#instagramPages .profile-container');
  const allProfiles = [...fbProfiles, ...igProfiles];

  for (const profile of allProfiles) {
    const checkbox = profile.querySelector('input[type="checkbox"]');
    const profileId = checkbox?.dataset.id;
    if (!profileId) continue;
    // Find the .default-time-label span
    const labelSpan = profile.querySelector('.default-time-label');
    if (!labelSpan) continue;
    try {
      const snap = await getDoc(doc(db, 'default_times', profileId));
      if (snap.exists() && snap.data().time) {
        // Format time as local time with AM/PM
        const [hh, mm] = snap.data().time.split(':');
        const date = new Date();
        date.setHours(Number(hh), Number(mm), 0, 0);
        const localTime = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        // Format days
        const days = Array.isArray(snap.data().days) && snap.data().days.length > 0 ? ` (${snap.data().days.join(', ')})` : '';
        labelSpan.textContent = `⏰ ${localTime}${days}`;
        // Compact, inline style
        labelSpan.style.color = '#222';
        labelSpan.style.fontSize = '13px';
        labelSpan.style.marginLeft = '6px';
        labelSpan.style.verticalAlign = 'middle';
        labelSpan.style.background = 'none';
        labelSpan.style.borderRadius = '0';
        labelSpan.style.padding = '0';
        labelSpan.style.display = 'inline';
      } else {
        labelSpan.textContent = 'No default time';
        labelSpan.style.color = '#bbb';
        labelSpan.style.background = 'none';
        labelSpan.style.padding = '0';
      }
    } catch (err) {
      labelSpan.textContent = '';
    }
  }
}
window.displayDefaultTimesInSidebar = displayDefaultTimesInSidebar;
window.addEventListener('fb-pages-ready', displayDefaultTimesInSidebar);
window.addEventListener('DOMContentLoaded', displayDefaultTimesInSidebar);

// Add preview button click handler
document.getElementById('previewBtn').addEventListener('click', async () => {
  const selectedCheckboxes = document.querySelectorAll('#facebookPages input[type="checkbox"]:checked, #instagramPages input[type="checkbox"]:checked');
  const postFile = document.getElementById('postCsv')?.files?.[0];
  
  if (!selectedCheckboxes.length || !postFile) {
    showNotification('Please select pages and upload a Post CSV.', 'error');
    return;
  }

  await handlePreview();
});

window.openWatermarkModal = openWatermarkModal;

// CSV Builder Functionality
document.addEventListener('DOMContentLoaded', () => {
  const imageInput = document.getElementById('imageInput');
  const captionsTextarea = document.getElementById('captions');
  const datesTextarea = document.getElementById('dates');

  if (imageInput && captionsTextarea && datesTextarea) {
    imageInput.addEventListener('change', handleImageUpload);
    captionsTextarea.addEventListener('input', validateInputs);
    datesTextarea.addEventListener('input', validateInputs);
  }
});

function handleImageUpload(event) {
  const files = event.target.files;
  if (files.length > 20) {
    showNotification('Maximum 20 images allowed', 'error');
    event.target.value = '';
    return;
  }
  validateInputs();
}

function validateInputs() {
  const imageInput = document.getElementById('imageInput');
  const captions = document.getElementById('captions').value.split('\n').filter(line => line.trim());
  const dates = document.getElementById('dates').value.split('\n').filter(line => line.trim());

  const imageCount = imageInput.files.length;
  const captionCount = captions.length;
  const dateCount = dates.length;

  if (imageCount > 0 && captionCount > 0 && dateCount > 0) {
    if (imageCount !== captionCount || imageCount !== dateCount) {
      showNotification('Number of images, captions, and dates must match', 'error');
    } else {
      showNotification('All inputs are valid', 'success');
    }
  }
}

function injectSetDefaultTimeButtons() {
  console.log('[DEBUG] Injecting Set Default Time buttons...');
  
  const fbProfiles = document.querySelectorAll('#facebookPages .profile-container');
  const igProfiles = document.querySelectorAll('#instagramPages .profile-container');
  
  console.log(`[DEBUG] Found ${fbProfiles.length} Facebook profiles and ${igProfiles.length} Instagram profiles`);

  [...fbProfiles, ...igProfiles].forEach(profile => {
    const checkbox = profile.querySelector('input[type="checkbox"]');
    const profileId = checkbox?.dataset.id;
    const profileName = checkbox?.dataset.name;
    
    if (profileId && profileName) {
      // Avoid duplicate buttons
      if (!profile.querySelector('.set-default-time-btn')) {
        const btn = document.createElement('button');
        btn.className = 'set-default-time-btn';
        btn.title = 'Set Default Time';
        btn.setAttribute('aria-label', 'Set Default Time');
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
        
        btn.onclick = (e) => {
          e.stopPropagation();
          if (window.openTimeModal) {
            window.openTimeModal(profileId, profileName);
          } else {
            import('./features/timeModal.js').then(mod => {
              mod.openTimeModal(profileId, profileName);
            });
          }
        };

        // Find the profile-info div and append the button
        const profileInfo = profile.querySelector('.profile-info');
        if (profileInfo) {
          profileInfo.appendChild(btn);
          console.log(`[DEBUG] Added Set Default Time button for ${profileName}`);
        } else {
          console.warn(`[WARNING] Could not find profile-info for ${profileName}`);
        }
      }
    }
  });
}

// Inject on page load and when pages are loaded
window.addEventListener('DOMContentLoaded', injectSetDefaultTimeButtons);
window.addEventListener('fb-pages-ready', injectSetDefaultTimeButtons);

window.injectSetDefaultTimeButtons = injectSetDefaultTimeButtons;

// Add event listener for saving default times
window.addEventListener('save-time-settings', async (event) => {
  const { pageId, selectedDays, selectedTime } = event.detail;
  console.log('[DEBUG] Saving time settings:', { pageId, selectedDays, selectedTime });
  
  try {
    await saveDefaultTimes(pageId, selectedDays, selectedTime);
    // Close the modal
    const modal = document.getElementById('timeModal');
    if (modal) modal.style.display = 'none';
    // Update sidebar badge immediately
    if (window.displayDefaultTimesInSidebar) window.displayDefaultTimesInSidebar();
  } catch (error) {
    console.error('Error saving time settings:', error);
    showNotification('Failed to save time settings', 'error');
  }
});

// --- Fix: pre-fill modal with saved time and days ---
window.openTimeModal = async function(pageId, pageName) {
  const modal = document.getElementById('timeModal');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveTimeBtn');
  if (!modal || !title || !saveBtn) return;
  modal.style.display = 'block';
  title.innerText = `Set Times for ${pageName}`;
  // Pre-fill saved time and days
  try {
    const snap = await getDoc(doc(db, 'default_times', pageId));
    if (snap.exists()) {
      const { days = [], time = '' } = snap.data();
      document.getElementById('modalTime').value = time;
      document.querySelectorAll('.weekday-checkbox').forEach(cb => {
        cb.checked = days.includes(cb.value);
      });
    } else {
      document.getElementById('modalTime').value = '';
      document.querySelectorAll('.weekday-checkbox').forEach(cb => {
        cb.checked = false;
      });
    }
  } catch (err) {
    document.getElementById('modalTime').value = '';
    document.querySelectorAll('.weekday-checkbox').forEach(cb => {
      cb.checked = false;
    });
  }
  saveBtn.onclick = () => {
    const selectedDays = Array.from(document.querySelectorAll('.weekday-checkbox:checked')).map(cb => cb.value);
    const selectedTime = document.getElementById('modalTime').value;
    window.dispatchEvent(new CustomEvent('save-time-settings', {
      detail: { pageId, selectedDays, selectedTime }
    }));
    modal.style.display = 'none';
  };
};

// --- CSV confirmation fix ---
window.addEventListener('DOMContentLoaded', () => {
  const csvInput = document.getElementById('postCsv');
  let csvConfirm = document.getElementById('csvConfirmBadge');
  if (!csvConfirm) {
    csvConfirm = document.createElement('div');
    csvConfirm.id = 'csvConfirmBadge';
    csvConfirm.style.fontSize = '13px';
    csvConfirm.style.color = '#228B22';
    csvConfirm.style.marginTop = '4px';
    csvConfirm.style.display = 'none';
    csvConfirm.style.alignItems = 'center';
    csvConfirm.style.gap = '6px';
    csvInput?.parentNode?.insertBefore(csvConfirm, csvInput.nextSibling);
  }
  if (csvInput) {
    csvInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        try {
          const posts = await parseCsv(file);
          csvConfirm.innerHTML = `✔️ <strong>CSV attached:</strong> ${file.name} <span style='color:#888;'>(${posts.length} posts)</span>`;
          csvConfirm.style.display = 'flex';
        } catch (err) {
          csvConfirm.innerHTML = `<span style='color:#b00;'>❌ CSV error</span>`;
          csvConfirm.style.display = 'flex';
        }
      } else {
        csvConfirm.style.display = 'none';
      }
    });
  }
});