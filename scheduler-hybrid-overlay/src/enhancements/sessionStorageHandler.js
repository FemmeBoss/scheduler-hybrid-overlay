export function savePageSelections() {
  const selected = Array.from(document.querySelectorAll('input[data-role="page-checkbox"]:checked'))
    .map(cb => cb.dataset.id);
  sessionStorage.setItem('selectedPages', JSON.stringify(selected));
}

export function restorePageSelections() {
  const selected = JSON.parse(sessionStorage.getItem('selectedPages') || '[]');
  document.querySelectorAll('input[data-role="page-checkbox"]').forEach(cb => {
    if (selected.includes(cb.dataset.id)) {
      cb.checked = true;
    }
  });
}