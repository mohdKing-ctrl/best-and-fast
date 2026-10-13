/* demo-mode.js - the "Reset demo" button: forget everything this visitor added and start from the examples again. */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('btnResetDemo').addEventListener('click', function () {
    if (!confirm(I18N.t('demo_reset_confirm'))) return;
    try { localStorage.removeItem('bf_pos_demo_db_v3'); localStorage.removeItem('bf_pos_demo_db_v2'); localStorage.removeItem('bf_pos_demo_db_v1'); } catch (e) { /* private window: nothing stored anyway */ }
    location.reload();
  });
});
