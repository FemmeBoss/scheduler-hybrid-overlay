export function saveUserTimeSetting(timezone) {
  localStorage.setItem('user_timezone', timezone);
  console.log(`[DEBUG] Saved timezone: ${timezone}`);
}

export function getUserTimeSetting() {
  return localStorage.getItem('user_timezone') || 'UTC';
}