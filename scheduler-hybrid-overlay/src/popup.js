document.addEventListener('DOMContentLoaded', () => {
  const processBtn = document.getElementById('processBtn');
  
  if (!processBtn) {
    console.warn('⚠️ Process button not found in popup. This is expected if not on the processing page.');
    return;
  }

  console.log('✅ Process button found, initializing click handler');
  
  processBtn.addEventListener('click', async () => {
    try {
      // Your existing process button click handler code
    } catch (error) {
      console.error('❌ Error in process button handler:', error);
    }
  });
});

// Add any other popup.js functionality here 