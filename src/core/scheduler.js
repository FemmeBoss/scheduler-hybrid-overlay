import { savePendingWrite, processPendingWrites } from '../features/offlineQueue.js';
import { db } from './firebase-config.js';
import { collection, addDoc, doc, updateDoc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
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
    const selectedPages = Array.from(document.querySelectorAll('.page-checkbox:checked'));
    console.log('[DEBUG] Selected pages:', selectedPages.map(cb => ({
      id: cb.dataset.id,
      name: cb.dataset.name,
      platform: cb.dataset.platform,
      hasToken: !!cb.dataset.accessToken,
      tokenLength: cb.dataset.accessToken?.length
    })));

    if (selectedPages.length === 0) {
      showNotification('Please select at least one page to preview', 'warning');
      return;
    }

    const postFile = document.getElementById('postCsv')?.files?.[0];
    if (!postFile) {
      showNotification('Please upload a Post CSV file first', 'warning');
      return;
    }

    const posts = await parseCsv(postFile);
    if (!posts.length) {
      showNotification('No posts found in CSV file', 'warning');
      return;
    }

    console.log('[DEBUG] Posts from CSV:', posts);

    // Cache the selected pages
    cachedPages = selectedPages.map(page => ({
      id: page.dataset.id,
      name: page.dataset.name,
      platform: page.dataset.platform,
      pageAccessToken: page.dataset.accessToken,
      parentPageId: page.dataset.parentPageId
    }));

    // Cache the posts with their watermarked images
    cachedPosts = [];
    const previewContainer = document.getElementById('previewContainer');
    if (!previewContainer) {
      console.error('Preview container not found');
      return;
    }

    // Clear existing previews
    previewContainer.innerHTML = '';

    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'preview-loading';
    loadingDiv.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">Generating previews... <span class="progress">0/0</span></div>
    `;
    previewContainer.appendChild(loadingDiv);

    // Track progress
    let completedPreviews = 0;
    let failedPreviews = [];
    const totalPreviews = posts.length * selectedPages.length;

    function updateProgress() {
      const progressEl = loadingDiv.querySelector('.progress');
      if (progressEl) {
        progressEl.textContent = `${completedPreviews}/${totalPreviews}`;
      }
    }

    // Create preview for each post and selected page in batches
    const previewTasks = [];
    for (const post of posts) {
      for (const page of selectedPages) {
        previewTasks.push(() =>
          withTimeout(
            (async () => {
              try {
                const pageData = {
                  id: page.dataset.id,
                  name: page.dataset.name,
                  platform: page.dataset.platform,
                  picture: { data: { url: page.dataset.picture } },
                  pageAccessToken: page.dataset.accessToken
                };

                // Get watermark for the page (but don't require it)
                const watermarkUrl = await getWatermark(pageData.id);
                if (!watermarkUrl) {
                  console.log(`[INFO] No watermark for page ${pageData.name}, will preview without watermark.`);
                }

                // Fetch default time for this page
                let defaultTime = '';
                let defaultDays = [];
                try {
                  const snap = await getDoc(doc(db, 'default_times', pageData.id));
                  if (snap.exists()) {
                    const data = snap.data();
                    defaultTime = data.time || '';
                    defaultDays = data.days || [];
                  }
                } catch (err) {
                  console.warn(`[WARNING] Could not fetch default time for page ${pageData.name}`);
                }

                // Date parsing logic (already robust above)
                let scheduleDate = post.scheduleDate;
                if (typeof scheduleDate === 'string') {
                  scheduleDate = scheduleDate.trim().replace(/^"|"$/g, '');
                }
                let parsedDate = new Date(scheduleDate);
                let dateWarning = '';
                const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
                if (!iso8601Pattern.test(scheduleDate) || isNaN(parsedDate.getTime())) {
                  console.warn(`[DATE FORMAT ERROR] Expected ISO 8601 (YYYY-MM-DDTHH:MM), got: '${post.scheduleDate}' (cleaned: '${scheduleDate}') - using current date`);
                  dateWarning = `⚠️ Invalid date format: ${post.scheduleDate}. Use YYYY-MM-DDTHH:MM`;
                  parsedDate = new Date();
                }
                if (defaultTime) {
                  const [h, m] = defaultTime.split(':');
                  parsedDate.setHours(Number(h), Number(m), 0, 0);
                }
                scheduleDate = parsedDate.toISOString();

                // Pass default time/days and warnings to preview card for display
                const previewCard = await renderPreviewCard(pageData, {
                  ...post,
                  scheduleDate,
                  _defaultTime: defaultTime,
                  _defaultDays: defaultDays,
                  _dateWarning: dateWarning,
                  _pageAccessTokenWarning: !pageData.pageAccessToken ? '⚠️ No access token for this page. You will not be able to schedule posts.' : ''
                });

                if (previewCard) {
                  const watermarkedImage = previewCard.querySelector('.preview-image')?.src;
                  if (watermarkedImage && watermarkedImage.startsWith('http')) {
                    cachedPosts.push({
                      ...post,
                      pageId: pageData.id,
                      pageName: pageData.name,
                      platform: pageData.platform,
                      scheduleDate,
                      imageUrl: watermarkedImage
                    });
                    console.log('[DEBUG] Added to cachedPosts:', {
                      pageName: pageData.name,
                      imageUrl: watermarkedImage,
                      post
                    });
                  } else {
                    console.warn(`[CACHEDPOSTS] Skipping ${pageData.name} - no valid watermarked image URL`);
                    // Add a warning to the preview card if image is missing
                    const warningDiv = document.createElement('div');
                    warningDiv.className = 'preview-warning';
                    warningDiv.style.color = '#b00';
                    warningDiv.style.fontWeight = 'bold';
                    warningDiv.style.fontSize = '14px';
                    warningDiv.style.marginTop = '8px';
                    warningDiv.textContent = '⚠️ Error: No valid image generated for this page. This post will not be scheduled.';
                    previewCard.appendChild(warningDiv);
                  }
                  previewContainer.appendChild(previewCard);
                }
                completedPreviews++;
                updateProgress();
              } catch (err) {
                console.error(`[PREVIEW ERROR] Failed to generate preview for page/post:`, err);
                failedPreviews.push({ post, page });
                completedPreviews++;
                updateProgress();
              }
            })(),
            20000, // 20 seconds timeout
            'Preview task timed out'
          ).catch(err => {
            console.error('[PREVIEW TIMEOUT/ERROR]', err);
            failedPreviews.push({ post, page });
            completedPreviews++;
            updateProgress();
          })
        );
      }
    }

    // Process initial batch
    await processInBatches(previewTasks, 3, 400);

    // Retry failed previews up to 3 times
    let retryCount = 0;
    const maxRetries = 3;
    while (failedPreviews.length > 0 && retryCount < maxRetries) {
      retryCount++;
      console.log(`[RETRY] Attempt ${retryCount} for ${failedPreviews.length} failed previews`);
      
      // Wait 5 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const retryTasks = failedPreviews.map(({ post, page }) => () =>
        withTimeout(
          (async () => {
            try {
              const pageData = {
                id: page.dataset.id,
                name: page.dataset.name,
                platform: page.dataset.platform,
                picture: { data: { url: page.dataset.picture } },
                pageAccessToken: page.dataset.accessToken
              };

              const watermarkUrl = await getWatermark(pageData.id);
              const previewCard = await renderPreviewCard(pageData, {
                ...post,
                scheduleDate: post.scheduleDate,
                _pageAccessTokenWarning: !pageData.pageAccessToken ? '⚠️ No access token for this page. You will not be able to schedule posts.' : ''
              });

              if (previewCard) {
                previewContainer.appendChild(previewCard);
                cachedPosts.push({ ...post, pageId: pageData.id });
              }
            } catch (err) {
              console.error(`[RETRY ERROR] Failed to generate preview for page/post:`, err);
            }
          })(),
          20000,
          'Preview retry timed out'
        )
      );

      // Clear failed previews array before retry
      failedPreviews = [];
      
      // Process retry batch
      await processInBatches(retryTasks, 3, 400); // Use smaller batch size for retries
    }

    // Remove loading indicator
    loadingDiv.remove();

    // Show final status
    if (failedPreviews.length > 0) {
      showNotification(`Completed ${completedPreviews} previews with ${failedPreviews.length} failures after ${maxRetries} retries`, 'warning');
    } else {
      showNotification(`Successfully generated ${completedPreviews} previews`, 'success');
    }

    // Update schedule button state
    const scheduleBtn = document.getElementById('scheduleBtn');
    if (scheduleBtn && cachedPosts.length > 0) {
      scheduleBtn.disabled = false;
      console.log('Schedule button enabled - previews loaded successfully');
    }

  } catch (error) {
    console.error('[ERROR] Preview generation failed:', error);
    showNotification('Failed to generate preview. Please try again.', 'error');
  }
}

async function handleSchedule() {
  const statusEl = document.getElementById('statusToast');
  if (!statusEl) return console.error("❌ Missing #statusToast element.");

  statusEl.innerHTML = '<div class="scheduling-spinner"></div><p>Scheduling posts...</p>';
  statusEl.style.color = 'black';
  statusEl.style.display = 'block';

  const scheduledPosts = [];
  const BATCH_SIZE = 5;
  let currentBatch = 0;
  let successfulSchedules = 0;
  let failedSchedules = 0;

  try {
    if (!cachedPosts.length) {
      throw new Error("No posts to schedule. Please preview posts first.");
    }

    console.log(`[SCHEDULE] Starting to schedule ${cachedPosts.length} posts in batches of ${BATCH_SIZE}`);

    // Process posts in batches
    while (currentBatch * BATCH_SIZE < cachedPosts.length) {
      const startIdx = currentBatch * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, cachedPosts.length);
      const currentBatchPosts = cachedPosts.slice(startIdx, endIdx);

      statusEl.innerHTML = `<div class="scheduling-spinner"></div><p>Scheduling batch ${currentBatch + 1} of ${Math.ceil(cachedPosts.length / BATCH_SIZE)}...</p>`;

      // Process current batch
      for (const post of currentBatchPosts) {
        const { caption, scheduleDate, pageId, pageName, platform, _finalImageUrls } = post;
        if (!pageId || pageId === '0') {
          console.warn(`⚠️ Skipping invalid page ID for ${pageName}`);
          failedSchedules++;
          continue;
        }

        // Convert the schedule date to a Unix timestamp, preserving the local time
        const scheduledDate = new Date(scheduleDate);
        let scheduledUnix = Math.floor(scheduledDate.getTime() / 1000);
        const nowUnix = Math.floor(Date.now() / 1000);

        // Ensure minimum scheduling time is 20 minutes from now
        if (scheduledUnix - nowUnix < 1200) {
          console.warn("⚠️ Scheduled time too soon. Adjusted to 20 minutes from now.");
          scheduledUnix = nowUnix + 1200;
        }

        // Use the correct image URL for scheduling
        const finalImageUrl = _finalImageUrls?.[pageId] || post.imageUrl;
        if (!finalImageUrl) {
          console.warn(`⚠️ No image found for ${pageName}, skipping.`);
          failedSchedules++;
          continue;
        }

        // Find the correct page object for access token
        const page = cachedPages.find(p => p.id === pageId);
        if (!page || !page.pageAccessToken) {
          console.error(`❌ Missing access token for ${pageName}`);
          failedSchedules++;
          continue;
        }

        try {
          let scheduledPostId = null;
          let scheduledResponse = null;
          let creationId = null;

          if (platform === 'facebook') {
            // Facebook scheduling
            const formData = new FormData();
            formData.append('url', finalImageUrl);
            formData.append('caption', caption);
            formData.append('access_token', page.pageAccessToken);
            formData.append('scheduled_publish_time', scheduledUnix);
            formData.append('published', 'false');

            console.log(`[FB] Scheduling post for ${pageName} at ${new Date(scheduledUnix * 1000).toISOString()}`);
            scheduledResponse = await postToFacebook(pageId, formData, scheduledUnix);
            if (scheduledResponse && scheduledResponse.id) {
              scheduledPostId = scheduledResponse.id;
              console.log(`[FB] Successfully scheduled post ${scheduledPostId} for ${formatDateForDisplay(new Date(scheduledUnix * 1000))}`);
            } else {
              throw new Error('No post ID returned from Facebook');
            }
          } else {
            // Instagram scheduling
            console.log(`[IG] Starting upload for ${pageName} scheduled for ${formatDateForDisplay(new Date(scheduledUnix * 1000))}`);
            creationId = await uploadToInstagram(pageId, page.pageAccessToken, finalImageUrl, caption);
            if (!creationId) {
              throw new Error('Failed to create Instagram container');
            }
          }

          // Use a transaction to ensure atomic operations
          await runTransaction(db, async (transaction) => {
            // Create the scheduled post
            const scheduledPost = {
              pageId,
              pageName,
              platform,
              caption,
              scheduleDate: new Date(scheduledUnix * 1000).toISOString(),
              imageUrl: finalImageUrl,
              postId: scheduledPostId,
              scheduledUnix,
              createdAt: new Date().toISOString(),
              status: platform === 'facebook' ? 'scheduled' : 'pending',
              scheduledResponse: scheduledResponse,
              creationId: creationId
            };

            // Debug log before writing to Firestore
            console.log('[DEBUG] About to write scheduledPost:', scheduledPost);

            // Add to scheduledPosts collection
            const scheduledPostRef = doc(collection(db, 'scheduledPosts'));
            transaction.set(scheduledPostRef, scheduledPost);

            // For Instagram posts, also add to pending queue
            if (platform === 'instagram' && creationId) {
              const pendingPost = {
                pageId,
                creationId: creationId,
                accessToken: page.pageAccessToken,
                scheduledUnix,
                scheduledPostId: scheduledPostRef.id,
                createdAt: new Date().toISOString(),
                retryCount: 0
              };

              const pendingPostRef = doc(collection(db, 'pendingIGPosts'));
              transaction.set(pendingPostRef, pendingPost);
            }

            // Update local state
            scheduledPosts.push({ ...scheduledPost, id: scheduledPostRef.id });
            statusEl.innerHTML += `✅ Scheduled: ${pageName} for ${formatDateForDisplay(new Date(scheduledUnix * 1000))}<br>`;
            successfulSchedules++;
          });

        } catch (err) {
          console.error(`🔥 Error scheduling for ${pageName}:`, err);
          statusEl.innerHTML += `❌ Failed: ${pageName} — ${err.message}<br>`;
          failedSchedules++;
        }
      }

      // Wait 2 seconds before processing next batch
      if (endIdx < cachedPosts.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      currentBatch++;
    }

    console.log(`[SCHEDULE] Completed scheduling. Success: ${successfulSchedules}, Failed: ${failedSchedules}`);
    statusEl.innerHTML += `<br>✅ All posts processed! (${successfulSchedules} successful, ${failedSchedules} failed)`;
    statusEl.style.color = 'green';
    
    // Refresh the scheduled posts view
    const viewScheduledBtn = document.getElementById('viewScheduledBtn');
    if (viewScheduledBtn) {
      console.log('[SCHEDULE] Refreshing scheduled posts view...');
      viewScheduledBtn.click();
    } else {
      console.warn('[SCHEDULE] Could not find viewScheduledBtn to refresh view');
    }

  } catch (error) {
    console.error("🔥 Failed to schedule posts:", error);
    statusEl.innerHTML = `❌ Error: ${error.message}`;
    statusEl.style.color = 'red';
  } finally {
    setTimeout(() => (statusEl.style.display = 'none'), 3000);
    const scheduleBtn = document.getElementById('scheduleBtn');
    if (scheduleBtn) scheduleBtn.disabled = false;
  }
}

// After editing a post, update cachedPosts in memory
window.updateCachedPost = function(postId, newData) {
  const idx = cachedPosts.findIndex(p => p.id === postId);
  if (idx !== -1) {
    cachedPosts[idx] = { ...cachedPosts[idx], ...newData };
  }
};

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
  
  // Skip the header row (first line) and process only the data rows
  const dataRows = lines.slice(1);
  
  return dataRows.map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    // Only parse date from column C (index 2), ignore any date-like content in other columns
    const scheduleDate = values[2] || '';
    return {
      imageUrl: values[0] || '',      // Column A: Image URL
      caption: values[1] || '',       // Column B: Caption and hashtags
      scheduleDate                   // Column C: Date (only column we parse for dates)
    };
  });
}

// Utility: Promise with timeout
function withTimeout(promise, ms, errorMsg = 'Task timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

// Utility: Sleep/delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Modified processInBatches to add delay between batches
async function processInBatches(tasks, batchSize = 3, delayMs = 400) {
  let index = 0;
  while (index < tasks.length) {
    const batch = tasks.slice(index, index + batchSize);
    await Promise.all(batch.map(task => task()));
    index += batchSize;
    if (index < tasks.length) {
      await sleep(delayMs);
    }
  }
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
window.renderPreviewCard = renderPreviewCard;

window.addEventListener('online', () => {
  processPendingWrites(db);
});

async function renderPreviewCard(page, post) {
  try {
    if (!post || !post.imageUrl) {
      console.warn(`[WARNING] No valid post data for ${page.name}`);
      // Create a card with error message
      const card = document.createElement('div');
      card.className = 'preview-card preview-error';
      card.innerHTML = `
        <div class="preview-header">
          <img src="assets/default-profile.png" alt="${page.name}" class="preview-profile">
          <div class="preview-info">
            <div class="preview-name">${page.name}</div>
            <div class="preview-platform">${page.platform}</div>
          </div>
        </div>
        <div class="preview-content">
          <div class="preview-warning" style="color:#b00; font-size:14px; font-weight:bold; margin-top:8px;">
            ⚠️ Error: No image found for this post/page. Please check your CSV or try another page.
          </div>
        </div>
      `;
      return card;
    }

    const { imageUrl, caption, scheduleDate, _defaultTime, _defaultDays, _dateWarning, _pageAccessTokenWarning } = post;

    // Get watermark for the page (but don't require it)
    const watermarkUrl = await getWatermark(page.id);
    if (!watermarkUrl) {
      console.log(`[INFO] No watermark for page ${page.name}, will preview without watermark.`);
    }

    // Create preview card
    const card = document.createElement('div');
    card.className = 'preview-card';

    // Default profile image as data URL
    const defaultProfileImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNFNUU3RUIiLz48cGF0aCBkPSJNMjQgMjBDMjYuMjA5MSAyMCAyOCAxOC4yMDkxIDI4IDE2QzI4IDEzLjc5MDkgMjYuMjA5MSAxMiAyNCAxMkMyMS43OTA5IDEyIDIwIDEzLjc5MDkgMjAgMTZDMjAgMTguMjA5MSAyMS43OTA5IDIwIDI0IDIwWiIgZmlsbD0iIzk0OTk5RiIvPjxwYXRoIGQ9Ik0zMiAyOEMzMiAyNS43OTAxIDI4LjQxODMgMjQgMjQgMjRDMjAuNDE4MyAyNCAxNiAyNS43OTAxIDE2IDI4VjMySDMyVjI4WiIgZmlsbD0iIzk0OTk5RiIvPjwvc3ZnPg==';

    // Format the schedule date in user's local timezone
    let formattedDate = '';
    if (scheduleDate) {
      const d = new Date(scheduleDate);
      formattedDate = d.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      }).replace(',', '');
    }

    // Format default days
    let daysText = '';
    if (_defaultDays && _defaultDays.length) {
      daysText = ` (${_defaultDays.join(', ')})`;
    }

    // Apply watermark to image if available
    let finalImageUrl = imageUrl;
    if (watermarkUrl) {
      try {
        finalImageUrl = await renderAndUploadWatermarkedImage(imageUrl, watermarkUrl);
        console.log(`[DEBUG] Watermarked image URL:`, finalImageUrl);
      } catch (error) {
        console.error(`[ERROR] Failed to apply watermark:`, error);
        showNotification(`Failed to apply watermark for ${page.name}`, 'error');
      }
    }

    // Create the preview card HTML with watermark indicator and default time/days
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
        <img src="${finalImageUrl}" alt="Preview" class="preview-image">
      </div>
      <div class="preview-content">
        <p class="preview-caption">${caption || 'No caption'}</p>
        <p class="preview-schedule">📅 ${formattedDate}${_defaultTime ? ` ⏰ ${_defaultTime}${daysText}` : ''}</p>
        ${_dateWarning ? `<div class='preview-warning' style='color:#b00; font-size:13px; margin-top:4px;'>${_dateWarning}</div>` : ''}
        ${_pageAccessTokenWarning ? `<div class='preview-warning' style='color:#b00; font-size:13px; margin-top:4px;'>${_pageAccessTokenWarning}</div>` : ''}
      </div>
    `;

    return card;
  } catch (error) {
    console.error(`[ERROR] Failed to render preview card for ${page.name}:`, error);
    showNotification(`Failed to generate preview for ${page.name}`, 'error');
    return null;
  }
}

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

// Helper: Parse user-friendly or ISO date string to ISO format
function parseUserDate(input) {
  // Try ISO first
  let d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Try user-friendly format: YYYY-MM-DD hh:mm AM/PM
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2}) ?([APap][Mm])?$/);
  if (match) {
    let [_, year, month, day, hour, minute, ampm] = match;
    hour = parseInt(hour, 10);
    if (ampm) {
      ampm = ampm.toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
    }
    const date = new Date(year, month - 1, day, hour, minute);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

// Helper: Format date for display in user's timezone
function formatDateForDisplay(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  }).replace(',', '');
}

// Helper: Format date for datetime-local input
function formatDateForInput(dateString) {
  const date = new Date(dateString);
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Debug: Test Firestore write function
async function testFirestoreWrite() {
  try {
    const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
    const docRef = await addDoc(collection(db, 'scheduledPosts'), {
      test: true,
      createdAt: new Date().toISOString()
    });
    console.log('✅ Test doc written with ID:', docRef.id);
  } catch (err) {
    console.error('🔥 Firestore write failed:', err);
  }
}
window.testFirestoreWrite = testFirestoreWrite;