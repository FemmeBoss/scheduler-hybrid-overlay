console.log("📅 [viewScheduled.js] Loaded");
console.log("📡 Fetching from Firestore...");

import {
  getDocs,
  collection,
  doc,
  deleteDoc,
  updateDoc,
  getDoc,
  query,
  where,
  addDoc
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

import { db, storage } from '../core/firebase-config.js';
import { ref, deleteObject, uploadBytes } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

// Helper Functions
function formatDateForInput(dateString) {
  const date = new Date(dateString);
  return date.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function getPostStatus(post) {
  const now = new Date();
  const scheduledTime = new Date(post.scheduledTime || post.scheduleDate);
  
  if (post.status === 'deleted' || post.status === 'edited') {
    return post.status;
  }
  
  if (post.error) {
    return 'failed';
  }
  
  if (post.published) {
    return 'published';
  }
  
  if (scheduledTime <= now) {
    return 'pending';
  }
  
  return 'scheduled';
}

function getStatusBadgeHTML(status) {
  const badges = {
    scheduled: '<span class="badge badge-primary">Scheduled</span>',
    pending: '<span class="badge badge-warning">Pending</span>',
    published: '<span class="badge badge-success">Published</span>',
    failed: '<span class="badge badge-danger">Failed</span>',
    deleted: '<span class="badge badge-secondary">Deleted</span>',
    edited: '<span class="badge badge-info">Edited</span>'
  };
  return badges[status] || badges.pending;
}

// Initialize modals in the DOM
function initializeModals() {
  console.log('Initializing modals...');
  
  // Remove existing modals if they exist
  document.querySelector('.edit-modal')?.remove();
  document.querySelector('.confirm-modal')?.remove();

  // Add edit modal
  const editModalHTML = `
    <div class="edit-modal">
      <div class="edit-modal-content">
        <div class="edit-modal-header">
          <h3 class="edit-modal-title">Edit Post</h3>
          <button class="edit-modal-close">&times;</button>
        </div>
        <div class="edit-modal-body">
          <textarea id="editCaption" placeholder="Enter your caption"></textarea>
          <input type="datetime-local" id="editScheduleTime">
        </div>
        <div class="edit-modal-footer">
          <button class="btn btn-secondary" onclick="window.closeEditModal()">Cancel</button>
          <button class="btn btn-primary" id="saveEditBtn">Save Changes</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', editModalHTML);

  // Add delete modal
  const deleteModalHTML = `
    <div class="confirm-modal">
      <div class="confirm-modal-content">
        <div class="confirm-modal-header">
          <h3 class="confirm-modal-title">Delete Post</h3>
          <button class="confirm-modal-close">&times;</button>
        </div>
        <p>Are you sure you want to delete this post? This action cannot be undone.</p>
        <div class="confirm-modal-footer">
          <button class="btn btn-secondary" onclick="window.closeDeleteModal()">Cancel</button>
          <button class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', deleteModalHTML);

  // Add event listeners for modal close buttons
  document.querySelectorAll('.edit-modal-close, .confirm-modal-close').forEach(button => {
    button.addEventListener('click', (e) => {
      const modal = e.target.closest('.edit-modal, .confirm-modal');
      if (modal.classList.contains('edit-modal')) {
        window.closeEditModal();
      } else {
        window.closeDeleteModal();
      }
    });
  });

  // Add click outside listeners
  document.querySelector('.edit-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) window.closeEditModal();
  });

  document.querySelector('.confirm-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) window.closeDeleteModal();
  });

  console.log('Modals initialized successfully');
}

// Initialize modals when the document is ready
document.addEventListener('DOMContentLoaded', initializeModals);

