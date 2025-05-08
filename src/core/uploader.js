// ✅ Upload normal image blob to Cloudinary
export async function uploadImage(blob) {
  const CLOUD_NAME = "drsopn5st";
  const UPLOAD_PRESET = "femme_boss_uploads";

  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  if (!data.secure_url) throw new Error("Cloudinary upload failed");
  return data.secure_url;
}

// ✅ Post to Facebook
export async function postToFacebook(pageId, formData, scheduledUnix) {
  // Validate page ID
  if (!pageId || typeof pageId !== 'string' || pageId === '0') {
    throw new Error('Invalid Facebook page ID');
  }

  // Validate access token
  const accessToken = formData.get('access_token');
  if (!accessToken) {
    throw new Error('Missing access token');
  }

  // Ensure page ID is a string and remove any whitespace
  const cleanPageId = pageId.toString().trim();
  
  formData.append('published', 'false');
  formData.append('scheduled_publish_time', scheduledUnix);

  try {
    // First verify the page access
    const verifyRes = await fetch(`https://graph.facebook.com/v18.0/${cleanPageId}?fields=id,name&access_token=${accessToken}`);
    const verifyData = await verifyRes.json();
    
    if (!verifyRes.ok || !verifyData.id) {
      throw new Error(`Invalid page access: ${verifyData.error?.message || 'Unknown error'}`);
    }

    // Proceed with posting
    const res = await fetch(`https://graph.facebook.com/v18.0/${cleanPageId}/photos`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    
    if (!res.ok) {
      if (data.error?.code === 190) {
        throw new Error('Access token has expired. Please log in again.');
      }
      throw new Error(data.error?.message || 'Facebook post failed');
    }

    if (!data.id) {
      throw new Error('No post ID returned from Facebook');
    }

    console.log(`[FB Response] ✅ Scheduled post ID: ${data.id} for page ${cleanPageId}`);
    return data;
  } catch (error) {
    console.error(`[FB Error] Failed to post to page ${cleanPageId}:`, error);
    throw new Error(`Facebook post failed: ${error.message}`);
  }
}

// ✅ Upload to Instagram — patched for scheduled publishing
export async function uploadToInstagram(igUserId, token, imageUrl, caption) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: token,
      is_published: 'false' // ✅ Critical for scheduling to work
    })
  });

  const data = await res.json();
  if (!data.id) throw new Error(data.error?.message || 'Instagram upload failed');
  return data.id;
}

// ✅ Schedule Instagram Post
export async function scheduleInstagramPost(igUserId, token, creationId, scheduledUnix) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: token,
      scheduled_publish_time: scheduledUnix
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Instagram scheduling failed');
  return data;
}