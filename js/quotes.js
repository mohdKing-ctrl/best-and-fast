/* quotes.js - the Quotations (عروض الأسعار) list: follow every quotation, change its status, send it on WhatsApp,
   print it, and turn an accepted one into a bill. A quotation is not a bill: it is never counted in sales or reports. */
(function () {
  'use strict';

  var openId = null;
  var busy = false;
  var STATE_CLASS = { open: 'c-warn', accepted: 'c-ok', rejected: 'c-mut', expired: 'c-bad' };
  var WA = '<svg viewBox="0 0 24 24"><use href="#i-wa"/></svg>';

  function t(k, v) { return I18N.t(k, v); }
  function S() { return Store.s; }
  function nm(o) { return I18N.pick(o.n, o.a); }
  function stateChip(q) { var st = Print.quoteState(q); return '<span class="chip ' + STATE_CLASS[st] + '">' + esc(t('qs_' + st)) + '</span>'; }
  function vehicleCell(q) {
    return (q.plate ? '<b class="ltr">' + esc(q.plate) + '</b>' : '') + '<div class="mini">' + esc([q.car, q.fault].filter(Boolean).join(' - ')) + '</div>';
  }

  function filtered() {
    var q = $('qtSearch').value.toLowerCase().trim(), st = $('qtStatus').value;
    return S().quotes.filter(function (x) {
      if (st && Print.quoteState(x) !== st) return false;
      if (q) {
        var blob = [x.number, x.customerName, x.customerPhone, x.plate, x.car, x.vin, x.claim, x.fault, x.note, x.convertedTo,
          x.items.map(function (i) { return i.n + ' ' + i.a; }).join(' ')].join(' ').toLowerCase();
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return b.no - a.no; });
  }
  function stat(ic, cls, l, v) {
    return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="l">' + esc(l) + '</div><div class="v num">' + v + '</div></div></div>';
  }
  function render() {
    var all = S().quotes, open = 0, openVal = 0, acc = 0, exp = 0;
    all.forEach(function (x) {
      var st = Print.quoteState(x);
      if (st === 'open') { open++; openVal += x.total; } else if (st === 'accepted') acc++; else if (st === 'expired') exp++;
    });
    $('qtStats').innerHTML =
      stat('&#128221;', 'c-warn', t('qs_open'), open) +
      stat('&#128176;', 'c-brand', t('q_open_value'), f3(openVal) + ' <small>' + esc(t('omr')) + '</small>') +
      stat('&#9989;', 'c-ok', t('qs_accepted'), acc) +
      stat('&#9203;', 'c-bad', t('qs_expired'), exp);
    $('qtReset').classList.toggle('hasfilter', !!($('qtSearch').value.trim() || $('qtStatus').value));
    App.updateBadge();

    var list = filtered();
    if (!list.length) {
      $('qtBody').innerHTML = '<tr><td colspan="8"><div class="blank"><span class="em">&#128221;</span><b>' + esc(t('no_quotes')) + '</b><small>' + esc(t('no_quotes_s')) + '</small></div></td></tr>';
      return;
    }
    $('qtBody').innerHTML = list.map(function (x) {
      return '<tr class="click" data-id="' + esc(x.id) + '">' +
        '<td data-l="' + esc(t('quote_no')) + '"><b class="ltr">' + esc(x.number) + '</b>' + (x.demo ? ' <span class="chip c-gold">' + esc(t('demo_tag')) + '</span>' : '') + '</td>' +
        '<td data-l="' + esc(t('date')) + '">' + fdate(x.date) + '<div class="mini">' + esc(x.time || '') + '</div></td>' +
        '<td data-l="' + esc(t('customer')) + '"><b>' + esc(x.customerName) + '</b>' + (x.claim ? '<div class="mini">' + esc(t('claim')) + ': <span class="ltr">' + esc(x.claim) + '</span></div>' : '') + '</td>' +
        '<td data-l="' + esc(t('vehicle')) + '" style="max-width:230px">' + vehicleCell(x) + '</td>' +
        '<td class="money num" data-l="' + esc(t('total')) + '">' + f3(x.total) + '</td>' +
        '<td data-l="' + esc(t('valid_until')) + '">' + (x.validUntil ? fdate(x.validUntil) : '-') + '</td>' +
        '<td data-l="' + esc(t('status')) + '">' + stateChip(x) + (x.convertedTo ? '<div class="mini">&rarr; <span class="ltr">' + esc(x.convertedTo) + '</span></div>' : '') + '</td>' +
        '<td data-l=""><div class="acts"><button class="iconbtn wa" data-wa="' + esc(x.id) + '" title="' + esc(t('send_whatsapp')) + '">' + WA + '</button>' +
          '<button class="iconbtn pdf" data-pdf="' + esc(x.id) + '" title="' + esc(t('send_pdf')) + '">PDF</button>' +
          '<button class="iconbtn" data-print="' + esc(x.id) + '" title="' + esc(t('print')) + '">&#128424;</button></div></td></tr>';
    }).join('');
  }

  /* ------------------------------------------------ detail */
  function openDetail(id) {
    var q = Store.quoteById(id); if (!q) return;
    openId = id;
    var canWrite = Store.canWrite(), admin = Store.isAdmin();
    function kv(k, v) { return v ? '<div><small>' + esc(t(k)) + '</small><b>' + v + '</b></div>' : ''; }
    var items = q.items.map(function (it) {
      var u = Catalog.unit(it.unit);
      return '<tr><td>' + esc(nm(it)) + '</td><td>' + esc(I18N.pick(u.en, u.ar)) + '</td><td class="num">' + esc(it.q) + '</td><td class="num">' + f3(it.price) + '</td><td class="money num">' + f3(Calc.line(it)) + '</td></tr>';
    }).join('');
    var canConvert = canWrite && !q.convertedTo && q.status !== 'rejected';
    $('qtBox').innerHTML =
      '<h3><span class="ltr">' + esc(q.number) + '</span> &nbsp;<span class="chip c-brand">' + esc(t('quotation')) + '</span> ' + stateChip(q) + (q.demo ? ' <span class="chip c-gold">' + esc(t('demo_tag')) + '</span>' : '') + '</h3>' +
      '<div class="msub">' + fdate(q.date) + ' ' + esc(q.time || '') + (q.createdBy ? ' &middot; ' + esc(q.createdBy) : '') + '</div>' +
      '<div class="kv">' +
        kv('customer', esc(q.customerName)) + kv('phone', q.customerPhone ? '<span class="ltr">' + esc(q.customerPhone) + '</span>' : '') +
        kv('cust_vat', q.customerVat ? '<span class="ltr">' + esc(q.customerVat) + '</span>' : '') + kv('address', esc(q.customerAddr)) +
        kv('plate_no', q.plate ? '<span class="ltr">' + esc(q.plate) + '</span>' : '') + kv('car', esc(q.car)) + kv('color', esc(q.color)) +
        kv('mileage', q.km ? '<span class="ltr">' + esc(q.km) + '</span>' : '') + kv('vin', q.vin ? '<span class="ltr">' + esc(q.vin) + '</span>' : '') +
        kv('claim', q.claim ? '<span class="ltr">' + esc(q.claim) + '</span>' : '') +
        kv('valid_until', q.validUntil ? fdate(q.validUntil) : '') + kv('fault', esc(q.fault)) + kv('note', q.note ? '<span class="rednote">' + esc(q.note) + '</span>' : '') +
        kv('converted_to', q.convertedTo ? '<span class="ltr">' + esc(q.convertedTo) + '</span>' : '') +
      '</div>' +
      '<div class="tblcard" style="box-shadow:none"><div class="tblwrap"><table><thead><tr><th>' + esc(t('service')) + '</th><th>' + esc(t('unit')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('price')) + '</th><th>' + esc(t('amount')) + '</th></tr></thead><tbody>' + items + '</tbody></table></div></div>' +
      '<div class="sums" style="margin-top:14px">' +
        '<div class="sr"><span>' + esc(t('subtotal')) + '</span><b>' + f3((q.office || 0) + (q.behalf || 0)) + '</b></div>' +
        (q.discount > 0 ? '<div class="sr"><span>' + esc(t('discount')) + '</span><b>-' + f3(q.discount) + '</b></div>' : '') +
        (q.vatPct > 0 ? '<div class="sr"><span>' + esc(t('vat')) + ' ' + q.vatPct + '%</span><b>' + f3(q.vat) + '</b></div>' : '') +
        '<div class="sr grand"><span>' + esc(t('total')) + '</span><b>' + f3(q.total) + ' <small>' + esc(t('omr')) + '</small></b></div>' +
      '</div>' +
      '<div class="err" id="qtErr"></div>' +
      (canWrite ? '<div class="fields" style="margin-top:6px;align-items:end"><div class="fld"><label>' + esc(t('status')) + '</label><select id="qtStatusSel">' +
        Catalog.QUOTE_STATUS.map(function (s) { return '<option value="' + s + '"' + (s === q.status ? ' selected' : '') + '>' + esc(t('qs_' + s)) + '</option>'; }).join('') + '</select></div></div>' : '') +
      (canConvert ? '<button type="button" class="btn b-ok" style="margin-top:14px" id="qtConvert">&#129534; ' + esc(t('convert_to_invoice')) + '</button>' : '') +
      '<div class="duo" style="margin-top:12px"><button type="button" class="btn b-wa" style="margin-top:0" id="qtWa">' + WA + ' ' + esc(t('send_whatsapp')) + '</button>' +
        '<button type="button" class="btn b-main" style="margin-top:0" id="qtPrint">&#128424; ' + esc(t('print')) + '</button></div>' +
      '<button type="button" class="btn b-soft" style="margin-top:10px" id="qtPdf">&#128196; ' + esc(t('pdf_download')) + '</button>' +
      '<button type="button" class="btn b-soft" style="margin-top:10px" data-close>' + esc(t('close')) + '</button>' +
      (admin ? '<button type="button" class="btn b-danger" style="margin-top:10px" id="qtDelete">' + esc(t('delete_quote')) + '</button>' : '');
    App.openModal('qtModal');
  }

  function persist(q, msg) {
    if (busy) return Promise.resolve();
    busy = true;
    return Store.updateQuote(q).then(function () {
      toast(msg); render(); App.updateBadge(); if (openId === q.id && !$('qtModal').hidden) openDetail(q.id);
    }).catch(function (e) { toast(App.errText(e), 'bad'); }).then(function () { busy = false; });
  }
  function setStatus(status) {
    var q = Store.quoteById(openId); if (!q || q.status === status) return;
    var copy = JSON.parse(JSON.stringify(q)); copy.status = status;
    persist(copy, q.number + ' → ' + t('qs_' + status));
  }
  function convert() {
    var q = Store.quoteById(openId); if (!q) return;
    $('qtModal').hidden = true;
    App.show('new');
    NewInvoice.fromQuote(q);
    toast(t('convert_hint', { no: q.number }));
  }
  function remove() {
    var q = Store.quoteById(openId); if (!q) return;
    if (!confirm(t('confirm_delete_quote', { no: q.number }))) return;
    Store.removeQuote(q.id).then(function () { $('qtModal').hidden = true; toast(t('deleted')); render(); App.updateBadge(); App.refreshDemoBar(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  function init() {
    $('qtSearch').addEventListener('input', render);
    $('qtStatus').addEventListener('change', render);
    $('qtReset').addEventListener('click', function () { $('qtSearch').value = ''; $('qtStatus').value = ''; render(); });
    $('qtNew').addEventListener('click', function () { App.show('new'); NewInvoice.startQuote(); });
    $('qtBody').addEventListener('click', function (e) {
      var wa = e.target.closest('[data-wa], [data-pdf]');
      if (wa) { Whatsapp.open(Store.quoteById(wa.dataset.wa || wa.dataset.pdf)); return; }
      var p = e.target.closest('[data-print]');
      if (p) { Print.invoice(Store.quoteById(p.dataset.print)); return; }
      var r = e.target.closest('tr[data-id]'); if (r) openDetail(r.dataset.id);
    });
    $('qtBox').addEventListener('click', function (e) {
      if (e.target.closest('#qtConvert')) convert();
      else if (e.target.closest('#qtPrint')) Print.invoice(Store.quoteById(openId));
      else if (e.target.closest('#qtWa')) Whatsapp.open(Store.quoteById(openId));
      else if (e.target.closest('#qtDelete')) remove();
      else if (e.target.closest('#qtPdf')) Pdf.downloadFor(Store.quoteById(openId), e.target.closest('#qtPdf'));
    });
    $('qtBox').addEventListener('change', function (e) { if (e.target.id === 'qtStatusSel') setStatus(e.target.value); });
  }

  window.Quotes = { init: init, refresh: render, openDetail: openDetail };
})();
