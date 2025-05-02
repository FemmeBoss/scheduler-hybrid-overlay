// igPublisher.js
import { db } from './firebase-config.js';
import { 
  collection, 
  getDocs, 
  deleteDoc, 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction,
  writeBatch,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const POLL_INTERVAL_MS = 60000; // 1 minute
const MAX_RETRIES = 3;

// Add cleanup function for invalid pending posts
async function cleanupInvalidPendingPosts() {
  console.log('🧹 Starting cleanup of invalid pending posts...');
  const colRef = collection(db, 'pendingIGPosts');
  const batch = writeBatch(db);
  let cleanupCount = 0;

  try {
    const snapshot = await getDocs(colRef);
    
    for (const docSnap of snapshot.docs) {
      const post = docSnap.data();
      const postId = docSnap.id;
      const missingFields = [];

      // Check for required fields
      if (!post.creationId) missingFields.push('creationId');
      if (!post.pageId) missingFields.push('pageId');
      if (!post.accessToken) missingFields.push('accessToken');
      if (!post.scheduledUnix) missingFields.push('scheduledUnix');
      if (!post.scheduledPostId) missingFields.push('scheduledPostId');

      // If any required fields are missing
      if (missingFields.length > 0) {
        console.log(`🗑️ Cleaning up invalid post ${postId}. Missing fields: ${missingFields.join(', ')}`);
        batch.delete(doc(db, 'pendingIGPosts', postId));
        cleanupCount++;
      }
    }

    if (cleanupCount > 0) {
      await batch.commit();
      console.log(`✅ Cleaned up ${cleanupCount} invalid pending posts`);
    } else {
      console.log('✅ No invalid pending posts found');
    }
  } catch (error) {
    console.error('❌ Error during pending posts cleanup:', error);
  }
}

// Modify pollInstagramQueue to run cleanup first
async function pollInstagramQueue() {
  // Run cleanup before polling
  await cleanupInvalidPendingPosts();
  
  const nowUnix = Math.floor(Date.now() / 1000);
  const colRef = collection(db, 'pendingIGPosts');

  try {
    const snapshot = await getDocs(colRef);
    for (const docSnap of snapshot.docs) {
      const post = docSnap.data();
      const postId = docSnap.id;

      // Log missing fields specifically
      const requiredFields = {
        creationId: post.creationId,
        pageId: post.pageId,
        accessToken: post.accessToken ? '✓' : '✗',
        scheduledUnix: post.scheduledUnix,
        scheduledPostId: post.scheduledPostId
      };

      if (!post.creationId || !post.pageId || !post.accessToken || !post.scheduledUnix || !post.scheduledPostId) {
        console.warn(`⚠️ Skipping invalid IG post ${postId}: missing fields:`, 
          Object.entries(requiredFields)
            .filter(([_, value]) => !value)
            .map(([field]) => field)
            .join(', ')
        );
        continue;
      }

      // Skip if not ready to publish
      if (post.scheduledUnix > nowUnix) {
        console.log(`⏱️ IG post ${postId} not ready yet. Scheduled for ${new Date(post.scheduledUnix * 1000)}`);
        continue;
      }

      // Skip if currently being processed
      if (post.isProcessing && (Date.now() - new Date(post.processingStartedAt).getTime()) < 300000) { // 5 minutes timeout
        console.log(`⏳ IG post ${postId} is currently being processed (started ${new Date(post.processingStartedAt).toISOString()})`);
        continue;
      }

      // Skip if max retries reached
      if (post.retryCount >= MAX_RETRIES) {
        console.warn(`⚠️ Max retries reached for IG post ${postId}. Last error: ${post.lastError || 'Unknown error'}`);
        await handleFailedPost(postId, post.scheduledPostId, `Max retries (${MAX_RETRIES}) reached. Last error: ${post.lastError || 'Unknown error'}`);
        continue;
      }

      console.log(`[⏰ IG Poller] Publishing IG post for page ${post.pageId} at ${new Date(post.scheduledUnix * 1000)}`);

      try {
        // Set processing lock using transaction
        await runTransaction(db, async (transaction) => {
          const postRef = doc(db, 'pendingIGPosts', postId);
          const postDoc = await transaction.get(postRef);
          
          if (!postDoc.exists()) {
            throw new Error('Post no longer exists');
          }
          
          const currentPost = postDoc.data();
          if (currentPost.isProcessing && (Date.now() - new Date(currentPost.processingStartedAt).getTime()) < 300000) {
            throw new Error('Post is already being processed');
          }
          
          transaction.update(postRef, {
            isProcessing: true,
            processingStartedAt: new Date().toISOString(),
            retryCount: (currentPost.retryCount || 0) + 1,
            lastAttempt: new Date().toISOString()
          });
        });

        // Attempt to publish
        console.log(`📤 Attempting to publish IG post ${postId} (Attempt ${post.retryCount + 1}/${MAX_RETRIES})`);
        
        const res = await fetch(`https://graph.facebook.com/v18.0/${post.pageId}/media_publish`, {
          method: 'POST',
          body: new URLSearchParams({
            creation_id: post.creationId,
            access_token: post.accessToken
          })
        });

        const data = await res.json();
        
        // Handle token expiration
        if (data.error && data.error.message && data.error.message.includes('Session has expired')) {
          console.warn('⚠️ Token expired:', data.error.message);
          await handleTokenExpired(postId, post.scheduledPostId, data.error.message);
          continue;
        }

        if (res.ok && data.id) {
          console.log(`✅ IG post published: ${data.id}`);
          await handleSuccessfulPost(postId, post.scheduledPostId, data.id);
        } else {
          const errorMsg = data.error?.message || 'Unknown error';
          console.warn(`⚠️ Failed to publish IG post (Attempt ${post.retryCount + 1}/${MAX_RETRIES}):`, errorMsg);
          await handleFailedAttempt(postId, post.scheduledPostId, errorMsg);
        }
      } catch (publishError) {
        console.error(`🔥 Error publishing IG post (Attempt ${post.retryCount + 1}/${MAX_RETRIES}):`, publishError);
        await handleFailedAttempt(postId, post.scheduledPostId, publishError.message);
      }
    }
  } catch (err) {
    console.error(`🔥 IG Poller failed:`, err);
  }
}

async function handleSuccessfulPost(pendingPostId, scheduledPostId, publishedPostId) {
  try {
    // Check if documents exist before creating batch
    const scheduledPostRef = doc(db, 'scheduledPosts', scheduledPostId);
    const pendingPostRef = doc(db, 'pendingIGPosts', pendingPostId);
    
    const [scheduledDoc, pendingDoc] = await Promise.all([
      getDoc(scheduledPostRef),
      getDoc(pendingPostRef)
    ]);

    if (!scheduledDoc.exists()) {
      console.error(`⚠️ Scheduled post ${scheduledPostId} not found`);
      // If scheduled post doesn't exist but pending does, clean up pending
      if (pendingDoc.exists()) {
        await deleteDoc(pendingPostRef);
      }
      return;
    }

    const batch = writeBatch(db);
    
    // Update the main scheduledPosts collection
    batch.update(scheduledPostRef, {
      status: 'published',
      publishedAt: new Date().toISOString(),
      publishedPostId: publishedPostId
    });

    // Remove from pending queue if it exists
    if (pendingDoc.exists()) {
      batch.delete(pendingPostRef);
    }

    await batch.commit();
    console.log(`✅ Successfully updated post status for ${scheduledPostId}`);
  } catch (error) {
    console.error(`🔥 Error in handleSuccessfulPost:`, error);
    throw error;
  }
}

async function handleFailedAttempt(pendingPostId, scheduledPostId, errorMessage) {
  const pendingPostRef = doc(db, 'pendingIGPosts', pendingPostId);
  const pendingPost = await getDoc(pendingPostRef);
  
  if (!pendingPost.exists()) return;
  
  const currentRetries = pendingPost.data().retryCount || 0;
  
  if (currentRetries >= MAX_RETRIES) {
    await handleFailedPost(pendingPostId, scheduledPostId, errorMessage);
  } else {
    await updateDoc(pendingPostRef, {
      isProcessing: false,
      lastError: errorMessage,
      lastAttempt: new Date().toISOString()
    });
  }
}

async function handleFailedPost(pendingPostId, scheduledPostId, errorMessage) {
  try {
    // Check if documents exist before creating batch
    const scheduledPostRef = doc(db, 'scheduledPosts', scheduledPostId);
    const pendingPostRef = doc(db, 'pendingIGPosts', pendingPostId);
    
    const [scheduledDoc, pendingDoc] = await Promise.all([
      getDoc(scheduledPostRef),
      getDoc(pendingPostRef)
    ]);

    if (!scheduledDoc.exists()) {
      console.error(`⚠️ Scheduled post ${scheduledPostId} not found`);
      // If scheduled post doesn't exist but pending does, clean up pending
      if (pendingDoc.exists()) {
        await deleteDoc(pendingPostRef);
      }
      return;
    }

    const batch = writeBatch(db);
    
    // Update the scheduled post status
    batch.update(scheduledPostRef, {
      status: 'failed',
      error: errorMessage,
      updatedAt: new Date().toISOString()
    });

    // Remove from pending queue if it exists
    if (pendingDoc.exists()) {
      batch.delete(pendingPostRef);
    }

    await batch.commit();
    console.log(`✅ Successfully marked post ${scheduledPostId} as failed`);
  } catch (error) {
    console.error(`🔥 Error in handleFailedPost:`, error);
    throw error;
  }
}

async function handleTokenExpired(pendingPostId, scheduledPostId, errorMessage) {
  try {
    // Check if documents exist before creating batch
    const scheduledPostRef = doc(db, 'scheduledPosts', scheduledPostId);
    const pendingPostRef = doc(db, 'pendingIGPosts', pendingPostId);
    
    const [scheduledDoc, pendingDoc] = await Promise.all([
      getDoc(scheduledPostRef),
      getDoc(pendingPostRef)
    ]);

    if (!scheduledDoc.exists()) {
      console.error(`⚠️ Scheduled post ${scheduledPostId} not found`);
      // If scheduled post doesn't exist but pending does, clean up pending
      if (pendingDoc.exists()) {
        await deleteDoc(pendingPostRef);
      }
      return;
    }

    const batch = writeBatch(db);
    
    // Update the scheduled post status
    batch.update(scheduledPostRef, {
      status: 'token_expired',
      error: errorMessage,
      updatedAt: new Date().toISOString()
    });

    // Remove from pending queue if it exists
    if (pendingDoc.exists()) {
      batch.delete(pendingPostRef);
    }

    await batch.commit();
    console.log(`✅ Successfully marked post ${scheduledPostId} as token expired`);
  } catch (error) {
    console.error(`🔥 Error in handleTokenExpired:`, error);
    throw error;
  }
}

// Start polling
setInterval(pollInstagramQueue, POLL_INTERVAL_MS);
pollInstagramQueue(); // Initial poll

// Export for testing
export { pollInstagramQueue, cleanupInvalidPendingPosts };