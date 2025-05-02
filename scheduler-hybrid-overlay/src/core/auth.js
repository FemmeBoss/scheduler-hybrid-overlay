console.log("[DEBUG] Auth Init...");

let sessionId = localStorage.getItem('session_id');

// Simple login form handler
async function handleLogin(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (data.sessionId) {
            sessionId = data.sessionId;
            localStorage.setItem('session_id', sessionId);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Login failed:', error);
        return false;
    }
}

// Get Facebook token from server
async function getFacebookToken() {
    try {
        const response = await fetch('/api/fb-token', {
            headers: {
                'x-session-id': sessionId
            }
        });
        const data = await response.json();
        if (data.token) {
            localStorage.setItem('fb_access_token', data.token);
            return data.token;
        }
        return null;
    } catch (error) {
        console.error('Failed to get Facebook token:', error);
        return null;
    }
}

// Event listener for login form
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (await handleLogin(username, password)) {
        const token = await getFacebookToken();
        if (token) {
            window.dispatchEvent(new CustomEvent('fb-token-ready', { detail: token }));
        }
    }
});

// Define and export the getToken function
export function getToken() {
    return localStorage.getItem('fb_access_token');
}

// Initialize: Try to get token if session exists
if (sessionId) {
    getFacebookToken().then(token => {
        if (token) {
            window.dispatchEvent(new CustomEvent('fb-token-ready', { detail: token }));
        }
    });
}