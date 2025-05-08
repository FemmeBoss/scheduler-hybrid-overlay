// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import session from 'express-session';

const app = express();
const port = process.env.PORT || 7248;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log environment variables at startup
console.log('Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  ADMIN_USERNAME_SET: process.env.ADMIN_USERNAME ? 'yes' : 'no',
  ADMIN_PASSWORD_SET: process.env.ADMIN_PASSWORD ? 'yes' : 'no',
  SESSION_SECRET_SET: process.env.SESSION_SECRET ? 'yes' : 'no',
  FACEBOOK_TOKEN_SET: process.env.FACEBOOK_PERMANENT_TOKEN ? 'yes' : 'no'
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'femme-boss-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Read secrets from environment variables or secrets.json
let secrets;
try {
  if (process.env.NODE_ENV === 'production') {
    secrets = {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
      permanentToken: process.env.FACEBOOK_PERMANENT_TOKEN
    };
  } else {
    secrets = JSON.parse(fs.readFileSync('secrets.json', 'utf8'));
  }
  // Log loaded secrets (without showing actual values)
  console.log('Secrets loaded:', {
    username: secrets.username ? 'set' : 'not set',
    password: secrets.password ? 'set' : 'not set',
    permanentToken: secrets.permanentToken ? 'set' : 'not set'
  });
} catch (error) {
  console.error('Error loading secrets:', error);
  process.exit(1);
}

// API Routes
app.post('/api/login', (req, res) => {
  console.log('Login attempt received:', {
    body: req.body,
    headers: req.headers,
    session: req.session
  });
  
  const { username, password } = req.body;
  
  if (!username || !password) {
    console.log('Login failed: Missing credentials');
    return res.status(401).json({ error: 'Username and password are required' });
  }
  
  console.log('Comparing credentials:', {
    receivedUsername: username,
    receivedPassword: password ? '****' : undefined,
    expectedUsername: secrets.username,
    expectedPassword: secrets.password ? '****' : undefined
  });
  
  if (username === secrets.username && password === secrets.password) {
    console.log('Login successful for user:', username);
    req.session.authenticated = true;
    req.session.token = secrets.permanentToken;
    res.json({ success: true });
  } else {
    console.log('Login failed: Invalid credentials');
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Check authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login.html');
  }
};

// Protected routes
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Get Facebook pages route
app.get('/api/facebook-pages', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${req.session.token}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Facebook pages' });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Serve static files after API routes
app.use(express.static(__dirname));

// Start the server
app.listen(port, () => {
  console.log(`🌐 Server running on port ${port}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});