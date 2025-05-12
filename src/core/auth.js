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
window.addEventListener('load', async () => {
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

    try {
      // Fetch pages immediately after getting token
      const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account&limit=100&access_token=${accessToken}`);
      const data = await response.json();
      
      if (data.error) {
        console.error("[DEBUG] Error fetching pages:", data.error);
        return;
      }

      console.log("[DEBUG] Pages fetched successfully:", data.data.length);
      
      // Store pages in localStorage for persistence
      localStorage.setItem('fb_pages', JSON.stringify(data.data));
      
      // Dispatch event for page data ready
      window.dispatchEvent(new CustomEvent('fb-pages-ready', { detail: data.data }));
      
      // Redirect to main page after successful login
      window.location.href = '/';
    } catch (err) {
      console.error("[DEBUG] Error fetching pages:", err);
    }
  } else {
    const token = localStorage.getItem('fb_access_token');
    if (token) {
      console.log("[DEBUG] Token loaded from storage.");
      if (resultsEl) resultsEl.innerHTML = `✅ Token Loaded from Storage`;
      
      try {
        // Fetch pages with stored token
        const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account&limit=100&access_token=${token}`);
        const data = await response.json();
        
        if (data.error) {
          console.error("[DEBUG] Error fetching pages:", data.error);
          return;
        }

        console.log("[DEBUG] Pages fetched successfully:", data.data.length);
        
        // Store pages in localStorage for persistence
        localStorage.setItem('fb_pages', JSON.stringify(data.data));
        
        // Dispatch event for page data ready
        window.dispatchEvent(new CustomEvent('fb-pages-ready', { detail: data.data }));
      } catch (err) {
        console.error("[DEBUG] Error fetching pages:", err);
      }
    }
  }
});

// Define and export the getToken function
export async function getToken() {
  try {
    console.log("[DEBUG] Checking authentication status...");
    const res = await fetch('/api/check-auth', {
      credentials: 'include' // Important: include credentials
    });
    const data = await res.json();
    console.log("[DEBUG] Auth check response:", data);
    
    if (data.authenticated && data.token) {
      console.log("[DEBUG] User is authenticated with token");
      return data.token;
    } else {
      console.log("[DEBUG] User is not authenticated");
      // Redirect to login if not authenticated
      if (window.location.pathname !== '/login.html') {
        window.location.href = '/login.html';
      }
    }
  } catch (err) {
    console.error("[DEBUG] Error checking authentication:", err);
    // Redirect to login on error
    if (window.location.pathname !== '/login.html') {
      window.location.href = '/login.html';
    }
  }
  return null;
}

// Add a function to check authentication status
export async function checkAuth() {
  try {
    const res = await fetch('/api/check-auth', {
      credentials: 'include'
    });
    const data = await res.json();
    console.log("[DEBUG] Auth check response:", data);
    return data.authenticated;
  } catch (err) {
    console.error("[DEBUG] Error checking auth status:", err);
    return false;
  }
}

// Add event listener for token ready
window.addEventListener('fb-token-ready', async (e) => {
  console.log("[DEBUG] Facebook token ready event received");
  const token = e.detail;
  if (token) {
    try {
      // Fetch pages using the token
      const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account&limit=100&access_token=${token}`);
      const data = await response.json();
      
      if (data.error) {
        console.error("[DEBUG] Error fetching pages:", data.error);
        return;
      }

      console.log("[DEBUG] Pages fetched successfully:", data.data.length);
      
      // Store pages in localStorage for persistence
      localStorage.setItem('fb_pages', JSON.stringify(data.data));
      
      // Dispatch event for page data ready
      window.dispatchEvent(new CustomEvent('fb-pages-ready', { detail: data.data }));
    } catch (err) {
      console.error("[DEBUG] Error fetching pages:", err);
    }
  }
});