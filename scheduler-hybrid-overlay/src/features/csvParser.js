export async function parseCsv(file) {
  try {
    const text = await file.text();
    console.log('📄 CSV Content:', text); // Debug log

    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    console.log('📋 CSV Headers:', headers); // Debug log
    
    const posts = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, i) => row[h] = values[i]);
      
      // Parse the date string properly
      let scheduleDate;
      try {
        const dateStr = row['Schedule Date'] || row.scheduleDate;
        if (dateStr) {
          // Parse the date string into a Date object
          scheduleDate = new Date(dateStr);
          // Validate the date
          if (isNaN(scheduleDate.getTime())) {
            throw new Error('Invalid date format');
          }
        } else {
          scheduleDate = new Date();
        }
      } catch (error) {
        console.warn('⚠️ Invalid date format, using current date:', error);
        scheduleDate = new Date();
      }
      
      const post = {
        imageUrl: row['Image URL'] || row.imageUrl || '',
        caption: row['Caption'] || row.caption || '',
        scheduleDate: scheduleDate.toISOString(),
        mediaFile: null // Will be populated later if needed
      };

      console.log('📝 Parsed Post:', post); // Debug log
      return post;
    });

    return posts;
  } catch (error) {
    console.error('❌ Error parsing CSV:', error);
    throw new Error('Failed to parse CSV file: ' + error.message);
  }
}