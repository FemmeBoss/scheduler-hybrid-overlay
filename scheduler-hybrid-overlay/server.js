// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createUserSession, validateSession, getOwnerToken, setOwnerToken } from './src/core/tokenManager.js';
import { verifyUser } from './src/core/users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());

// Session middleware
app.use((req, res, next) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId && validateSession(sessionId)) {
        req.sessionId = sessionId;
    }
    next();
});

// Require authentication for specific routes
const requireAuth = (req, res, next) => {
    if (!req.sessionId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use(express.static(__dirname));

// Basic routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Protected dashboard route
app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Protect all API routes except login
app.use('/api/*', (req, res, next) => {
    if (req.path === '/api/login' || req.path === '/api/admin/set-token') {
        return next();
    }
    if (!req.sessionId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
});

// User login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (verifyUser(username, password)) {
        const sessionId = createUserSession();
        res.json({ sessionId });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Protected route to get Facebook token
app.get('/api/fb-token', requireAuth, (req, res) => {
    const token = getOwnerToken();
    if (!token) {
        return res.status(404).json({ error: 'Token not set' });
    }
    res.json({ token });
});

// Admin endpoint to set the Facebook token
app.post('/api/admin/set-token', (req, res) => {
    const { token, adminKey } = req.body;
    // Use environment variable for admin key
    const validAdminKey = process.env.ADMIN_KEY || 'your-secure-admin-key';
    console.log('Received admin key:', adminKey);
    console.log('Valid admin key:', validAdminKey);
    console.log('Environment ADMIN_KEY:', process.env.ADMIN_KEY);
    if (adminKey !== validAdminKey) {
        console.log('Admin key mismatch!');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    setOwnerToken(token);
    res.json({ success: true });
});

// Facebook OAuth callback route
app.get('/auth/callback', (req, res) => {
    // Redirect back to the main page
    res.redirect('/');
});

// Start the server
app.listen(port, () => {
    console.log(`🌐 Server running on port ${port}`);
});