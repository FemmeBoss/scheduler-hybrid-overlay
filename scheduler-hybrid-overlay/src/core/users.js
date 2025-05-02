// Simple user management
const users = new Map();

// Add a user with username and password
export function addUser(username, password) {
    users.set(username, { password });
}

// Verify user credentials
export function verifyUser(username, password) {
    const user = users.get(username);
    if (!user) return false;
    return user.password === password;
}

// Initialize users
addUser('sarah@femmebosssocial.com', 'Melanie1123!'); 