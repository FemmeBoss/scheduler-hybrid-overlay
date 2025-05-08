import { getToken } from '../core/auth.js';

export async function deleteScheduledPost(postId, pageId) {
  const token = getToken();
  if (!token) throw new Error("❌ Facebook token missing");

  const res = await fetch(`https://graph.facebook.com/${pageId}_${postId}?access_token=${token}`, {
    method: 'DELETE'
  });

  const data = await res.json();
  if (!data.success) throw new Error("❌ Failed to delete scheduled post");
  console.log(`[DEBUG] Deleted scheduled post ${postId}`);
}