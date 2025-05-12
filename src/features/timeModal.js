export function openTimeModal(pageId, pageName) {
  console.log('[DEBUG] openTimeModal in timeModal.js called with:', { pageId, pageName });
  const modal = document.getElementById('timeModal');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveTimeBtn');

  if (!modal || !title || !saveBtn) {
    console.error("❌ Modal elements missing.");
    return;
  }

  modal.style.display = 'block';
  title.innerText = `Set Times for ${pageName}`;

  saveBtn.onclick = () => {
    const selectedDays = Array.from(document.querySelectorAll('.weekday-checkbox:checked')).map(cb => cb.value);
    const selectedTime = document.getElementById('modalTime').value;
    window.dispatchEvent(new CustomEvent('save-time-settings', {
      detail: { pageId, selectedDays, selectedTime }
    }));
    modal.style.display = 'none';
  };
}

export function closeTimeModal() {
  const modal = document.getElementById('timeModal');
  if (modal) modal.style.display = 'none';
}