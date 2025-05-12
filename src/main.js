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

    if (csvInput && status && text) {
      csvInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          text.textContent = `CSV uploaded: ${e.target.files[0].name}`;
          status.style.opacity = '1';
        } else {
          text.textContent = '';
          status.style.opacity = '0';
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
  // Convert ISO string to local datetime-local format
  const scheduledDate = new Date(post.scheduledTime || post.scheduleDate);
  timeInput.value = formatDateTimeForInput(scheduledDate);

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

  const fileRef = ref(storage, `watermarks/${profileId}.jpg`);
  getDownloadURL(fileRef)
    .then(url => {
      preview.src = url;
      msg.textContent = '';
    })
    .catch(() => {
      msg.textContent = 'No watermark found for this profile.';
    });

  showModal('watermarkModal');
}

document.getElementById('closeWatermarkModal').onclick = () => {
  document.getElementById('watermarkModal').style.display = 'none';
};

document.getElementById('uploadWatermarkBtn').onclick = async () => {
  const file = document.getElementById('watermarkUploadInput').files[0];
  if (!file) return alert('Choose a file first!');
  try {
    const fileRef = ref(storage, `watermarks/${currentProfileId}.jpg`);
    await uploadBytes(fileRef, file);
    alert('✅ Watermark uploaded!');
    openWatermarkModal(currentProfileId);
  } catch (err) {
    console.error(err);
    alert('❌ Failed to upload watermark.');
  }
};

document.getElementById('deleteWatermarkBtn').onclick = async () => {
  if (!confirm('⚠️ Are you sure you want to delete this watermark?')) return;
  try {
    const fileRef = ref(storage, `watermarks/${currentProfileId}.jpg`);
    await deleteObject(fileRef);
    alert('✅ Watermark deleted!');
    openWatermarkModal(currentProfileId);
  } catch (err) {
    console.error(err);
    alert('❌ Failed to delete watermark.');
  }
};

function injectManageWatermarkButtons() {
  const fbProfiles = document.querySelectorAll('#facebookPages .profile-container');
  const igProfiles = document.querySelectorAll('#instagramPages .profile-container');

  [...fbProfiles, ...igProfiles].forEach(profile => {
    const checkbox = profile.querySelector('input[type="checkbox"]');
    const profileId = checkbox?.dataset.id;
    if (profileId) {
      const existingBtn = profile.querySelector('.manage-watermark-btn');
      if (!existingBtn) {
        const manageBtn = document.createElement('button');
        manageBtn.textContent = 'Manage Watermark';
        manageBtn.className = 'manage-watermark-btn pink-btn';
        manageBtn.dataset.profileId = profileId;
        manageBtn.style.marginTop = '8px';
        profile.appendChild(manageBtn);
      }
    }
  });
}

