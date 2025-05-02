export function getCurrentFormattedTime() {
  const now = new Date();
  return now.toISOString().slice(0, 16); // Example: 2025-04-27T15:30
}