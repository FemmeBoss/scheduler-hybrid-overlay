console.log("✅ [firebaseTimes.js] loaded");

// 📅 Convert a human-readable date (string) into a Firebase Timestamp (seconds)
export function convertToFirebaseTimestamp(dateString) {
  if (!dateString) {
    console.error("❌ No date string provided to convertToFirebaseTimestamp");
    return null;
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    console.error("❌ Invalid date format:", dateString);
    return null;
  }
  const timestamp = Math.floor(date.getTime() / 1000);
  console.log(`[DEBUG] Converted ${dateString} ➔ ${timestamp}`);
  return timestamp;
}

// 🕰️ Get current server-safe timestamp
export function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

// 🧠 (Optional) Format a Firebase Timestamp into a readable string
export function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return date.toISOString().substring(0, 16); // "YYYY-MM-DDTHH:MM"
}