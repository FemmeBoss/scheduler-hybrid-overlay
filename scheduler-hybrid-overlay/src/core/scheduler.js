import { savePendingWrite, processPendingWrites } from '../features/offlineQueue.js';
import { db } from './firebase-config.js';
import { collection, addDoc, doc, updateDoc, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getWatermark } from './idb.js';

// ✅ Import from uploader.js (single source of truth)
import {
  uploadToInstagram,
  scheduleInstagramPost,
  postToFacebook
} from './uploader.js';

// 🧠 Globals
let cachedPosts = [];
let cachedPages = [];

// 🧠 DOM Ready Handlers
window.addEventListener('DOMContentLoaded', () => {
  const previewBtn = document.getElementById('previewBtn');
  const scheduleBtn = document.getElementById('scheduleBtn');
  const mediaDropZone = document.getElementById('mediaDropZone');
  const imageInput = document.getElementById('imageInput');
  const mediaPreview = document.getElementById('mediaPreview');

  // Media upload event listeners
  if (mediaDropZone) {
    mediaDropZone.addEventListener('click', () => {
      imageInput.click();
    });

    mediaDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      mediaDropZone.classList.add('dragover');
    });

    mediaDropZone.addEventListener('dragleave', () => {
      mediaDropZone.classList.remove('dragover');
    });

    mediaDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      mediaDropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        handleMediaFile(file);
      }
    });
  }

  if (imageInput) {
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleMediaFile(file);
      }
    });
  }

  // Handle media file preview
  function handleMediaFile(file) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showNotification('Please upload an image or video file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      mediaPreview.innerHTML = '';
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = e.target.result;
        mediaPreview.appendChild(img);
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = e.target.result;
        video.controls = true;
        mediaPreview.appendChild(video);
      }

      // Add media type badge
      const badge = document.createElement('div');
      badge.className = `media-type-badge ${file.type.startsWith('video/') ? 'reels' : 'image'}`;
      badge.textContent = file.type.startsWith('video/') ? 'Reels' : 'Image';
      mediaPreview.appendChild(badge);
    };
    reader.readAsDataURL(file);
  }

  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      console.log('⚡ Preview button clicked');
      handlePreview();
    });
  } else {
    console.warn('⚠️ previewBtn not found in DOM');
  }

  if (scheduleBtn) {
    scheduleBtn.addEventListener('click', () => {
      console.log('⚡ Schedule button clicked');
      handleSchedule();
    });
  } else {
    console.warn('⚠️ scheduleBtn not found in DOM');
  }

  // Add event listeners for page checkboxes
  document.querySelectorAll('.page-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateScheduleButtonState);
  });
});

// Update schedule button state based on selections and previews
function updateScheduleButtonState() {
  const scheduleBtn = document.getElementById('scheduleBtn');
  if (!scheduleBtn) return;

  const selectedPages = document.querySelectorAll('.page-checkbox:checked').length;
  const previewContainer = document.getElementById('previewContainer');
  const hasPreviews = previewContainer && previewContainer.children.length > 0;

  scheduleBtn.disabled = selectedPages === 0 || !hasPreviews;
  console.log('Schedule button state updated:', { selectedPages, hasPreviews, disabled: scheduleBtn.disabled });
}

// Add showNotification function
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// ✅ PREVIEW HANDLER FUNCTION
async function handlePreview() {
  try {
    console.log('🔍 Starting preview generation...');
    
    const selectedPages = Array.from(document.querySelectorAll('.page-checkbox:checked'));
    console.log('📋 Selected pages:', selectedPages.map(cb => ({
      id: cb.dataset.id,
      name: cb.dataset.name,
      platform: cb.dataset.platform
    })));

    if (selectedPages.length === 0) {
      console.warn('⚠️ No pages selected');
      showNotification('Please select at least one page to preview', 'warning');
      return;
    }

    const postFile = document.getElementById('postCsv')?.files?.[0];
    if (!postFile) {
      console.warn('⚠️ No CSV file selected');
      showNotification('Please upload a CSV file first', 'warning');
      return;
    }

    // Call the global previewPosts function
    await window.previewPosts();
    
    console.log('✅ Preview generation complete');
  } catch (error) {
    console.error('❌ Preview generation failed:', error);
    showNotification('Failed to generate previews', 'error');
  }
}

