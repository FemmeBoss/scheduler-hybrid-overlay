export async function retry(fn, retries = 3, delay = 500) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    console.warn(`⚠️ Retry failed. ${retries} attempts left. Waiting ${delay}ms...`);
    await new Promise(res => setTimeout(res, delay));
    return retry(fn, retries - 1, delay * 2); // Exponential backoff
  }
}