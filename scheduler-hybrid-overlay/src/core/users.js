import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, '../../data/users.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return verifyHash === hash;
}

export function verifyUser(username, password) {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users[username];
        if (!user) return false;
        return verifyPassword(password, user.hash, user.salt);
    } catch (error) {
        console.error('Error verifying user:', error);
        return false;
    }
}

export function updateUserPassword(username, newPassword) {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const { hash, salt } = hashPassword(newPassword);
        users[username] = { hash, salt };
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error updating password:', error);
        throw error;
    }
}

export function getUserFromSession(sessionId) {
    // This should be implemented to return the username associated with the session
    // For now, returning a default value for the example
    return 'sarah@femmebosssocial.com';
}

// Initialize with default user if not exists
try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (!Object.keys(users).length) {
        const { hash, salt } = hashPassword('Melanie1123!');
        users['sarah@femmebosssocial.com'] = { hash, salt };
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
} catch (error) {
    console.error('Error initializing users:', error);
} 