async function handleSchedule() {
  const statusEl = document.getElementById('statusToast');
  statusEl.style.display = 'block';
  statusEl.innerHTML = 'Starting scheduling process...<br>';

  try {
    // Get selected pages
    const selectedPages = Array.from(document.querySelectorAll('.page-checkbox:checked'));
    if (selectedPages.length === 0) {
      showNotification('Please select at least one page to schedule posts to.', 'error');
      return;
    }

    // Get the media file and details
    const imageFile = document.getElementById('imageInput').files[0];
    const caption = document.getElementById('captionInput').value;
    const scheduledTime = document.getElementById('scheduleTimeInput').value;

    if (!imageFile) {
      showNotification('Please select an image or video to post.', 'error');
      return;
    }

    if (!scheduledTime) {
      showNotification('Please select a schedule time.', 'error');
      return;
    }

    // Convert scheduled time to Unix timestamp
    const scheduledUnix = Math.floor(new Date(scheduledTime).getTime() / 1000);

    // Upload media to Cloudinary
    const mediaBlob = await imageFile.arrayBuffer().then(buffer => new Blob([buffer], { type: imageFile.type }));
    const finalMediaUrl = await uploadToCloudinary(mediaBlob);

    // Determine media type
    const isVideo = imageFile.type.startsWith('video/');
    const mediaType = isVideo ? 'REELS' : 'IMAGE';

    // Schedule for each selected page
    for (const page of selectedPages) {
      try {
        let scheduledPostId = null;
        let scheduledResponse = null;
        let creationId = null;

        if (page.dataset.platform === 'facebook') {
          // Facebook scheduling
          const formData = new FormData();
          formData.append('url', finalMediaUrl);
          formData.append('caption', caption);
          formData.append('access_token', page.dataset.accessToken);
          if (isVideo) {
            formData.append('media_type', 'REELS');
          }

          scheduledResponse = await postToFacebook(page.dataset.id, formData, scheduledUnix);
          if (scheduledResponse && scheduledResponse.id) {
            scheduledPostId = scheduledResponse.id;
            statusEl.innerHTML += `✅ Facebook post scheduled for ${page.dataset.name}<br>`;
          } else {
            throw new Error('No post ID returned from Facebook');
          }
        } else if (page.dataset.platform === 'instagram') {
          // Instagram scheduling
          statusEl.innerHTML += `📸 Starting Instagram upload for ${page.dataset.name}...<br>`;
          
          creationId = await uploadToInstagram(
            page.dataset.id, 
            page.dataset.accessToken, 
            finalMediaUrl, 
            caption,
            mediaType
          );

          if (!creationId) {
            throw new Error('Failed to create Instagram container');
          }

          statusEl.innerHTML += `✅ Instagram post created for ${page.dataset.name}<br>`;
        }

        // Use a transaction to ensure atomic operations
        await runTransaction(db, async (transaction) => {
          // Create the scheduled post
          const scheduledPost = {
            pageId: page.dataset.id,
            pageName: page.dataset.name,
            platform: page.dataset.platform,
            caption,
            scheduleDate: new Date(scheduledUnix * 1000).toISOString(),
            mediaUrl: finalMediaUrl,
            postId: scheduledPostId,
            scheduledUnix,
            createdAt: new Date().toISOString(),
            status: page.dataset.platform === 'facebook' ? 'scheduled' : 'pending',
            scheduledResponse,
            creationId,
            mediaType
          };

          // Add to scheduledPosts collection
          const scheduledPostRef = doc(collection(db, 'scheduledPosts'));
          transaction.set(scheduledPostRef, scheduledPost);

          // For Instagram posts, also add to pending queue
          if (page.dataset.platform === 'instagram' && creationId) {
            const pendingPost = {
              pageId: page.dataset.id,
              creationId: creationId,
              accessToken: page.dataset.accessToken,
              scheduledUnix,
              scheduledPostId: scheduledPostRef.id,
              createdAt: new Date().toISOString(),
              retryCount: 0,
              mediaType
            };

            const pendingPostRef = doc(collection(db, 'pendingIGPosts'));
            transaction.set(pendingPostRef, pendingPost);
          }
        });

        statusEl.innerHTML += `💾 Post saved to database for ${page.dataset.name}<br>`;
      } catch (error) {
        console.error(`Error scheduling for ${page.dataset.name}:`, error);
        statusEl.innerHTML += `❌ Failed to schedule for ${page.dataset.name}: ${error.message}<br>`;
        showNotification(`Failed to schedule for ${page.dataset.name}: ${error.message}`, 'error');
      }
    }

    // Clear form after successful scheduling
    document.getElementById('imageInput').value = '';
    document.getElementById('captionInput').value = '';
    document.getElementById('scheduleTimeInput').value = '';
    document.getElementById('mediaPreview').innerHTML = '';
    document.getElementById('previewContainer').innerHTML = '';

    showNotification('Posts scheduled successfully!', 'success');
  } catch (error) {
    console.error('Error in handleSchedule:', error);
    showNotification('Failed to schedule posts: ' + error.message, 'error');
  }
}

