console.log('[OFFLINE HANDLER] ✅ Loaded. No active offline upload syncing.');

window.addEventListener('online', () => {
  console.log('🌐 Back Online — No pending uploads to sync.');
});

window.addEventListener('offline', () => {
  console.log('📴 Offline Mode Detected — Features may be limited.');
  const badge = document.getElementById('offlineBadge');
  if (badge) {
    badge.style.display = 'block';
  }
});