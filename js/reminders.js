/* reminders.js - reminders (التذكيرات): two kinds.
   1) PAYMENT reminders (تذكيرات الدفع). When a customer pays later, the bill gets a reminder DATE (e.g. after 3 days). On that day -
      and every day after, until the bill is paid - the system shows a pop-up with the customer's name and the amount still owed,
      with a button that opens WhatsApp with a polite payment reminder already written. Pressing it also moves the next reminder
      forward, so the same customer is not shown again and again.
   2) PERSONAL reminders (تذكير عام): the owner's own notes to himself, not tied to any bill (call the paint supplier, renew the
      licence ...). A title, a day, an optional time of day. They show in the same pop-up when they are due, with Done / Later.
   The check runs when the system opens, when he comes back to the tab, and every minute (so it also works across midnight and
   for the time of day). The pop-up is not shown to the view-only support account; personal reminders belong to the owner only. */
(function () {
  'use strict';

  var seen = {};               // "invoiceId:date" / "m:id:date:time" the pop-up already showed in this session
  var timer = null;
  var setId = null;            // the bill being given a reminder date
  var memoId = null;           // the personal reminder being edited ('' = a new one)
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

  /* ---- personal reminders ---- */
  function memoOn() { return Store.isAdmin(); }                       // workers never receive them (the server does not send them)
  function memoDue(m) { return !m.done && (m.date < ymd() || (m.date === ymd() && (!m.time || m.time <= hm()))); }
  function memoDueList() { return memoOn() ? S().memos.filter(memoDue).sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; }) : []; }
  function memoKey(m) { return 'm:' + m.id + ':' + m.date + ':' + m.time; }
  function memoChip(m) {
    if (m.done) return '<span class="chip c-ok">' + esc(t('memo_done')) + '</span>';
    if (m.date < ymd()) return '<span class="chip c-bad">' + esc(t('rm_overdue', { n: dayNum(ymd()) - dayNum(m.date) })) + '</span>';
    if (m.date === ymd()) return '<span class="chip ' + (memoDue(m) ? 'c-warn' : 'c-info') + '">' + esc(t('rm_today')) + (m.time ? ' ' + esc(m.time) : '') + '</span>';
    return '<span class="chip c-info">' + esc(t('rm_in', { n: dayNum(m.date) - dayNum(ymd()) })) + '</span>';
  }

  /* ------------------------------------------------ the red number in the menu */
  function badge() {
    var n = Store.canWrite() ? dueList().length + memoDueList().length : 0;
    var b = $('navRem'); if (!b) return;
    b.textContent = n; b.style.display = n ? '' : 'none';
  }

  /* ------------------------------------------------ the page */
  function stat(ic, cls, l, v) {
    return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="l">' + esc(l) + '</div><div class="v num">' + v + '</div></div></div>';
  }
  function renderMemos() {
    var box = $('rmMemoCard');
    box.hidden = !Store.canSeeAll();                                  // not for workers
    if (box.hidden) return;
    var list = S().memos.slice().sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || ((a.date + a.time) < (b.date + b.time) ? -1 : 1); });
    var open = list.filter(function (m) { return !m.done; }), done = list.filter(function (m) { return m.done; }).slice(-5);
    var shown = open.concat(done);
    $('rmMemoCount').textContent = open.length ? String(open.length) : '';
    if (!shown.length) { $('rmMemoList').innerHTML = '<div class="blank" style="padding:16px"><b>' + esc(t('memo_none')) + '</b><small>' + esc(t('memo_none_s')) + '</small></div>'; return; }
    $('rmMemoList').innerHTML = shown.map(function (m) {
      return '<div class="memorow' + (m.done ? ' done' : '') + '" data-id="' + esc(m.id) + '">' +
        '<div class="memotxt"><b>' + esc(m.title) + '</b>' + (m.demo ? ' <span class="chip c-gold">' + esc(t('demo_tag')) + '</span>' : '') +
          (m.note ? '<div class="mini">' + esc(m.note) + '</div>' : '') + '</div>' +
        '<div class="memowhen">' + fdate(m.date) + (m.time ? ' ' + esc(m.time) : '') + ' ' + memoChip(m) + '</div>' +
        '<div class="acts">' +
          (m.done ? '<button class="iconbtn" data-mundone="' + esc(m.id) + '" title="' + esc(t('memo_reopen')) + '">&#8634;</button>'
                  : '<button class="iconbtn ok" data-mdone="' + esc(m.id) + '" title="' + esc(t('memo_mark_done')) + '">&#10004;</button>') +
          '<button class="iconbtn" data-medit="' + esc(m.id) + '" title="' + esc(t('edit')) + '">&#9998;</button>' +
          '<button class="iconbtn d" data-mdel="' + esc(m.id) + '" title="' + esc(t('delete')) + '">&#128465;</button></div></div>';
    }).join('');
  }
  function render() {
    renderMemos();
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
  function popupBox(list, memos) {
    var shown = list.slice(0, 6), total = list.length + memos.length;
    var html = '<h3>&#9200; ' + esc(t('rm_title')) + '</h3><div class="msub">' + esc(t('rm_sub', { n: total })) + '</div><div class="rmlist">';
    memos.forEach(function (m) {
      html += '<div class="rmcard memo" data-mid="' + esc(m.id) + '">' +
        '<div class="rmtop"><b>&#128221; ' + esc(m.title) + '</b>' + memoChip(m) + '</div>' +
        (m.note ? '<div class="mini">' + esc(m.note) + '</div>' : '') +
        '<div class="rmact"><button type="button" class="btn b-ok" data-mdone="' + esc(m.id) + '">&#10004; ' + esc(t('memo_mark_done')) + '</button>' +
          '<button type="button" class="btn b-soft" data-medit="' + esc(m.id) + '">' + esc(t('rm_later')) + '</button></div></div>';
    });
    shown.forEach(function (i) {
      html += '<div class="rmcard" data-id="' + esc(i.id) + '">' +
        '<div class="rmtop"><b>' + esc(i.customerName) + '</b>' + whenChip(i) + '</div>' +
        '<div class="mini"><span class="ltr">' + esc(i.number) + '</span> &middot; ' + esc(t('balance')) + ': <b style="color:var(--bad)">' + f3(Calc.balance(i)) + ' ' + esc(t('omr')) + '</b>' +
          (i.lastReminded ? ' &middot; ' + esc(t('rm_last')) + ': ' + fdate(i.lastReminded) : '') + '</div>' +
        (i.remindNote ? '<div class="mini">' + esc(i.remindNote) + '</div>' : '') +
        '<div class="rmact"><button type="button" class="btn b-wa" data-rwa="' + esc(i.id) + '">' + WA + ' ' + esc(t('rm_whatsapp')) + '</button>' +
          '<button type="button" class="btn b-soft" data-rset="' + esc(i.id) + '">' + esc(t('rm_later')) + '</button>' +
          '<button type="button" class="btn b-soft" data-rbill="' + esc(i.id) + '">' + esc(t('rm_open_bill')) + '</button></div></div>';
    });
    html += '</div>' + (list.length > shown.length ? '<div class="mini" style="margin-top:8px">' + esc(t('rm_more', { n: list.length - shown.length })) + '</div>' : '') +
      '<div class="duo" style="margin-top:14px"><button type="button" class="btn b-main" style="margin-top:0" data-rpage>' + esc(t('rm_open_page')) + '</button>' +
        '<button type="button" class="btn b-soft" data-close>' + esc(t('close')) + '</button></div>';
    return html;
  }
  function renderPopup() {
    var list = dueList(), memos = memoDueList();
    if (!list.length && !memos.length) { $('rmModal').hidden = true; return; }
    $('rmBox').innerHTML = popupBox(list, memos);
    list.forEach(function (i) { seen[i.id + ':' + i.remindOn] = true; });          // shown once: not forced on him again until something new is due
    memos.forEach(function (m) { seen[memoKey(m)] = true; });
  }
  /* Show the pop-up if something is due that it has not shown yet in this session. */
  function check() {
    if (!Store.s.user || !Store.canWrite() || !$('gate').hidden) return;
    badge();
    var list = dueList(), memos = memoDueList();
    var fresh = list.some(function (i) { return !seen[i.id + ':' + i.remindOn]; }) || memos.some(function (m) { return !seen[memoKey(m)]; });
    if (!fresh || !$('rmModal').hidden) return;
    // never in the middle of another window (a bill being sent, a payment being taken ...): the next check tries again
    if (document.querySelector('.modal:not([hidden])')) return;
    renderPopup(); $('rmModal').hidden = false;
  }
  function startChecks() {
    setTimeout(check, 700);
    if (!timer) timer = setInterval(check, 60 * 1000);
  }

  /* ------------------------------------------------ set / move / remove a payment reminder */
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

  /* ------------------------------------------------ personal reminders: add / edit / done / delete */
  function openMemo(id) {
    memoId = id || '';
    var m = id ? Store.memoById(id) : null;
    $('mmHead').textContent = t(m ? 'memo_edit' : 'memo_add');
    $('mmTitle').value = m ? m.title : ''; $('mmDate').value = m ? m.date : ymd(); $('mmDate').min = '';
    $('mmTime').value = m ? m.time : ''; $('mmNote').value = m ? m.note : ''; $('mmErr').textContent = '';
    $('mmDelete').style.display = m ? '' : 'none';
    App.openModal('memoModal');
    setTimeout(function () { $('mmTitle').focus(); }, 50);
  }
  function memoAfter() {
    badge(); render();
    if (!$('rmModal').hidden) renderPopup();
  }
  function saveMemo() {
    var title = $('mmTitle').value.trim();
    if (!title) { $('mmErr').textContent = t('memo_err_title'); return; }
    if (!$('mmDate').value) { $('mmErr').textContent = t('err_date'); return; }
    var old = memoId ? Store.memoById(memoId) : null;
    var doc = { id: old ? old.id : uid('m'), title: title, date: $('mmDate').value, time: $('mmTime').value, note: $('mmNote').value.trim(),
      done: false, doneAt: '' };
    if (old && old.demo) doc.demo = true;
    Store.saveMemo(doc).then(function () { App.closeModal('memoModal'); toast(t('saved')); memoAfter(); })
      .catch(function (e) { $('mmErr').textContent = App.errText(e); });
  }
  function setDone(id, done) {
    var m = Store.memoById(id); if (!m) return;
    var copy = JSON.parse(JSON.stringify(m)); copy.done = done; copy.doneAt = done ? ymd() : '';
    Store.saveMemo(copy).then(memoAfter).catch(function (e) { toast(App.errText(e), 'bad'); });
  }
  function delMemo(id) {
    var m = Store.memoById(id); if (!m) return;
    if (!confirm(t('memo_confirm_delete', { title: m.title }))) return;
    Store.removeMemo(id).then(function () { App.closeModal('memoModal'); toast(t('deleted')); memoAfter(); App.refreshDemoBar(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }
  function memoClick(e) {
    var d = e.target.closest('[data-mdone]'); if (d) { setDone(d.dataset.mdone, true); return true; }
    var u = e.target.closest('[data-mundone]'); if (u) { setDone(u.dataset.mundone, false); return true; }
    var ed = e.target.closest('[data-medit]'); if (ed) { openMemo(ed.dataset.medit); return true; }
    var dl = e.target.closest('[data-mdel]'); if (dl) { delMemo(dl.dataset.mdel); return true; }
    return false;
  }

  function init() {
    $('rmFilters').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { filter = b.dataset.f; render(); } });
    $('rmBody').addEventListener('click', function (e) {
      var w = e.target.closest('[data-rwa]'); if (w) { sendReminder(w.dataset.rwa); return; }
      var s = e.target.closest('[data-rset]'); if (s) { openSet(s.dataset.rset); return; }
      var r = e.target.closest('tr[data-id]'); if (r) { App.show('invoices'); Invoices.openDetail(r.dataset.id); }
    });
    $('rmBox').addEventListener('click', function (e) {
      if (memoClick(e)) return;
      var w = e.target.closest('[data-rwa]'); if (w) { sendReminder(w.dataset.rwa); return; }
      var s = e.target.closest('[data-rset]'); if (s) { openSet(s.dataset.rset); return; }
      var b = e.target.closest('[data-rbill]'); if (b) { $('rmModal').hidden = true; App.show('invoices'); Invoices.openDetail(b.dataset.rbill); return; }
      if (e.target.closest('[data-rpage]')) { $('rmModal').hidden = true; App.show('reminders'); }
    });
    $('rmMemoList').addEventListener('click', memoClick);
    $('rmMemoAdd').addEventListener('click', function () { openMemo(''); });
    $('rsQuick').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      $('rsDate').value = ymd(addDays(Number(b.dataset.d)));
    });
    $('mmQuick').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      $('mmDate').value = ymd(addDays(Number(b.dataset.d)));
    });
    $('mmSave').addEventListener('click', saveMemo);
    $('mmDelete').addEventListener('click', function () { delMemo(memoId); });
    $('mmTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveMemo(); });
    $('rsSave').addEventListener('click', function () { saveSet(false); });
    $('rsRemove').addEventListener('click', function () { saveSet(true); });
  }

  window.Reminders = { init: init, refresh: render, check: check, startChecks: startChecks, badge: badge, openSet: openSet, markSent: markSent,
    state: state, isDue: isDue, whenChip: whenChip, memoDue: memoDue };
})();