// ... (rest of file continues as-is, unchanged)

// Upload Logic
async function uploadToCloudinary(blob) {
  const CLOUD_NAME = 'drsopn5st';
  const UPLOAD_PRESET = 'femme_boss_uploads';
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', UPLOAD_PRESET);
  
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error('[CLOUDINARY ERROR]', errorData);
      throw new Error(`Cloudinary upload failed: ${errorData.error?.message || res.statusText}`);
    }

    const data = await res.json();
    if (!data.secure_url) {
      throw new Error('No secure URL returned from Cloudinary');
    }

    console.log('[CLOUDINARY SUCCESS]', data.secure_url);
    return data.secure_url;
  } catch (error) {
    console.error('[CLOUDINARY UPLOAD ERROR]', error);
    throw new Error(`Upload to Cloudinary failed: ${error.message}`);
  }
}

async function renderAndUploadWatermarkedImage(baseUrl, watermarkUrl) {
  console.log('🖼️ Starting watermark process...');
  
  try {
    const baseImg = await loadImage(baseUrl);
    const canvas = document.createElement('canvas');
    canvas.width = baseImg.width;
    canvas.height = baseImg.height;
    const ctx = canvas.getContext('2d');
    
    // Draw base image
    ctx.drawImage(baseImg, 0, 0);
    
    if (watermarkUrl) {
      console.log('💧 Loading watermark image...');
      const watermarkImg = await loadImage(watermarkUrl);
      
      // Calculate watermark dimensions to fit at bottom
      const wmWidth = baseImg.width;
      const wmHeight = (watermarkImg.height / watermarkImg.width) * wmWidth;
      
      // Draw watermark at bottom
      ctx.drawImage(watermarkImg, 0, baseImg.height - wmHeight, wmWidth, wmHeight);
      
      console.log('✅ Watermark applied with full opacity');
    }
    
    // Convert to blob with maximum quality
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', 1.0);
      console.log('📦 Image converted to blob with maximum quality');
    });

    if (!blob) {
      throw new Error('Failed to convert canvas to blob');
    }

    return await uploadToCloudinary(blob);
  } catch (error) {
    console.error('[WATERMARK ERROR]', error);
    throw error;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function parseCsv(file) {
  const text = await file.text();
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => row[h] = values[i]);
    return {
      imageUrl: row['Image URL'] || row.imageUrl || '',
      caption: row['Caption'] || row.caption || '',
      scheduleDate: row['Schedule Date'] || row.scheduleDate || ''
    };
  });
}

async function processInBatches(tasks, batchSize = 5) {
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      try {
        await tasks[currentIndex]();
      } catch (error) {
        console.error(`Batch task ${currentIndex} failed`, error);
      }
    }
  }
  const workers = [];
  for (let i = 0; i < batchSize; i++) workers.push(worker());
  await Promise.all(workers);
}

