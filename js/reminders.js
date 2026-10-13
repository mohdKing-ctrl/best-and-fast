/* reminders.js - payment reminders (تذكيرات الدفع).
   When a customer pays later, the bill gets a reminder DATE (e.g. after 3 days). On that day - and every day after, until the
   bill is paid - the system shows a pop-up with the customer's name and the amount still owed, with a button that opens
   WhatsApp with a polite payment reminder already written. Pressing it also moves the next reminder forward, so the same
   customer is not shown again and again.
   The check runs when the system opens, when he comes back to the tab, and every few minutes (so it also works across midnight).
   The pop-up is not shown to the view-only support account. */
(function () {
  'use strict';

  var seen = {};               // "invoiceId:date" the pop-up already showed in this session
  var timer = null;
  var setId = null;            // the bill being given a reminder date
  var filter = 'all';
  var WA = '<svg viewBox="0 0 24 24"><use href="#i-wa"/></svg>';

  function t(k, v) { return I18N.t(k, v); }
  function S() { return Store.s; }
  function owes(i) { return !i.void && Calc.balance(i) > 0.0004; }
  function unpaid() { return S().invoices.filter(owes); }
  function dayNum(s) { return Math.round(Date.parse(s + 'T00:00:00Z') / 864e5); }
  function state(i) {
    if (!i.remindOn) return 'none';
    if (i.remindOn < ymd()) return 'overdue';
    return i.remindOn === ymd() ? 'today' : 'upcoming';
  }
  function isDue(i) { var s = state(i); return s === 'overdue' || s === 'today'; }
  function daysLate(i) { return dayNum(ymd()) - dayNum(i.remindOn); }
  function dueList() {
    return unpaid().filter(isDue).sort(function (a, b) { return a.remindOn < b.remindOn ? -1 : a.remindOn > b.remindOn ? 1 : a.no - b.no; });
  }
  function whenChip(i) {
    var s = state(i);
    if (s === 'overdue') return '<span class="chip c-bad">' + esc(t('rm_overdue', { n: daysLate(i) })) + '</span>';
    if (s === 'today') return '<span class="chip c-warn">' + esc(t('rm_today')) + '</span>';
    if (s === 'upcoming') return '<span class="chip c-info">' + esc(t('rm_in', { n: -daysLate(i) })) + '</span>';
    return '<span class="chip c-mut">' + esc(t('rm_none')) + '</span>';
  }
  function phoneOf(i) {
    var c = i.customerId ? Store.customerById(i.customerId) : null;
    return i.customerPhone || (c && c.phone) || '';
  }

  /* ------------------------------------------------ the red number in the menu */
  function badge() {
    var n = Store.canWrite() ? dueList().length : 0;
    var b = $('navRem'); if (!b) return;
    b.textContent = n; b.style.display = n ? '' : 'none';
  }

  /* ------------------------------------------------ the page: everybody who still owes money */
  function stat(ic, cls, l, v) {
    return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="l">' + esc(l) + '</div><div class="v num">' + v + '</div></div></div>';
  }
  function render() {
    var all = unpaid(), due = all.filter(isDue), up = all.filter(function (i) { return state(i) === 'upcoming'; }), none = all.filter(function (i) { return !i.remindOn; });
    var owed = 0; all.forEach(function (i) { owed += Calc.balance(i); });
    $('rmStats').innerHTML =
      stat('&#9200;', 'c-bad', t('rm_s_due'), due.length) +
      stat('&#128197;', 'c-info', t('rm_s_up'), up.length) +
      stat('&#128683;', 'c-gold', t('rm_s_none'), none.length) +
      stat('&#8987;', 'c-brand', t('rm_s_amount'), f3(owed) + ' <small>' + esc(t('omr')) + '</small>');
    document.querySelectorAll('#rmFilters button').forEach(function (b) { b.classList.toggle('active', b.dataset.f === filter); });
    var list = all.filter(function (i) {
      if (filter === 'due') return isDue(i);
      if (filter === 'up') return state(i) === 'upcoming';
      if (filter === 'none') return !i.remindOn;
      return true;
    }).sort(function (a, b) {                     // due first (oldest first), then upcoming, then the ones without a reminder
      var ra = isDue(a) ? 0 : a.remindOn ? 1 : 2, rb = isDue(b) ? 0 : b.remindOn ? 1 : 2;
      return ra - rb || (a.remindOn < b.remindOn ? -1 : a.remindOn > b.remindOn ? 1 : 0) || a.no - b.no;
    });
    badge();
    if (!list.length) {
      $('rmBody').innerHTML = '<tr><td colspan="7"><div class="blank"><span class="em">&#9989;</span><b>' + esc(t('no_reminders')) + '</b><small>' + esc(t('no_reminders_s')) + '</small></div></td></tr>';
      return;
    }
    var canWrite = Store.canWrite();
    $('rmBody').innerHTML = list.map(function (i) {
      return '<tr class="click" data-id="' + esc(i.id) + '">' +
        '<td data-l="' + esc(t('customer')) + '"><b>' + esc(i.customerName) + '</b>' + (phoneOf(i) ? '<div class="mini"><span class="ltr">' + esc(phoneOf(i)) + '</span></div>' : '') + '</td>' +
        '<td data-l="' + esc(t('invoice_no')) + '"><b class="ltr">' + esc(i.number) + '</b><div class="mini">' + fdate(i.date) + '</div></td>' +
        '<td class="money num" data-l="' + esc(t('balance')) + '" style="color:var(--bad)">' + f3(Calc.balance(i)) + '</td>' +
        '<td data-l="' + esc(t('remind_on')) + '">' + (i.remindOn ? fdate(i.remindOn) + ' ' : '') + whenChip(i) + (i.remindNote ? '<div class="mini">' + esc(i.remindNote) + '</div>' : '') + '</td>' +
        '<td data-l="' + esc(t('rm_last')) + '">' + (i.lastReminded ? fdate(i.lastReminded) : '-') + '</td>' +
        '<td data-l=""><div class="acts">' +
          '<button class="iconbtn wa" data-rwa="' + esc(i.id) + '" title="' + esc(t('rm_whatsapp')) + '">' + WA + '</button>' +
          (canWrite ? '<button class="iconbtn" data-rset="' + esc(i.id) + '" title="' + esc(t(i.remindOn ? 'remind_change' : 'remind_set')) + '">&#9200;</button>' : '') +
        '</div></td></tr>';
    }).join('');
  }

  /* ------------------------------------------------ the pop-up */
  function popupBox(list) {
    var shown = list.slice(0, 6);
    return '<h3>&#9200; ' + esc(t('rm_title')) + '</h3>' +
      '<div class="msub">' + esc(t('rm_sub', { n: list.length })) + '</div>' +
      '<div class="rmlist">' + shown.map(function (i) {
        return '<div class="rmcard" data-id="' + esc(i.id) + '">' +
          '<div class="rmtop"><b>' + esc(i.customerName) + '</b>' + whenChip(i) + '</div>' +
          '<div class="mini"><span class="ltr">' + esc(i.number) + '</span> &middot; ' + esc(t('balance')) + ': <b style="color:var(--bad)">' + f3(Calc.balance(i)) + ' ' + esc(t('omr')) + '</b>' +
            (i.lastReminded ? ' &middot; ' + esc(t('rm_last')) + ': ' + fdate(i.lastReminded) : '') + '</div>' +
          (i.remindNote ? '<div class="mini">' + esc(i.remindNote) + '</div>' : '') +
          '<div class="rmact"><button type="button" class="btn b-wa" data-rwa="' + esc(i.id) + '">' + WA + ' ' + esc(t('rm_whatsapp')) + '</button>' +
            '<button type="button" class="btn b-soft" data-rset="' + esc(i.id) + '">' + esc(t('rm_later')) + '</button>' +
            '<button type="button" class="btn b-soft" data-rbill="' + esc(i.id) + '">' + esc(t('rm_open_bill')) + '</button></div></div>';
      }).join('') + '</div>' +
      (list.length > shown.length ? '<div class="mini" style="margin-top:8px">' + esc(t('rm_more', { n: list.length - shown.length })) + '</div>' : '') +
      '<div class="duo" style="margin-top:14px"><button type="button" class="btn b-main" style="margin-top:0" data-rpage>' + esc(t('rm_open_page')) + '</button>' +
        '<button type="button" class="btn b-soft" data-close>' + esc(t('close')) + '</button></div>';
  }
  function renderPopup() {
    var list = dueList();
    if (!list.length) { $('rmModal').hidden = true; return; }
    $('rmBox').innerHTML = popupBox(list);
    list.forEach(function (i) { seen[i.id + ':' + i.remindOn] = true; });          // shown once: not forced on him again until something new is due
  }
  /* Show the pop-up if something is due that it has not shown yet in this session. */
  function check() {
    if (!Store.s.user || !Store.canWrite() || !$('gate').hidden) return;
    badge();
    var list = dueList();
    var fresh = list.some(function (i) { return !seen[i.id + ':' + i.remindOn]; });
    if (!fresh || !$('rmModal').hidden) return;
    // never in the middle of another window (a bill being sent, a payment being taken ...): the next check tries again
    if (document.querySelector('.modal:not([hidden])')) return;
    renderPopup(); $('rmModal').hidden = false;
  }
  function startChecks() {
    setTimeout(check, 700);
    if (!timer) timer = setInterval(check, 5 * 60 * 1000);
  }

  /* ------------------------------------------------ set / move / remove a reminder */
  function openSet(id) {
    var i = Store.invoiceById(id); if (!i) return;
    setId = id;
    $('rsTitle').textContent = t('remind_for', { name: i.customerName });
    $('rsSub').textContent = i.number + ' - ' + t('balance') + ': ' + f3(Calc.balance(i)) + ' ' + t('omr');
    $('rsDate').value = i.remindOn || ymd(addDays(Number(S().settings.remindDays) || 3));
    $('rsDate').min = ymd(); $('rsNote').value = i.remindNote || ''; $('rsErr').textContent = '';
    $('rsRemove').style.display = i.remindOn ? '' : 'none';
    App.openModal('rmSetModal');
  }
  function saveSet(clear) {
    var i = Store.invoiceById(setId); if (!i) return;
    var d = clear ? '' : $('rsDate').value;
    if (!clear && !d) { $('rsErr').textContent = t('err_date'); return; }
    var copy = JSON.parse(JSON.stringify(i));
    copy.remindOn = d; copy.remindNote = clear ? '' : $('rsNote').value.trim();
    Store.updateInvoice(copy).then(function () {
      App.closeModal('rmSetModal');
      toast(clear ? t('remind_removed') : t('remind_saved', { d: fdate(d) }));
      afterChange(i.id);
    }).catch(function (e) { $('rsErr').textContent = App.errText(e); });
  }
  function afterChange(id) {
    badge(); render();
    if (!$('rmModal').hidden) renderPopup();
    if (window.Invoices) { Invoices.refresh(); if (!$('ivModal').hidden) Invoices.openDetail(id); }
    App.updateBadge();
  }

  /* After a reminder was sent: remember it, and move the next reminder forward so he is not nagged every day. */
  function markSent(inv) {
    var i = Store.invoiceById(inv.id); if (!i || !Store.canWrite()) return;
    var n = Number(S().settings.remindDays) || 0;
    var copy = JSON.parse(JSON.stringify(i));
    copy.lastReminded = ymd(); copy.remindOn = n > 0 ? ymd(addDays(n)) : '';
    Store.updateInvoice(copy).then(function () {
      if (copy.remindOn) toast(t('remind_next', { d: fdate(copy.remindOn) }));
      afterChange(i.id);
    }).catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  function sendReminder(id) {
    var i = Store.invoiceById(id); if (!i) return;
    Whatsapp.open(i, { reminder: true });
  }

  function init() {
    $('rmFilters').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { filter = b.dataset.f; render(); } });
    $('rmBody').addEventListener('click', function (e) {
      var w = e.target.closest('[data-rwa]'); if (w) { sendReminder(w.dataset.rwa); return; }
      var s = e.target.closest('[data-rset]'); if (s) { openSet(s.dataset.rset); return; }
      var r = e.target.closest('tr[data-id]'); if (r) { App.show('invoices'); Invoices.openDetail(r.dataset.id); }
    });
    $('rmBox').addEventListener('click', function (e) {
      var w = e.target.closest('[data-rwa]'); if (w) { sendReminder(w.dataset.rwa); return; }
      var s = e.target.closest('[data-rset]'); if (s) { openSet(s.dataset.rset); return; }
      var b = e.target.closest('[data-rbill]'); if (b) { $('rmModal').hidden = true; App.show('invoices'); Invoices.openDetail(b.dataset.rbill); return; }
      if (e.target.closest('[data-rpage]')) { $('rmModal').hidden = true; App.show('reminders'); }
    });
    $('rsQuick').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      $('rsDate').value = ymd(addDays(Number(b.dataset.d)));
    });
    $('rsSave').addEventListener('click', function () { saveSet(false); });
    $('rsRemove').addEventListener('click', function () { saveSet(true); });
  }

  window.Reminders = { init: init, refresh: render, check: check, startChecks: startChecks, badge: badge, openSet: openSet, markSent: markSent,
    state: state, isDue: isDue, whenChip: whenChip };
})();
