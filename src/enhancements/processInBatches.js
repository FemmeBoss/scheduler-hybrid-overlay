const CONCURRENCY_LIMIT = 5; // Adjust if needed (5 at a time is safe)

export async function processInBatches(tasks, limit = CONCURRENCY_LIMIT) {
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');

  let completed = 0;
  const total = tasks.length;

  progressContainer.style.display = 'block';
  progressBar.value = 0;
  progressBar.max = total;
  progressLabel.innerText = '0%';

  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = Promise.resolve().then(async () => {
      try {
        await task();
      } finally {
        completed++;
        progressBar.value = completed;
        const percent = Math.floor((completed / total) * 100);
        progressLabel.innerText = `${percent}%`;
      }
    });

    results.push(p);

    if (limit <= tasks.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  await Promise.all(results);
  progressContainer.style.display = 'none';
}