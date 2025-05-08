const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('postCsv');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.style.background = '#f0f0f0';
});
dropZone.addEventListener('dragleave', () => {
  dropZone.style.background = '';
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.style.background = '';
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
  }
});