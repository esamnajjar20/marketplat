window.addEventListener('error', function(e) {
  if (e.message && e.message.includes('ChunkLoadError')) {
    console.warn('ChunkLoadError detected. Reloading page...');
    window.location.reload();
  }
});
window.addEventListener('unhandledrejection', function(e) {
  if (e.reason && e.reason.name === 'ChunkLoadError') {
    console.warn('Unhandled ChunkLoadError detected. Reloading page...');
    window.location.reload();
  }
});
