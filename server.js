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

// Middleware
app.use(express.json());
app.use(express.static(__dirname));
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
} catch (error) {
  console.error('Error loading secrets:', error);
  process.exit(1);
}

// Login route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === secrets.username && password === secrets.password) {
    req.session.authenticated = true;
    req.session.token = secrets.permanentToken;
    res.json({ success: true });
  } else {
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

// Start the server
app.listen(port, () => {
  console.log(`🌐 Server running on port ${port}`);
});