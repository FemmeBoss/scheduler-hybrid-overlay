// server.js - Trigger new Render deployment
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
    const sessionId = req.headers['x-session-id'] || req.query.session_id;
    if (sessionId && validateSession(sessionId)) {
        req.sessionId = sessionId;
    }
    next();
});

// Authentication middleware
const checkAuth = (req, res, next) => {
    // Allow access to login page and authentication endpoints
    if (req.path === '/login.html' || 
        req.path === '/api/login' || 
        req.path === '/api/admin/set-token' ||
        req.path === '/style.css') {
        return next();
    }

    const sessionId = req.headers['x-session-id'];
    if (!sessionId || !validateSession(sessionId)) {
        // If requesting HTML page, redirect to login
        if (req.accepts('html')) {
            return res.redirect('/login.html');
        }
        // For API requests, return 401
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// Apply authentication check to all routes
app.use(checkAuth);

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Serve static files after auth check
app.use(express.static(__dirname));

// Auth middleware for protected routes
const requireAuth = (req, res, next) => {
    const sessionId = req.headers['x-session-id'] || req.query.session_id;
    if (!sessionId || !validateSession(sessionId)) {
        return res.redirect('/login.html');
    }
    next();
};

// Basic routes
app.get('/', (req, res) => {
    const sessionId = req.headers['x-session-id'] || req.query.session_id;
    if (sessionId && validateSession(sessionId)) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login.html');
    }
});

// Protected dashboard route
app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/login.html', (req, res) => {
    const sessionId = req.headers['x-session-id'] || req.query.session_id;
    if (sessionId && validateSession(sessionId)) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});

// API routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username);
    console.log('Request body:', req.body);
    
    if (verifyUser(username, password)) {
        console.log('Login successful for:', username);
        const sessionId = createUserSession();
        res.json({ sessionId });
    } else {
        console.log('Login failed for:', username);
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
app.post('/api/admin/set-token', requireAuth, (req, res) => {
    const { token, adminKey } = req.body;
    const validAdminKey = process.env.ADMIN_KEY || 'your-secure-admin-key';
    
    if (adminKey !== validAdminKey) {
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