async function safeAddDoc(collectionPath, data) {
  if (navigator.onLine) {
    try {
      const colRef = collection(db, collectionPath);
      const docRef = await addDoc(colRef, data);
      console.log(`✅ Firestore write succeeded to ${collectionPath} with ID: ${docRef.id}`);
      return docRef;
    } catch (error) {
      console.error("🔥 Firestore write failed online:", error.message);
      await savePendingWrite(collectionPath, data);
      throw error;
    }
  } else {
    console.warn("⚡ Offline! Queuing Firestore write...");
    await savePendingWrite(collectionPath, data);
    throw new Error("Offline - write queued");
  }
}

// Make preview and schedule handlers globally accessible to main.js
window.handlePreview = handlePreview;
window.handleSchedule = handleSchedule;

window.addEventListener('online', () => {
  processPendingWrites(db);
});

async function renderPreviewCard(page, post) {
  try {
    if (!post) {
      console.warn(`[WARNING] No valid post data for ${page.name}`);
      return null;
    }

    const { caption, scheduleDate, mediaType } = post;
    const imageInput = document.getElementById('imageInput');
    const file = imageInput.files[0];

    if (!file) {
      console.warn(`[WARNING] No media file selected`);
      return null;
    }

    // Create preview card
    const card = document.createElement('div');
    card.className = 'preview-card';

    // Default profile image as data URL
    const defaultProfileImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNFNUU3RUIiLz48cGF0aCBkPSJNMjQgMjBDMjYuMjA5MSAyMCAyOCAxOC4yMDkxIDI4IDE2QzI4IDEzLjc5MDkgMjYuMjA5MSAxMiAyNCAxMkMyMS43OTA5IDEyIDIwIDEzLjc5MDkgMjAgMTZDMjAgMTguMjA5MSAyMS43OTA5IDIwIDI0IDIwWiIgZmlsbD0iIzk0OTk5RiIvPjxwYXRoIGQ9Ik0zMiAyOEMzMiAyNS43OTAxIDI4LjQxODMgMjQgMjQgMjRDMjAuNDE4MyAyNCAxNiAyNS43OTAxIDE2IDI4VjMySDMyVjI4WiIgZmlsbD0iIzk0OTk5RiIvPjwvc3ZnPg==';

    // Format the schedule date
    const formattedDate = new Date(scheduleDate).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).replace(',', '');

    // Get watermark for the page
    const watermarkUrl = await getWatermark(page.id);
    console.log(`[DEBUG] Watermark for ${page.name}:`, watermarkUrl);

    // Create a URL for the file
    const fileUrl = URL.createObjectURL(file);

    // Create the preview card HTML
    card.innerHTML = `
      <div class="preview-header">
        <img src="${defaultProfileImage}" alt="${page.name}" class="preview-profile">
        <div class="preview-info">
          <div class="preview-name">${page.name}</div>
          <div class="preview-platform">${page.platform}</div>
          <div class="watermark-status ${watermarkUrl ? 'has-watermark' : 'no-watermark'}">
            ${watermarkUrl ? '✓ Watermark Uploaded' : '⚠️ No Watermark'}
          </div>
        </div>
      </div>
      <div class="preview-image-container">
        ${file.type.startsWith('video/') ? 
          `<video src="${fileUrl}" controls class="preview-media"></video>` :
          `<img src="${fileUrl}" alt="Preview" class="preview-media">`
        }
        <div class="media-type-badge ${mediaType === 'REELS' ? 'reels' : 'image'}">
          ${mediaType === 'REELS' ? 'Reels' : 'Image'}
        </div>
      </div>
      <div class="preview-content">
        <p class="preview-caption">${caption || 'No caption'}</p>
        <p class="preview-schedule">📅 ${formattedDate}</p>
      </div>
    `;

    // Clean up the object URL when the card is removed
    card.addEventListener('remove', () => {
      URL.revokeObjectURL(fileUrl);
    });

    return card;
  } catch (error) {
    console.error(`[ERROR] Failed to render preview card for ${page.name}:`, error);
    showNotification(`Failed to generate preview for ${page.name}`, 'error');
    return null;
  }
}

// Update the CSS classes for preview media
const style = document.createElement('style');
style.textContent = `
  .preview-media {
    width: 100%;
    max-height: 400px;
    object-fit: contain;
    background: #f9fafb;
    border-radius: 8px;
  }
  
  .preview-media[src*="video"] {
    aspect-ratio: 9/16;
    max-width: 300px;
    margin: 0 auto;
    display: block;
  }
  
  .media-type-badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 1;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    backdrop-filter: blur(4px);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
`;
document.head.appendChild(style);

