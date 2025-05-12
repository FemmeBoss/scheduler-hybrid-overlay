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
let redisClient;
let sessionStore;

// Redis connection configuration
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      console.log(`Redis connection attempt ${retries}`);
      if (retries > 10) {
        console.error('Redis max retries reached');
        return false;
      }
      return Math.min(retries * 100, 3000);
    }
  }
};

// Connect to Redis with retry logic
const connectToRedis = async () => {
  try {
    if (!process.env.REDIS_URL) {
      console.warn('REDIS_URL not set - using default localhost URL');
    }

    redisClient = createClient(redisConfig);
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis Client Reconnecting');
    });

    await redisClient.connect();
    console.log('Connected to Redis successfully');
    
    // Test Redis connection
    await redisClient.ping();
    console.log('Redis ping successful');
    
    return true;
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    return false;
  }
};

// Initialize session store
const initializeSessionStore = async () => {
  const redisConnected = await connectToRedis();
  
  if (redisConnected) {
    sessionStore = new RedisStore({ 
      client: redisClient,
      prefix: 'sess:',
      ttl: 86400 // 24 hours in seconds
    });
    console.log('Using RedisStore for sessions');
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn('Redis connection failed in production environment - using MemoryStore temporarily');
      console.warn('Please set REDIS_URL environment variable for production use');
      sessionStore = new session.MemoryStore();
    } else {
      console.log('Using MemoryStore (development mode)');
      sessionStore = new session.MemoryStore();
    }
  }
};

// Initialize session store before starting server
await initializeSessionStore();

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

// ⭐ Trust Render/Cloudflare proxy for secure cookies
app.set('trust proxy', 1);

// Session configuration - MUST be before any middleware that uses session
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'femme-boss-secret-key',
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something stored
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
    path: '/'
  },
  name: 'connect.sid' // Explicitly set session cookie name
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// CORS middleware
app.use((req, res, next) => {
  console.log('Request origin:', req.headers.origin || '*');
  
  // Set CORS headers based on origin
  const allowedOrigins = [
    'https://femme-boss-social-scheduler.onrender.com',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  console.log('CORS headers set:', {
    origin: res.getHeader('Access-Control-Allow-Origin'),
    credentials: res.getHeader('Access-Control-Allow-Credentials'),
    methods: res.getHeader('Access-Control-Allow-Methods')
  });

  // Log session state
  if (req.session) {
    console.log('Session state:', {
      id: req.sessionID,
      authenticated: req.session.authenticated,
      hasToken: !!req.session.token,
      cookie: req.session.cookie,
      headers: req.headers.cookie
    });
  }

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
  
  if (req.session) {
    console.log('Session before:', {
      id: req.sessionID,
      authenticated: req.session.authenticated,
      hasToken: !!req.session.token,
      cookie: req.session.cookie,
      headers: req.headers.cookie
    });
  }
  
  const { username, password } = req.body;
  
  if (!username || !password) {
    console.log('Login failed: Missing credentials');
    return res.status(401).json({ error: 'Username and password are required' });
  }
  
  console.log('Comparing credentials:', {
    receivedUsername: username,
    receivedPassword: '****',
    expectedUsername: process.env.ADMIN_USERNAME,
    expectedPassword: '****'
  });
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    console.log('Login successful for user:', username);
    
    // Set session data
    req.session.authenticated = true;
    req.session.token = 'admin-token';
    
    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }
      
      console.log('Session saved successfully');
      if (req.session) {
        console.log('Session after save:', {
          id: req.sessionID,
          authenticated: req.session.authenticated,
          hasToken: !!req.session.token,
          cookie: req.session.cookie,
          headers: req.headers.cookie
        });
      }
      
      res.json({ success: true });
    });
  } else {
    console.log('Login failed: Invalid credentials');
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Check authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session) {
    console.log('No session found');
    return res.redirect('/login.html');
  }

  console.log('Auth check:', {
    sessionId: req.sessionID,
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
  if (!req.session) {
    return res.json({ authenticated: false, token: null });
  }
  
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