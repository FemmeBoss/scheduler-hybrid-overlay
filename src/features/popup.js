document.addEventListener("DOMContentLoaded", () => {
  const processBtn = document.getElementById('processBtn');
  if (!processBtn) {
    console.error("❌ processBtn not found");
    return;
  }

  processBtn.addEventListener('click', async () => {
    const imageInput = document.getElementById('imageInput');
    const captionsInput = document.getElementById('captions');
    const datesInput = document.getElementById('dates');
    const postFile = document.getElementById('postCsv')?.files?.[0];

    // Debugging: Check if required inputs exist
    console.log("imageInput:", imageInput, "captionsInput:", captionsInput, "datesInput:", datesInput);

    if (!imageInput || !captionsInput || !datesInput || !postFile) {
      console.error("❌ Required input fields missing.");
      alert("Please make sure you have all the necessary fields filled.");
      return;
    }

    const captions = captionsInput.value.trim().split('\n');
    const dates = datesInput.value.trim().split('\n');
    const imageCount = imageInput.files.length;

    console.log("Number of images:", imageCount);

    if (imageCount === 0 || imageCount > 20) {
      alert("Please upload between 1 and 20 images.");
      return;
    }

    if (captions.length < imageCount || dates.length < imageCount) {
      alert("Please provide a caption and schedule date for each image.");
      return;
    }

    const selectedCheckboxes = document.querySelectorAll('.page-checkbox:checked');
    if (!selectedCheckboxes.length) {
      alert("Please select at least one page to proceed.");
      return;
    }

    console.log("Selected Pages:", selectedCheckboxes);

    const urls = [];
    const previewContainer = document.getElementById('previewContainer');
    previewContainer.innerHTML = ''; // Clear previous previews

    // 🖼️ Upload images and create previews
    for (let i = 0; i < imageCount; i++) {
      const file = imageInput.files[i];
      const filename = `img_${Date.now()}_${i}.jpg`;

      try {
        console.log(`Uploading image ${i + 1} with filename: ${filename}`);
        const url = await uploadImageToFirebase(file, filename);
        urls.push(url);

        // Create preview card
        const img = document.createElement('img');
        img.src = url;
        img.style = 'max-width: 100%; border-radius: 8px; margin-bottom: 10px;';

        const meta = document.createElement('p');
        meta.innerHTML = `<strong>Image ${i + 1}</strong><br>${captions[i]}<br>📅 ${dates[i]}`;

        const card = document.createElement('div');
        card.className = 'preview-card';
        card.appendChild(img);
        card.appendChild(meta);
        previewContainer.appendChild(card);

      } catch (err) {
        console.error(`🔥 Upload failed for image #${i + 1}:`, err.message);
        alert(`🔥 Upload failed for image #${i + 1}: ${err.message}`);
        return;
      }
    }

    // 🛠️ Generate CSV after all uploads
    let csvContent = "Image URL,Caption,Schedule Date\n";
    for (let i = 0; i < imageCount; i++) {
      const caption = `"${captions[i].replace(/"/g, '""')}"`;

      // 🧠 FIX: Normalize date format to ISO8601 to ensure proper scheduling
      let iso;
      try {
        iso = new Date(dates[i]).toISOString().slice(0, 16);
      } catch {
        alert(`Invalid date format for image ${i + 1}.`);
        return;
      }

      const date = `"${iso}"`;
      csvContent += `${urls[i]},${caption},${date}\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv" });
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = "schedule.csv";
    document.body.appendChild(downloadLink); // Safari fix
    downloadLink.click();
    document.body.removeChild(downloadLink);

    console.log("✅ CSV file generated and downloaded");
  });
});