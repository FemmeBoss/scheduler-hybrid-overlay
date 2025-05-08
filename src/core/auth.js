console.log("[DEBUG] Auth Init...");

const appId = '1198964715071787'; // ✅ Your real App ID
const redirectUri = 'https://femme-boss-social-scheduler.onrender.com/'; // ✅ Your NGROK

// Event listener for login button to initiate OAuth flow
document.getElementById('loginBtn')?.addEventListener('click', () => {
  const scopes = [
    'public_profile',
    'email',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_read_user_content',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
    'business_management',
    'ads_management'
  ].join(',');

  const oauthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&auth_type=rerequest&scope=${scopes}`;
  window.location.href = oauthUrl;
});

// Handling the token acquisition after the redirect
window.addEventListener('load', () => {
  const resultsEl = document.getElementById('results');

  if (window.location.hash.includes('access_token')) {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    console.log("[DEBUG] Token stored:", accessToken);
    localStorage.setItem('fb_access_token', accessToken);

    if (resultsEl) {
      resultsEl.innerHTML = `✅ Access Token Acquired`;
    }

    window.dispatchEvent(new CustomEvent('fb-token-ready', { detail: accessToken }));
  } else {
    const token = localStorage.getItem('fb_access_token');
    if (token) {
      console.log("[DEBUG] Token loaded from storage.");
      if (resultsEl) resultsEl.innerHTML = `✅ Token Loaded from Storage`;
      window.dispatchEvent(new CustomEvent('fb-token-ready', { detail: token }));
    }
  }
});

// Define and export the getToken function
export function getToken() {
  // First check localStorage for OAuth token
  const oauthToken = localStorage.getItem('fb_access_token');
  if (oauthToken) {
    return oauthToken;
  }

  // If no OAuth token, check if we're authenticated with permanent token
  fetch('/api/check-auth')
    .then(res => res.json())
    .then(data => {
      if (data.authenticated && data.token) {
        console.log("[INFO] Using permanent token from session");
        return data.token;
      }
    })
    .catch(err => console.log("[INFO] No permanent token found"));

  console.log("[INFO] No Facebook token found");
  return null;
}