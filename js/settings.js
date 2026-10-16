/* settings.js - business details, VAT, printing, workers, backup / restore, subscription. */
(function () {
  'use strict';

  var busy = false;
  function t(k, v) { return I18N.t(k, v); }
  var FIELDS = { name: 'stName', nameAr: 'stNameAr', addr: 'stAddr', addrAr: 'stAddrAr', phone: 'stPhone', email: 'stEmail', cr: 'stCr',
    vatNo: 'stVatNo', crNameAr: 'stCrNameAr', crNameEn: 'stCrNameEn', prefix: 'stPrefix', quotePrefix: 'stQuotePrefix', footer: 'stFooter', terms: 'stTerms', bank: 'stBank' };
  var ROLE_CLASS = { admin: 'c-brand', cashier: 'c-mut', viewer: 'c-info' };

  function fill() {
    var s = Store.s.settings;
    Object.keys(FIELDS).forEach(function (k) { $(FIELDS[k]).value = s[k] || ''; });
    $('stQuoteDays').value = s.quoteDays || 14; $('stPrintScale').value = s.printScale || 100; $('stRemindDays').value = s.remindDays === undefined ? 3 : s.remindDays; $('stVatOn').checked = !!s.vatOn; $('stVatPct').value = s.vatPct; $('stPaper').value = s.paper || 'a4';
    var server = Store.isServer();
    var seeAll = Store.canSeeAll();
    $('stBizCard').style.display = seeAll ? '' : 'none';
    $('stAccountCard').style.display = server ? '' : 'none';
    $('stUsersCard').style.display = server && seeAll ? '' : 'none';
    $('stDataCard').style.display = seeAll ? '' : 'none';
    $('stSubCard').style.display = seeAll && window.SUBSCRIPTION ? '' : 'none';
    // view-only account: the settings can be read but not edited
    document.querySelectorAll('#stBizCard input, #stBizCard select').forEach(function (el) { el.disabled = Store.isViewer(); });
    subTick();
    $('stMode').innerHTML = server
      ? '<span class="chip c-ok">&#9679; ' + esc(t('mode_server')) + '</span> <span class="mini">' + esc(t('mode_server_s')) + '</span>'
      : '<span class="chip c-gold">&#9679; ' + esc(t('mode_demo')) + '</span> <span class="mini">' + esc(t('mode_demo_s')) + '</span>';
    // Worker accounts are switched by the system provider: when off, the list is shown but nothing can be added or removed.
    var staffOn = Store.feature('staff_accounts');
    $('stUsersCard').classList.toggle('locked', !staffOn);
    $('usHint').hidden = !staffOn;
    $('usLimit').hidden = !staffOn;
    if (server && seeAll) { loadUsers(); loadHealth(); } else $('stHealth').hidden = true;
  }

  function loadHealth() {
    Store.health().then(function (h) {
      var box = $('stHealth');
      var safe = h.kind === 'outside' || h.kind === 'custom';
      var kb = h.db_bytes >= 1048576 ? (h.db_bytes / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(h.db_bytes / 1024)) + ' KB';
      box.innerHTML =
        '<div class="hrow"><span>' + esc(t('hl_location')) + '</span><b class="' + (safe ? 'hok' : 'hwarn') + '">' + esc(t(safe ? 'hl_outside' : 'hl_inside')) + '</b></div>' +
        '<div class="hrow"><span>' + esc(t('hl_writable')) + '</span><b class="' + (h.writable ? 'hok' : 'hbad') + '">' + esc(t(h.writable ? 'yes' : 'hl_no')) + '</b></div>' +
        '<div class="hrow"><span>' + esc(t('hl_size')) + '</span><b>' + esc(kb) + ' &middot; ' + h.invoices + ' ' + esc(t('s_invoices')) + '</b></div>' +
        '<div class="hrow"><span>' + esc(t('hl_backups')) + '</span><b>' + h.backups + (h.last_backup ? ' &middot; ' + esc(t('hl_last')) + ' ' + esc(fdate(h.last_backup)) : '') + '</b></div>' +
        '<div class="hrow"><span>PHP / SQLite</span><b class="ltr">' + esc(h.php) + ' / ' + esc(h.sqlite) + '</b></div>';
      box.hidden = false;
    }).catch(function () { $('stHealth').hidden = true; });
  }

  function save() {
    if (busy) return;
    var d = {};
    Object.keys(FIELDS).forEach(function (k) { d[k] = $(FIELDS[k]).value.trim(); });
    d.vatOn = $('stVatOn').checked; d.vatPct = num($('stVatPct').value); d.paper = $('stPaper').value;
    d.prefix = (d.prefix || 'INV').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'INV';
    d.quotePrefix = (d.quotePrefix || 'QT').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'QT';
    d.quoteDays = Math.max(1, Math.min(365, Math.round(num($('stQuoteDays').value)) || 14));
    d.remindDays = Math.max(0, Math.min(90, Math.round(num($('stRemindDays').value)) || 0));
    d.printScale = Math.max(50, Math.min(150, Math.round(num($('stPrintScale').value)) || 100));
    if (!d.name) { toast(t('err_name'), 'bad'); return; }
    if (d.vatOn && !d.vatNo) { toast(t('err_vat_no'), 'bad'); return; }
    if (d.vatOn && !(d.vatPct > 0 && d.vatPct <= 100)) { toast(t('err_vat_pct'), 'bad'); return; }
    busy = true;
    Store.saveSettings(d).then(function () { toast(t('saved')); App.applyBranding(); NewInvoice.refresh(); fill(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); }).then(function () { busy = false; });
  }

  /* ------------------------------------------------ workers */
  function loadUsers() {
    Store.users().then(function (r) {
      var list = r.users, max = Number(r.max_staff) || 0;
      var workers = list.filter(function (u) { return u.role === 'cashier'; }).length;
      var full = max > 0 && workers >= max;
      $('usList').innerHTML = list.map(function (u) {
        var mine = u.id === Store.s.user.id;
        var acts = u.role === 'cashier'
          ? '<div class="acts"><button class="iconbtn" data-pw="' + u.id + '" title="' + esc(t('reset_password')) + '">&#128273;</button>' +
            '<button class="iconbtn d" data-del="' + u.id + '" title="' + esc(t('delete')) + '">&#128465;</button></div>' : '';
        return '<tr><td><b>' + esc(u.name) + '</b>' + (mine ? ' <span class="mini">(' + esc(t('signed_in_as')) + ')</span>' : '') + '</td><td><span class="ltr">' + esc(u.username) + '</span></td>' +
          '<td><span class="chip ' + (ROLE_CLASS[u.role] || 'c-mut') + '">' + esc(t('role_' + u.role)) + '</span></td><td>' + acts + '</td></tr>';
      }).join('');
      $('usLimitTxt').textContent = full ? t('workers_full', { n: max }) : t('workers_added');
      $('usLimitNum').textContent = workers + ' / ' + (max || '-');
      $('usLimit').classList.toggle('full', full);
      $('usForm').style.display = full ? 'none' : '';
    }).catch(function () { /* settings page still usable */ });
  }
  function addUser() {
    var body = { name: $('usName').value.trim(), username: $('usUser').value.trim(), password: $('usPass').value };
    $('usErr').textContent = '';
    Store.addUser(body).then(function () {
      $('usName').value = $('usUser').value = $('usPass').value = ''; toast(t('saved')); loadUsers();
    }).catch(function (e) { $('usErr').textContent = App.errText(e); loadUsers(); });
  }
  function changeMyPassword() {
    $('pwErr').textContent = '';
    if ($('pwNew').value !== $('pwNew2').value) { $('pwErr').textContent = t('err_pw_match'); return; }
    Store.setPassword({ old: $('pwOld').value, password: $('pwNew').value }).then(function () {
      $('pwOld').value = $('pwNew').value = $('pwNew2').value = ''; toast(t('password_changed'));
    }).catch(function (e) { $('pwErr').textContent = App.errText(e); });
  }
  function resetUserPassword(id) {
    var p = prompt(t('prompt_new_password'));
    if (!p) return;
    Store.setPassword({ id: Number(id), password: p }).then(function () { toast(t('password_changed')); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  /* ------------------------------------------------ data */
  function backup() {
    download('Best-and-Fast_Backup_' + stamp() + '.json', JSON.stringify(Store.exportAll(), null, 2), 'application/json');
    toast(t('backup_saved'));
  }
  function restoreFile(ev) {
    var f = ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(String(r.result).replace(/^﻿/, ''));
        if (!Array.isArray(d.invoices)) throw new Error('bad');
        if (!confirm(t('confirm_restore', { n: d.invoices.length }))) return;
        Store.restore(d).then(function () { toast(t('restored')); App.start(); })
          .catch(function (e) { toast(App.errText(e), 'bad'); });
      } catch (e) { toast(t('err_bad_backup'), 'bad'); }
    };
    r.readAsText(f); ev.target.value = '';
  }
  function wipe() {
    if (!confirm(t('confirm_wipe'))) return;
    if (!confirm(t('confirm_wipe2'))) return;
    var resetNo = confirm(t('confirm_wipe_counter'));
    Store.wipe(resetNo).then(function () { toast(t('wiped')); App.start(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  /* ------------------------------------------------ subscription countdown */
  var pad2 = function (n) { return n < 10 ? '0' + n : '' + n; };
  function subTick() {
    var sub = window.SUBSCRIPTION, card = $('stSubCard');
    if (!sub || !card || card.style.display === 'none' || !$('view-settings').classList.contains('active')) return;
    var start = Date.parse(sub.start), end = Date.parse(sub.end), now = Date.now();
    var left = Math.max(0, end - now), expired = end - now <= 0;
    var days = Math.floor(left / 864e5), hrs = Math.floor(left % 864e5 / 36e5), min = Math.floor(left % 36e5 / 6e4), sec = Math.floor(left % 6e4 / 1e3);
    $('subD').textContent = days; $('subH').textContent = pad2(hrs); $('subM').textContent = pad2(min); $('subS').textContent = pad2(sec);
    var pct = Math.min(100, Math.max(0, (now - start) / (end - start) * 100));
    $('subBar').style.width = pct.toFixed(2) + '%';
    $('subPct').textContent = t('sub_used', { p: pct.toFixed(1) });
    var cls = expired ? 'c-bad' : days <= 30 ? 'c-warn' : 'c-ok';
    $('subChip').className = 'chip ' + cls;
    $('subChip').textContent = t(expired ? 'sub_expired' : days <= 30 ? 'sub_soon' : 'sub_active');
    $('subStart').textContent = fdate(ymd(new Date(start)));
    $('subEnd').textContent = fdate(ymd(new Date(end)));
  }

  function init() {
    setInterval(subTick, 1000);
    $('stSave').addEventListener('click', save);
    $('usAdd').addEventListener('click', addUser);
    $('pwSave').addEventListener('click', changeMyPassword);
    $('usList').addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]'), p = e.target.closest('[data-pw]');
      if (d && confirm(t('confirm_del_user'))) Store.delUser(Number(d.dataset.del)).then(loadUsers).catch(function (x) { toast(App.errText(x), 'bad'); });
      if (p) resetUserPassword(p.dataset.pw);
    });
    $('dbBackup').addEventListener('click', backup);
    $('dbRestore').addEventListener('click', function () { $('dbFile').click(); });
    $('dbFile').addEventListener('change', restoreFile);
    $('dbWipe').addEventListener('click', wipe);
  }
  window.Settings = { init: init, refresh: fill };
})();
