/* combo.js - our own suggestion list for text boxes (replaces the browser's built-in <datalist>,
   whose pop-up and scrollbar the browser draws itself and the page cannot style).
   The box stays a normal text box: he can pick a suggestion or type anything else. */
(function () {
  'use strict';

  function attach(input, getItems) {
    var wrap = input.parentNode, box = document.createElement('div'), idx = -1, items = [], picking = false;
    wrap.classList.add('combo-wrap');
    box.className = 'combo-list'; box.hidden = true; box.setAttribute('role', 'listbox');
    wrap.appendChild(box);
    input.removeAttribute('list');
    input.setAttribute('autocomplete', 'off');

    function render() {
      var q = input.value.trim().toLowerCase();
      items = getItems().filter(function (s) { return !q || String(s).toLowerCase().indexOf(q) !== -1; }).slice(0, 60);
      // nothing to suggest, or the text already matches the only suggestion exactly
      if (!items.length || (items.length === 1 && String(items[0]).toLowerCase() === q)) { box.hidden = true; return; }
      box.innerHTML = items.map(function (s, i) {
        return '<div class="combo-item' + (i === idx ? ' on' : '') + '" role="option" data-i="' + i + '">' + esc(s) + '</div>';
      }).join('');
      box.hidden = false;
      var on = box.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function pick(i) {
      picking = true;
      input.value = items[i]; box.hidden = true; idx = -1;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      picking = false;
    }

    input.addEventListener('focus', function () { idx = -1; render(); });
    input.addEventListener('input', function () { if (!picking) { idx = -1; render(); } });
    input.addEventListener('blur', function () { box.hidden = true; });
    input.addEventListener('keydown', function (e) {
      if (box.hidden) { if (e.key === 'ArrowDown') { idx = -1; render(); } return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); render(); }
      else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); pick(idx); }
      else if (e.key === 'Escape') { e.stopPropagation(); box.hidden = true; }
    });
    // mousedown (not click) so the text box keeps focus and the pick lands before blur hides the list
    box.addEventListener('mousedown', function (e) {
      var it = e.target.closest('.combo-item'); if (!it) return;
      e.preventDefault(); pick(Number(it.dataset.i));
    });
  }

  window.Combo = { attach: attach };
})();
