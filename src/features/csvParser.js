export async function parseCsv(file) {
  const text = await file.text();
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => row[h] = values[i]);
    return row;
  });

  return rows.map(r => ({
    imageUrl: r['Image URL'] || r.imageUrl || '',
    caption: r['Caption'] || r.caption || '',
    scheduleDate: r['Schedule Date'] || r.scheduleDate || ''
  }));
}

window.parseCsv = parseCsv;