// Make functions available globally
window.openEditModal = async function(postId) {
  console.log('Opening edit modal for post:', postId);
  
  try {
    // Get post data
    const postRef = doc(db, 'scheduledPosts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const post = postSnap.data();

    // Ensure modals are initialized
    if (!document.querySelector('.edit-modal')) {
      console.log('Edit modal not found, initializing...');
      initializeModals();
    }

    const modal = document.querySelector('.edit-modal');
    const captionInput = document.getElementById('editCaption');
    const timeInput = document.getElementById('editScheduleTime');
    const saveButton = document.getElementById('saveEditBtn');
    
    if (!modal || !captionInput || !timeInput || !saveButton) {
      console.error('Modal elements not found after initialization');
      return;
    }

    // Set current values
    captionInput.value = post.caption || '';
    timeInput.value = new Date(post.scheduleDate).toISOString().slice(0, 16); // Format for datetime-local input

    // Update save button click handler
    saveButton.onclick = () => window.saveEdit(postId);
    
    // Show modal with animation
    modal.classList.add('active');
  } catch (error) {
    console.error('Error opening edit modal:', error);
    showNotification('Failed to open edit modal: ' + error.message, 'error');
  }
};

window.closeEditModal = function() {
  console.log('Closing edit modal');
  const modal = document.querySelector('.edit-modal');
  if (modal) {
    modal.classList.remove('active');
  }
};

window.saveEdit = async function(postId) {
  console.log('Saving edit for post:', postId);
  const caption = document.getElementById('editCaption').value;
  const scheduledTime = document.getElementById('editScheduleTime').value;

  try {
    // Get the current post data
    const postRef = doc(db, 'scheduledPosts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const post = postSnap.data();
    const scheduledUnix = Math.floor(new Date(scheduledTime).getTime() / 1000);

    // Get the page access token from the checkbox data
    const pageCheckbox = document.querySelector(`.page-checkbox[data-id="${post.pageId}"]`);
    if (!pageCheckbox) {
      throw new Error('Page not found in current selection');
    }

    const pageAccessToken = pageCheckbox.dataset.accessToken;
    if (!pageAccessToken) {
      throw new Error('Page access token not found');
    }

    // Handle platform-specific updates
    if (post.platform === 'facebook' && post.postId) {
      try {
        console.log('Updating Facebook post:', {
          postId: post.postId,
          pageId: post.pageId,
          hasToken: !!pageAccessToken
        });

        // First verify we can access the post
        const verifyResponse = await fetch(`https://graph.facebook.com/v18.0/${post.postId}?fields=id&access_token=${pageAccessToken}`);
        const verifyData = await verifyResponse.json();
        
        if (!verifyResponse.ok) {
          // If we can't access the post, just create a new one
          console.log('Original post not accessible, creating new post...');
          const formData = new FormData();
          formData.append('url', post.imageUrl);
          formData.append('caption', caption);
          formData.append('access_token', pageAccessToken);
          formData.append('scheduled_publish_time', scheduledUnix);
          formData.append('published', 'false');

          const createResponse = await fetch(`https://graph.facebook.com/v18.0/${post.pageId}/photos`, {
            method: 'POST',
            body: formData
          });

          const createData = await createResponse.json();
          if (!createResponse.ok || !createData.id) {
            throw new Error(createData.error?.message || 'Failed to create new Facebook post');
          }

          // Update Firestore with new post ID
          await updateDoc(postRef, {
            caption,
            scheduleDate: new Date(scheduledTime).toISOString(),
            scheduledTime: new Date(scheduledTime).toISOString(),
            postId: createData.id,
            status: 'scheduled',
            updatedAt: new Date().toISOString(),
            pageAccessToken: pageAccessToken
          });

          console.log('Successfully created new Facebook post:', createData.id);
          return;
        }

        // If we can access the post, try to delete it first
        const deleteResponse = await fetch(`https://graph.facebook.com/v18.0/${post.postId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            access_token: pageAccessToken
          })
        });

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json();
          throw new Error(errorData.error?.message || 'Failed to delete original post');
        }

        // Create new scheduled post
        const formData = new FormData();
        formData.append('url', post.imageUrl);
        formData.append('caption', caption);
        formData.append('access_token', pageAccessToken);
        formData.append('scheduled_publish_time', scheduledUnix);
        formData.append('published', 'false');

        const createResponse = await fetch(`https://graph.facebook.com/v18.0/${post.pageId}/photos`, {
          method: 'POST',
          body: formData
        });

        const createData = await createResponse.json();
        if (!createResponse.ok || !createData.id) {
          throw new Error(createData.error?.message || 'Failed to reschedule Facebook post');
        }

        // Update Firestore with new post ID
        await updateDoc(postRef, {
          caption,
          scheduleDate: new Date(scheduledTime).toISOString(),
          scheduledTime: new Date(scheduledTime).toISOString(),
          postId: createData.id,
          status: 'scheduled',
          updatedAt: new Date().toISOString(),
          pageAccessToken: pageAccessToken
        });

        console.log('Successfully updated Facebook post:', createData.id);
      } catch (error) {
        console.error('Error updating Facebook post:', error);
        throw new Error(`Failed to update Facebook post: ${error.message}`);
      }
    } else if (post.platform === 'instagram') {
      try {
        console.log('Updating Instagram post:', {
          pageId: post.pageId,
          hasToken: !!pageAccessToken
        });

        // Remove from pending queue if exists
        const pendingQuery = query(
          collection(db, 'pendingIGPosts'),
          where('creationId', '==', post.creationId)
        );
        const pendingSnapshot = await getDocs(pendingQuery);
        
        for (const doc of pendingSnapshot.docs) {
          await deleteDoc(doc.ref);
        }

        // Create new Instagram container
        const creationResponse = await fetch(`https://graph.facebook.com/v18.0/${post.pageId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            image_url: post.imageUrl,
            caption,
            access_token: pageAccessToken,
            is_published: 'false'
          })
        });

        const creationData = await creationResponse.json();
        if (!creationResponse.ok || !creationData.id) {
          throw new Error(creationData.error?.message || 'Failed to create Instagram container');
        }

        // Add to pending queue
        const pendingPost = {
          pageId: post.pageId,
          creationId: creationData.id,
          accessToken: pageAccessToken,
          scheduledUnix,
          scheduledPostId: postId,
          createdAt: new Date().toISOString(),
          retryCount: 0
        };

        await addDoc(collection(db, 'pendingIGPosts'), pendingPost);

        // Update Firestore
        await updateDoc(postRef, {
          caption,
          scheduleDate: new Date(scheduledTime).toISOString(),
          scheduledTime: new Date(scheduledTime).toISOString(),
          creationId: creationData.id,
          status: 'pending',
          updatedAt: new Date().toISOString(),
          pageAccessToken: pageAccessToken // Store the token for future use
        });

        console.log('Successfully updated Instagram post:', creationData.id);
      } catch (error) {
        console.error('Error updating Instagram post:', error);
        throw new Error(`Failed to update Instagram post: ${error.message}`);
      }
    }

    showNotification('Post updated successfully', 'success');
    closeEditModal();
    loadScheduledPosts(); // Refresh the posts list
  } catch (error) {
    console.error('Error updating post:', error);
    showNotification('Failed to update post: ' + error.message, 'error');
  }
};

window.openDeleteModal = async function(postId) {
  console.log('Opening delete modal for post:', postId);
  
  // Ensure modals are initialized
  if (!document.querySelector('.confirm-modal')) {
    console.log('Modals not found, initializing...');
    initializeModals();
  }

  const modal = document.querySelector('.confirm-modal');
  const confirmButton = document.getElementById('confirmDeleteBtn');
  
  if (!modal || !confirmButton) {
    console.error('Modal elements not found after initialization');
    return;
  }
  
  // Update confirm button click handler
  confirmButton.onclick = () => window.confirmDelete(postId);
  
  // Show modal with animation
  modal.classList.add('active');
};

window.closeDeleteModal = function() {
  console.log('Closing delete modal');
  const modal = document.querySelector('.confirm-modal');
  if (modal) {
    modal.classList.remove('active');
  }
};

window.confirmDelete = async function(postId) {
  console.log('Confirming delete for post:', postId);
  try {
    const postRef = doc(db, 'scheduledPosts', postId);
    await deleteDoc(postRef);
    
    showNotification('Post deleted successfully', 'success');
    closeDeleteModal();
    loadScheduledPosts(); // Refresh the posts list
  } catch (error) {
    console.error('Error deleting post:', error);
    showNotification('Failed to delete post: ' + error.message, 'error');
  }
};

// Event Listeners
document.getElementById('viewScheduledBtn')?.addEventListener('click', loadScheduledPosts);

// Main Functions
async function loadScheduledPosts() {
  console.log("📅 [DEBUG] Clicked View Scheduled Posts");

  const container = document.getElementById('scheduledPosts');
  if (!container) {
    console.warn("❌ #scheduledPosts container not found.");
    return;
  }

  container.innerHTML = '<p>Loading scheduled posts...</p>';

  const checkedBoxes = document.querySelectorAll('.page-checkbox:checked');
  const selectedPageIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);
  console.log("🔎 Selected page IDs:", selectedPageIds);

  if (selectedPageIds.length === 0) {
    container.innerHTML = '<p class="text-center">Please select at least one page to view scheduled posts</p>';
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, 'scheduledPosts'));
    window.scheduledPosts = []; // Reset the global array
    const now = new Date();

    snapshot.forEach(doc => {
      const post = { ...doc.data(), id: doc.id };
      const postTime = new Date(post.scheduledTime || post.scheduleDate);
      
      // Skip deleted, edited, or past posts
      if (post.status === 'deleted' || post.status === 'edited' || postTime < now) return;
      
      // Only add posts for selected pages
      if (selectedPageIds.includes(post.pageId)) {
        window.scheduledPosts.push(post);
      }
    });

    // Sort posts by scheduled time
    window.scheduledPosts.sort((a, b) => {
      const timeA = new Date(a.scheduledTime || a.scheduleDate);
      const timeB = new Date(b.scheduledTime || b.scheduleDate);
      return timeA - timeB;
    });

    // Update UI
    if (window.scheduledPosts.length === 0) {
      container.innerHTML = '<p class="text-center">No upcoming scheduled posts found for selected pages</p>';
      return;
    }

    const postsHTML = window.scheduledPosts.map(post => {
      const status = getPostStatus(post);
      const scheduledTime = new Date(post.scheduledTime || post.scheduleDate);
      return `
        <div class="scheduled-post" data-post-id="${post.id}" style="display: flex; flex-direction: row; align-items: stretch; gap: 1.5rem; padding: 1rem 0; border-bottom: 1px solid #f0f0f0;">
          <div class="scheduled-thumb" style="flex: 0 0 120px; width: 120px; height: 150px; border-radius: 8px; overflow: hidden; background: #f8f9fa; display: flex; align-items: center; justify-content: center;">
            <img src="${post.imageUrl || 'assets/default-profile.png'}" alt="Post thumbnail" style="width: 100%; height: 100%; object-fit: cover; object-position: center; border-radius: 8px;" onerror="this.src='assets/default-profile.png'" />
          </div>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <strong>${post.pageName || 'Unnamed Page'}</strong>
                <span class="platform-badge ${post.platform}">${post.platform}</span>
                ${getStatusBadgeHTML(status)}
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="action-btn edit" onclick="window.openEditModal('${post.id}')" ${status === 'published' ? 'disabled' : ''}>Edit</button>
                <button class="action-btn delete" onclick="window.openDeleteModal('${post.id}')">Delete</button>
              </div>
            </div>
            <div class="post-caption" style="margin: 0.5rem 0 0.25rem 0;">${post.caption || ''}</div>
            <div class="post-meta" style="font-size: 0.95em; color: #666;">
              <span class="scheduled-time"><i class="far fa-clock"></i> ${scheduledTime.toLocaleString()}</span>
              <span class="platform-badge ${post.platform.toLowerCase()}"><i class="fab fa-${post.platform.toLowerCase()}"></i> ${post.platform}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = postsHTML;
  } catch (error) {
    console.error('Error loading posts:', error);
    container.innerHTML = '<p class="text-center text-error">Error loading posts. Please try again.</p>';
  }
}

function initializePostActions() {
  console.log('Initializing post actions...');
  
  // Add event listeners for edit buttons
  document.querySelectorAll('.action-btn.edit').forEach(button => {
    button.addEventListener('click', (e) => {
      const postId = e.currentTarget.dataset.postId;
      console.log('Edit clicked for post:', postId);
      window.openEditModal(postId);
    });
  });

  // Add event listeners for delete buttons
  document.querySelectorAll('.action-btn.delete').forEach(button => {
    button.addEventListener('click', (e) => {
      const postId = e.currentTarget.dataset.postId;
      console.log('Delete clicked for post:', postId);
      window.openDeleteModal(postId);
    });
  });
}