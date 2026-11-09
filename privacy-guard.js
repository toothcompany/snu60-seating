// Clear sensitive rendered details whenever the main view returns to its locked state.
const welcome = document.getElementById('welcome');
function clearLockedDetails() {
  if (!welcome || welcome.hidden) return;
  for (const id of ['editor', 'historyDialog']) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }
  for (const id of ['editorFields', 'historyList']) document.getElementById(id)?.replaceChildren();
  const title = document.getElementById('editorTitle');
  if (title) title.textContent = '';
  document.querySelectorAll('.ghost').forEach(node => node.remove());
}
if (welcome) new MutationObserver(clearLockedDetails).observe(welcome, { attributes: true, attributeFilter: ['hidden'] });
// Revalidate authorization instead of showing a restored browser back/forward snapshot.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
clearLockedDetails();