window.addEventListener('pagesLoaded', injectManageWatermarkButtons);

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
  const scheduledTime = document.getElementById('editScheduledTime').value;

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
      scheduleDate: new Date(scheduledTime).toISOString(),
      scheduledTime: new Date(scheduledTime).toISOString(),
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
        scheduleDate: new Date(scheduledTime).toISOString(),
        scheduledTime: new Date(scheduledTime).toISOString(),
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
  return new Date(date).toISOString().slice(0, 16);
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
    <div class="scheduled-post" data-post-id="${post.id}">
      ${post.hasWatermark ? `
        <div class="watermark-indicator">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span>Watermark</span>
        </div>
      ` : ''}
      <img src="${post.imageUrl}" alt="Scheduled post" class="post-image">
      <p class="post-caption">${post.caption}</p>
      <div class="post-meta">
        <div class="post-platform">
          ${post.platform === 'instagram' ? 
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#E4405F"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>' : 
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'}
          <span>${post.platform === 'instagram' ? 'Instagram' : 'Facebook'}</span>
        </div>
        <div class="post-time">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          ${new Date(post.scheduledTime || post.scheduleDate).toLocaleString()}
        </div>
      </div>
      <div class="post-actions">
        <button class="action-btn edit-btn" onclick="openEditModal('${post.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Edit
        </button>
        <button class="action-btn delete-btn" onclick="openDeleteModal('${post.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
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

window.renderPreviewCard = async function(page, post, hasWatermark) {
  try {
    if (!post || !post.imageUrl) {
      console.warn(`[WARNING] No valid post data for ${page.name}`);
      return null;
    }

    const { imageUrl, caption, scheduleDate } = post;

    // Get watermark URL if it exists
    let watermarkUrl = null;
    if (hasWatermark) {
      try {
        watermarkUrl = await getDownloadURL(ref(storage, `watermarks/${page.id}.jpg`));
      } catch (error) {
        console.warn(`[WARNING] Failed to get watermark URL for ${page.name}:`, error);
      }
    }

    // Create preview card
    const card = document.createElement('div');
    card.className = 'preview-card';
    
    // Add watermark indicator if watermark exists
    const watermarkIndicator = hasWatermark ? 
      '<div class="watermark-indicator">✓ Watermark Applied</div>' : 
      '<div class="watermark-indicator warning">⚠️ No Watermark</div>';

    // Default profile image as data URL
    const defaultProfileImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNFNUU3RUIiLz48cGF0aCBkPSJNMjQgMjBDMjYuMjA5MSAyMCAyOCAxOC4yMDkxIDI4IDE2QzI4IDEzLjc5MDkgMjYuMjA5MSAxMiAyNCAxMkMyMS43OTA5IDEyIDIwIDEzLjc5MDkgMjAgMTZDMjAgMTguMjA5MSAyMS43OTA5IDIwIDI0IDIwWiIgZmlsbD0iIzk0OTk5RiIvPjxwYXRoIGQ9Ik0zMiAyOEMzMiAyNS43OTAxIDI4LjQxODMgMjQgMjQgMjRDMjAuNDE4MyAyNCAxNiAyNS43OTAxIDE2IDI4VjMySDMyVjI4WiIgZmlsbD0iIzk0OTk5RiIvPjwvc3ZnPg==';

    // Determine platform badge
    const platformBadge = page.platform === 'instagram' ? 
      '<p class="platform-badge instagram">INSTAGRAM</p>' : 
      '<p class="platform-badge facebook">FACEBOOK</p>';

    // Create the preview card HTML
    card.innerHTML = `
      <div class="preview-header">
        <img src="${page.picture?.data?.url || defaultProfileImage}" 
             alt="${page.name}" 
             class="page-avatar"
             onerror="this.src='${defaultProfileImage}'" />
        <div class="preview-info">
          <h3>${page.name}</h3>
          ${platformBadge}
        </div>
      </div>
      <div class="preview-content">
        <div class="preview-image-container">
          <img src="${imageUrl}" 
               alt="Post preview" 
               class="preview-image"
               onerror="this.onerror=null; this.src='${defaultProfileImage}'; this.style.opacity='0.5';" />
          ${watermarkIndicator}
          ${watermarkUrl ? '<div class="watermark-wrapper"><img src="' + watermarkUrl + '" alt="Watermark" /></div>' : ''}
        </div>
        <p class="preview-caption">${caption}</p>
        <p class="preview-schedule">📅 ${scheduleDate}</p>
      </div>
    `;

    return card;
  } catch (error) {
    console.error(`[ERROR] Failed to render preview card for ${page.name}:`, error);
    showNotification(`Failed to generate preview for ${page.name}`, 'error');
    return null;
  }
};

// Update previewPosts function to include watermark check
window.previewPosts = async function() {
  const container = document.getElementById('previewContainer');
  if (!container) return;

  const postFile = document.getElementById('postCsv')?.files?.[0];
  if (!postFile) {
    showNotification('Please upload a Post CSV file first', 'warning');
    return;
  }

  try {
    const posts = await parseCsv(postFile);
    if (!posts.length) {
      container.innerHTML = '<p>No posts found in CSV file.</p>';
      return;
    }

    const selectedPages = Array.from(document.querySelectorAll('.page-checkbox:checked'));
    if (!selectedPages.length) {
      showNotification('Please select at least one page', 'warning');
      return;
    }

    // Clear existing previews
    container.innerHTML = '';

    // Create preview for each selected page
    for (const page of selectedPages) {
      const pageData = {
        id: page.dataset.id,
        name: page.dataset.name,
        platform: page.dataset.platform,
        picture: { data: { url: page.dataset.picture } },
        pageAccessToken: page.dataset.accessToken
      };

      if (!pageData.id || pageData.id === '0' || !pageData.pageAccessToken) {
        console.warn(`[WARNING] Invalid page data:`, pageData);
        continue;
      }

      // Check for watermark
      const watermarkRef = ref(storage, `watermarks/${pageData.id}.jpg`);
      let hasWatermark = false;
      try {
        await getDownloadURL(watermarkRef);
        hasWatermark = true;
      } catch (err) {
        hasWatermark = false;
      }

      const previewCard = await window.renderPreviewCard(pageData, posts[0], hasWatermark);
      if (previewCard) {
        container.appendChild(previewCard);
      }
    }
    
    // Update schedule button state after previews are loaded
    updateScheduleButton();
  } catch (err) {
    console.error("Failed to load preview posts:", err);
    container.innerHTML = '<p style="color:red;">Failed to load preview posts</p>';
    showNotification('Failed to generate previews', 'error');
  }
};

// Add preview button click handler
document.getElementById('previewBtn').addEventListener('click', async () => {
  const selectedCheckboxes = document.querySelectorAll('#facebookPages input[type="checkbox"]:checked, #instagramPages input[type="checkbox"]:checked');
  const postFile = document.getElementById('postCsv')?.files?.[0];
  
  if (!selectedCheckboxes.length || !postFile) {
    showNotification('Please select pages and upload a Post CSV.', 'error');
    return;
  }

  await previewPosts();
});

// --- PAGE RENDERING (from src/core/main.js) ---
import { fetchAllPages } from './core/graphApi.js';

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