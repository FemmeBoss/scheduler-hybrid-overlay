// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const app = express();
const port = process.env.PORT || 7248;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis max retries reached');
        return new Error('Redis max retries reached');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

// Connect to Redis
await redisClient.connect().catch(console.error);

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Log environment variables at startup
console.log('Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  ADMIN_USERNAME_SET: process.env.ADMIN_USERNAME ? 'yes' : 'no',
  ADMIN_PASSWORD_SET: process.env.ADMIN_PASSWORD ? 'yes' : 'no',
  SESSION_SECRET_SET: process.env.SESSION_SECRET ? 'yes' : 'no',
  FACEBOOK_TOKEN_SET: process.env.FACEBOOK_PERMANENT_TOKEN ? 'yes' : 'no',
  REDIS_URL_SET: process.env.REDIS_URL ? 'yes' : 'no'
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('Request origin:', origin);
  
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return res.sendStatus(200);
  }
  
  console.log('CORS headers set:', {
    origin: res.getHeader('Access-Control-Allow-Origin'),
    credentials: res.getHeader('Access-Control-Allow-Credentials'),
    methods: res.getHeader('Access-Control-Allow-Methods')
  });
  
  next();
});

// Session configuration
app.use(session({
  store: new RedisStore({ 
    client: redisClient,
    prefix: 'sess:',
    ttl: 86400 // 24 hours in seconds
  }),
  secret: process.env.SESSION_SECRET || 'femme-boss-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

// Add session debugging middleware
app.use((req, res, next) => {
  console.log('Session state:', {
    id: req.session.id,
    authenticated: req.session.authenticated,
    hasToken: !!req.session.token
  });
  next();
});

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
app.post('/api/login', async (req, res) => {
  console.log('=== Login Request Received ===');
  console.log('Headers:', req.headers);
  console.log('Body:', { ...req.body, password: '****' });
  console.log('Session before:', {
    id: req.session.id,
    authenticated: req.session.authenticated,
    hasToken: !!req.session.token
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
    
    try {
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            reject(err);
          } else {
            console.log('Session saved successfully');
            resolve();
          }
        });
      });
      
      console.log('Session after save:', {
        id: req.session.id,
        authenticated: req.session.authenticated,
        hasToken: !!req.session.token
      });
      
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to save session:', err);
      res.status(500).json({ error: 'Failed to save session' });
    }
  } else {
    console.log('Login failed: Invalid credentials');
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Check authentication middleware
const requireAuth = (req, res, next) => {
  console.log('Auth check:', {
    sessionId: req.session.id,
    authenticated: req.session.authenticated,
    hasToken: !!req.session.token,
    path: req.path
  });
  
  if (req.session.authenticated) {
    next();
  } else {
    console.log('Auth failed, redirecting to login');
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

// Check authentication status
app.get('/api/check-auth', (req, res) => {
  res.json({
    authenticated: req.session.authenticated || false,
    token: req.session.token || null
  });
});

// Serve static files after API routes
app.use(express.static(__dirname));

// Start the server
app.listen(port, () => {
  console.log(`🌐 Server running on port ${port}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});