// Token storage and management
let ownerToken = null;

export function setOwnerToken(token) {
    ownerToken = token;
}

export function getOwnerToken() {
    return ownerToken;
}

// Simple user session management
const userSessions = new Map();

export function createUserSession() {
    const sessionId = Math.random().toString(36).substring(2);
    userSessions.set(sessionId, { createdAt: new Date() });
    return sessionId;
}

export function validateSession(sessionId) {
    return userSessions.has(sessionId);
}

export function removeSession(sessionId) {
    userSessions.delete(sessionId);
} 