// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createUserSession, validateSession, getOwnerToken, setOwnerToken } from './src/core/tokenManager.js';

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Serve static files from public directory with explicit path
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.svg')) {
            res.set('Content-Type', 'image/svg+xml');
        }
    }
}));

// Serve other static files
app.use(express.static(__dirname));

// Basic route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// User login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Add your own authentication logic here
    // For now, we'll accept any login
    const sessionId = createUserSession();
    res.json({ sessionId });
});

// Facebook token endpoints
app.get('/api/fb-token', (req, res) => {
    if (!req.sessionId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
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