function renderScheduledPosts() {
  const container = document.getElementById('scheduledPosts');
  if (!container) return;

  // Get selected pages
  const selectedPages = Array.from(document.querySelectorAll('.page-checkbox:checked'));
  if (selectedPages.length === 0) {
    container.innerHTML = '<p class="text-center">Please select at least one page to view scheduled posts</p>';
    return;
  }

  // Filter posts based on selected pages
  const selectedPageIds = selectedPages.map(page => page.dataset.id);
  const filteredPosts = scheduledPosts.filter(post => selectedPageIds.includes(post.pageId));

  if (filteredPosts.length === 0) {
    container.innerHTML = '<p class="text-center">No scheduled posts found for selected pages</p>';
    return;
  }

  container.innerHTML = filteredPosts.map(post => `
    <div class="preview-card">
      ${post.hasWatermark ? `
        <div class="watermark-indicator">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span>Watermark Applied</span>
        </div>
      ` : ''}
      
      <div class="post-header">
        <img src="${post.pageImage || 'assets/default-profile.png'}" 
             alt="${post.pageName}" 
             onerror="this.src='assets/default-profile.png'" />
        <div class="post-header-info">
          <h3>${post.pageName}</h3>
          <div class="platform-badge ${post.platform}">
            ${post.platform === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK'}
          </div>
        </div>
      </div>

      <div class="post-image-container">
        <img src="${post.imageUrl}" alt="Post image" class="post-image">
      </div>

      <div class="post-content">
        <p class="post-caption">${post.caption}</p>
      </div>

      <div class="post-meta">
        <div class="scheduled-time">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          ${new Date(post.scheduleDate).toLocaleString()}
        </div>
      </div>

      <div class="post-actions">
        <button class="action-btn edit" onclick="openEditModal('${post.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Edit
        </button>
        <button class="action-btn delete" onclick="openDeleteModal('${post.id}')">
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

// Add event listener for page selection changes
document.addEventListener('change', (e) => {
  if (e.target.matches('.page-checkbox')) {
    renderScheduledPosts();
  }
});

async function handleWatermarkUpload(pageId, file) {
  try {
    const watermarkUrl = await uploadWatermark(pageId, file);
    if (watermarkUrl) {
      // Update the watermark in IndexedDB
      await saveWatermark(pageId, watermarkUrl);
      
      // Update the watermark status indicator
      const container = document.querySelector(`[data-id="${pageId}"]`).closest('.profile-container');
      const statusIcon = container.querySelector('.watermark-status-icon');
      
      statusIcon.className = 'watermark-status-icon has-watermark';
      statusIcon.innerHTML = '✓';
      statusIcon.title = 'Watermark uploaded';
      
      showNotification('Watermark uploaded successfully', 'success');
    }
  } catch (error) {
    console.error('Failed to upload watermark:', error);
    showNotification('Failed to upload watermark', 'error');
  }
}

async function renderPageSelection(page) {
  const hasWatermark = await getWatermark(page.id);
  const container = document.createElement('div');
  container.className = 'profile-container';
  
  container.innerHTML = `
    <div class="profile-header">
      <input type="checkbox" 
        class="page-checkbox" 
        data-id="${page.id}"
        data-name="${page.name}"
        data-platform="${page.platform}"
        data-access-token="${page.access_token}"
        data-picture="${page.picture?.data?.url || ''}"
        ${page.parentPageId ? `data-parent-page-id="${page.parentPageId}"` : ''}
      >
      <img src="${page.picture?.data?.url || defaultProfileImage}" alt="${page.name}" class="profile-img">
      <div class="profile-info">
        <div class="page-name">${page.name}</div>
        <div class="platform-indicator">
          <img src="assets/${page.platform}-icon.svg" alt="${page.platform}" class="platform-icon ${page.platform}">
          ${page.platform.charAt(0).toUpperCase() + page.platform.slice(1)}
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
  
  return container;
}