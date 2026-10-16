/* invoices.js - history list, invoice detail, receiving payments, car stage, void, WhatsApp, export. */
(function () {
  'use strict';

  var openId = null;
  var busy = false;
  var selecting = false;     // "delete bills" mode: tick-boxes are shown
  var selected = {};         // id -> true

  function t(k, v) { return I18N.t(k, v); }
  function S() { return Store.s; }
  function nm(o) { return I18N.pick(o.n, o.a); }
  var JOB_ORDER = Catalog.JOBS;
  var JOB_CLASS = { received: 'c-warn', repair: 'c-info', ready: 'c-brand', delivered: 'c-ok' };
  var WA = '<svg viewBox="0 0 24 24"><use href="#i-wa"/></svg>';

  function payChip(inv) {
    if (inv.void) return '<span class="chip c-mut">' + esc(t('voided')) + '</span>';
    var st = Calc.payStatus(inv);
    if (st === 'paid') return '<span class="chip c-ok">' + esc(t('st_paid')) + '</span>';
    var bal = '<div class="mini">' + esc(t('balance')) + ': ' + f3(Calc.balance(inv)) + '</div>';
    return '<span class="chip ' + (st === 'partial' ? 'c-warn' : 'c-bad') + '">' + esc(t(st === 'partial' ? 'st_partial' : 'st_unpaid')) + '</span>' + bal;
  }
  /* a small bell under "unpaid": the day he will be reminded */
  function remindMini(i) {
    if (i.void || !(Calc.balance(i) > 0.0004) || !i.remindOn) return '';
    return '<div class="mini">&#9200; ' + fdate(i.remindOn) + (Reminders.isDue(i) ? ' <span class="chip c-bad">' + esc(t('rm_due_short')) + '</span>' : '') + '</div>';
  }
  function jobChip(inv, clickable) {
    var next = JOB_ORDER.indexOf(inv.job) < JOB_ORDER.length - 1;
    var click = clickable && next;
    return '<span class="chip ' + (JOB_CLASS[inv.job] || 'c-warn') + (click ? ' clickchip' : '') + '"' + (click ? ' data-job="' + esc(inv.id) + '" title="' + esc(t('click_advance')) + '"' : '') + '>' + esc(t('job_' + inv.job)) + '</span>';
  }
  function vehicleCell(i) {
    if (i.kind === 'parts') return '<div class="mini">' + esc(I18N.pick(Catalog.kind('parts').en, Catalog.kind('parts').ar)) + '</div>';
    return (i.plate ? '<b class="ltr">' + esc(i.plate) + '</b>' : '') + '<div class="mini">' + esc([i.car, i.fault].filter(Boolean).join(' - ')) + '</div>';
  }

  /* ------------------------------------------------ list */
  function filtered() {
    var q = $('ivSearch').value.toLowerCase().trim();
    var from = $('ivFrom').value, to = $('ivTo').value, pay = $('ivPay').value, job = $('ivJob').value;
    return S().invoices.filter(function (i) {
      if (job && (i.kind === 'parts' || i.job !== job)) return false;
      if (from && i.date < from) return false;
      if (to && i.date > to) return false;
      if (pay) {
        if (pay === 'void') { if (!i.void) return false; }
        else if (i.void || Calc.payStatus(i) !== pay) return false;
      }
      if (q) {
        var blob = [i.number, i.customerName, i.customerPhone, i.plate, i.car, i.color, i.vin, i.claim, i.fault, i.note,
          i.items.map(function (x) { return x.n + ' ' + x.a; }).join(' ')].join(' ').toLowerCase();
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return b.no - a.no; });
  }
  function stat(ic, cls, l, v) {
    return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="l">' + esc(l) + '</div><div class="v num">' + v + '</div></div></div>';
  }
  function render() {
    var list = filtered(), live = list.filter(function (i) { return !i.void; });
    // The clear button lights up while any search / date / filter is limiting the list.
    var filtering = !!($('ivSearch').value.trim() || $('ivFrom').value || $('ivTo').value || $('ivPay').value || $('ivJob').value);
    $('ivReset').classList.toggle('hasfilter', filtering);
    var billed = 0, paid = 0;
    live.forEach(function (i) { billed += i.total; paid += Calc.paid(i); });
    var todayB = 0; S().invoices.forEach(function (i) { if (!i.void && i.date === ymd()) todayB += i.total; });
    $('ivStats').innerHTML =
      stat('&#128203;', 'c-info', t('s_invoices'), live.length) +
      stat('&#128176;', 'c-brand', t('s_billed'), f3(billed) + ' <small>' + esc(t('omr')) + '</small>') +
      stat('&#9989;', 'c-ok', t('s_collected'), f3(paid) + ' <small>' + esc(t('omr')) + '</small>') +
      stat('&#9203;', 'c-bad', t('s_outstanding'), f3(billed - paid) + ' <small>' + esc(t('omr')) + '</small>') +
      stat('&#9728;', 'c-gold', t('s_today'), f3(todayB) + ' <small>' + esc(t('omr')) + '</small>');
    App.updateBadge();

    // Only bills that are on screen can be ticked: changing a filter drops hidden ticks.
    var shown = {}; list.forEach(function (i) { shown[i.id] = 1; });
    Object.keys(selected).forEach(function (id) { if (!shown[id]) delete selected[id]; });
    $('ivCkTh').hidden = !selecting;
    $('ivDelete').style.display = Store.isAdmin() ? '' : 'none';
    updateSelBar(list);

    if (!list.length) {
      $('ivBody').innerHTML = '<tr><td colspan="' + (selecting ? 9 : 8) + '"><div class="blank"><span class="em">&#128220;</span><b>' + esc(t('no_invoices')) + '</b><small>' + esc(t('no_invoices_s')) + '</small></div></td></tr>';
      return;
    }
    $('ivBody').innerHTML = list.map(function (i) {
      return '<tr class="click' + (i.void ? ' void' : '') + (selected[i.id] ? ' selected' : '') + '" data-id="' + esc(i.id) + '">' +
        (selecting ? '<td class="ckcol" data-l=""><input type="checkbox" data-sel="' + esc(i.id) + '"' + (selected[i.id] ? ' checked' : '') + ' aria-label="' + esc(i.number) + '"></td>' : '') +
        '<td data-l="' + esc(t('invoice_no')) + '"><b class="ltr">' + esc(i.number) + '</b>' + (i.demo ? ' <span class="chip c-gold">' + esc(t('demo_tag')) + '</span>' : '') + '</td>' +
        '<td data-l="' + esc(t('date')) + '">' + fdate(i.date) + '<div class="mini">' + esc(i.time || '') + '</div></td>' +
        '<td data-l="' + esc(t('customer')) + '"><b>' + esc(i.customerName) + '</b>' + (i.customerPhone ? '<div class="mini"><span class="ltr">' + esc(i.customerPhone) + '</span></div>' : '') + '</td>' +
        '<td data-l="' + esc(t('vehicle')) + '" style="max-width:230px">' + vehicleCell(i) + '</td>' +
        '<td class="money num" data-l="' + esc(t('total')) + '">' + f3(i.total) + '</td>' +
        '<td data-l="' + esc(t('payment')) + '">' + payChip(i) + remindMini(i) + '</td>' +
        '<td data-l="' + esc(t('job_status')) + '">' + (i.void || i.kind === 'parts' ? '' : jobChip(i, Store.canWrite())) + '</td>' +
        '<td data-l=""><div class="acts"><button class="iconbtn wa" data-wa="' + esc(i.id) + '" title="' + esc(t('send_whatsapp')) + '">' + WA + '</button>' +
          '<button class="iconbtn pdf" data-pdf="' + esc(i.id) + '" title="' + esc(t('send_pdf')) + '">PDF</button>' +
          '<button class="iconbtn" data-print="' + esc(i.id) + '" title="' + esc(t('print')) + '">&#128424;</button></div></td></tr>';
    }).join('');
  }

  /* ------------------------------------------------ delete bills (owner only) */
  function updateSelBar(list) {
    $('ivSelBar').hidden = !selecting;
    if (!selecting) return;
    var n = Object.keys(selected).length;
    $('ivSelCount').textContent = n ? t('n_selected', { n: n }) : '';
    $('ivDoDelete').textContent = t('delete_selected', { n: n });
    $('ivDoDelete').disabled = !n;
    $('ivSelAll').checked = list.length > 0 && n === list.length;
    $('ivSelAll').disabled = !list.length;
  }
  function setSelecting(on) {
    selecting = !!on; selected = {};
    $('ivDelete').classList.toggle('active', selecting);
    render();
  }
  function toggleSel(id) { if (selected[id]) delete selected[id]; else selected[id] = true; render(); }
  function selectAll(on) {
    selected = {};
    if (on) filtered().forEach(function (i) { selected[i.id] = true; });
    render();
  }
  function deleteSelected() {
    var ids = Object.keys(selected);
    if (!ids.length || busy) return;
    var nums = ids.map(function (id) { var i = Store.invoiceById(id); return i ? i.number : id; }).sort();
    var list = nums.slice(0, 8).join('  ,  ') + (nums.length > 8 ? '  ...  +' + (nums.length - 8) : '');
    if (!confirm(t('confirm_delete_bills', { n: ids.length, list: list }))) return;
    busy = true;
    Store.removeInvoices(ids).then(function () {
      toast(t('bills_deleted', { n: ids.length }));
      setSelecting(false);
      if ($('view-customers').classList.contains('active')) Customers.refresh();
      App.refreshDemoBar();
    }).catch(function (e) { toast(App.errText(e), 'bad'); }).then(function () { busy = false; });
  }

  /* ------------------------------------------------ detail modal */
  function openDetail(id) {
    var inv = Store.invoiceById(id); if (!inv) return;
    openId = id;
    var dt = Print.docType(inv), kind = Catalog.kind(inv.kind), repair = inv.kind !== 'parts';
    var paid = Calc.paid(inv), bal = Calc.balance(inv);
    function kv(k, v) { return v ? '<div><small>' + esc(t(k)) + '</small><b>' + v + '</b></div>' : ''; }
    var items = inv.items.map(function (it) {
      var u = Catalog.unit(it.unit);
      return '<tr><td>' + esc(nm(it)) + '</td>' +
        '<td>' + esc(I18N.pick(u.en, u.ar)) + '</td><td class="num">' + esc(it.q) + '</td><td class="num">' + f3(it.price) + '</td><td class="money num">' + f3(Calc.line(it)) + '</td></tr>';
    }).join('');
    var pays = (inv.payments || []).map(function (p) {
      return '<tr><td>' + fdate(p.date) + '</td><td>' + esc(t('pay_' + p.method)) + '</td><td class="money num">' + f3(p.amount) + '</td></tr>';
    }).join('') || '<tr><td colspan="3" class="mini">' + esc(t('no_payments')) + '</td></tr>';

    var admin = Store.isAdmin(), canWrite = Store.canWrite();
    $('ivBox').innerHTML =
      '<h3><span class="ltr">' + esc(inv.number) + '</span> &nbsp;<span class="chip c-brand">' + esc(I18N.pick(dt[0], dt[1])) + '</span> ' + (inv.void ? '<span class="chip c-mut">' + esc(t('voided')) + '</span>' : '') +
        (inv.demo ? ' <span class="chip c-gold">' + esc(t('demo_tag')) + '</span>' : '') + '</h3>' +
      '<div class="msub">' + fdate(inv.date) + ' ' + esc(inv.time || '') + (inv.createdBy ? ' &middot; ' + esc(inv.createdBy) : '') + '</div>' +
      '<div class="kv">' +
        kv('customer', esc(inv.customerName)) + kv('phone', inv.customerPhone ? '<span class="ltr">' + esc(inv.customerPhone) + '</span>' : '') +
        kv('cust_vat', inv.customerVat ? '<span class="ltr">' + esc(inv.customerVat) + '</span>' : '') + kv('address', esc(inv.customerAddr)) +
        kv('bill_type', esc(I18N.pick(kind.en, kind.ar))) +
        (repair ? kv('plate_no', inv.plate ? '<span class="ltr">' + esc(inv.plate) + '</span>' : '') + kv('car', esc(inv.car)) + kv('color', esc(inv.color)) +
          kv('mileage', inv.km ? '<span class="ltr">' + esc(inv.km) + '</span>' : '') + kv('vin', inv.vin ? '<span class="ltr">' + esc(inv.vin) + '</span>' : '') + kv('claim', inv.claim ? '<span class="ltr">' + esc(inv.claim) + '</span>' : '') + kv('due_date', inv.due ? fdate(inv.due) : '') + kv('fault', esc(inv.fault)) : '') +
        kv('note', inv.note ? '<span class="rednote">' + esc(inv.note) + '</span>' : '') +
      '</div>' +
      '<div class="tblcard" style="box-shadow:none"><div class="tblwrap"><table><thead><tr><th>' + esc(t('service')) + '</th><th>' + esc(t('unit')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('price')) + '</th><th>' + esc(t('amount')) + '</th></tr></thead><tbody>' + items + '</tbody></table></div></div>' +
      '<div class="sums" style="margin-top:14px">' +
        '<div class="sr"><span>' + esc(t('subtotal')) + '</span><b>' + f3((inv.office || 0) + (inv.behalf || 0)) + '</b></div>' +
        (inv.discount > 0 ? '<div class="sr"><span>' + esc(t('discount')) + '</span><b>-' + f3(inv.discount) + '</b></div>' : '') +
        (inv.vatPct > 0 ? '<div class="sr"><span>' + esc(t('vat')) + ' ' + inv.vatPct + '%</span><b>' + f3(inv.vat) + '</b></div>' : '') +
        '<div class="sr grand"><span>' + esc(t('total')) + '</span><b>' + f3(inv.total) + ' <small>' + esc(t('omr')) + '</small></b></div>' +
        '<div class="sr"><span>' + esc(t('paid')) + '</span><b>' + f3(paid) + '</b></div>' +
        '<div class="sr"><span>' + esc(t('balance_due')) + '</span><b style="color:' + (bal > 0.0004 ? 'var(--bad)' : 'var(--ok)') + '">' + f3(bal) + '</b></div>' +
      '</div>' +
      '<h3 style="margin:18px 0 8px;font-size:15px">' + esc(t('payments')) + '</h3>' +
      '<div class="tblcard" style="box-shadow:none"><div class="tblwrap"><table><tbody>' + pays + '</tbody></table></div></div>' +
      (canWrite && !inv.void && bal > 0.0004 ?
        '<div class="fields f3" style="margin-top:14px;align-items:end">' +
          '<div class="fld"><label>' + esc(t('amount')) + '</label><input type="number" id="rpAmt" step="0.001" min="0" value="' + f3(bal) + '"></div>' +
          '<div class="fld"><label>' + esc(t('pay_method')) + '</label><select id="rpMethod">' + payOptions('cash') + '</select></div>' +
          '<button type="button" class="btn b-ok" style="width:100%" id="rpAdd">&#128176; ' + esc(t('receive_payment')) + '</button></div>' : '') +
      (!inv.void && bal > 0.0004 ? '<div class="remindrow"><span>&#9200; ' + esc(t('remind_on')) + ': <b>' + (inv.remindOn ? fdate(inv.remindOn) + '</b> ' + Reminders.whenChip(inv) : esc(t('rm_none')) + '</b>') + (inv.remindNote ? ' <span class="mini">' + esc(inv.remindNote) + '</span>' : '') + (inv.lastReminded ? ' <span class="mini">&middot; ' + esc(t('rm_last')) + ': ' + fdate(inv.lastReminded) + '</span>' : '') + '</span>' +
        (canWrite ? '<button type="button" class="tbtn b-soft" id="ivRemind">' + esc(t(inv.remindOn ? 'remind_change' : 'remind_set')) + '</button>' : '') + '</div>' : '') +
      '<div class="err" id="ivErr"></div>' +
      (canWrite && !inv.void && repair ? '<div class="fields" style="margin-top:6px;align-items:end"><div class="fld"><label>' + esc(t('job_status')) + '</label><select id="ivJobSel">' +
        JOB_ORDER.map(function (j) { return '<option value="' + j + '"' + (j === inv.job ? ' selected' : '') + '>' + esc(t('job_' + j)) + '</option>'; }).join('') + '</select></div></div>' : '') +
      '<div class="duo" style="margin-top:16px"><button type="button" class="btn b-wa" style="margin-top:0" id="ivWa">' + WA + ' ' + esc(t('send_pdf_wa')) + '</button>' +
        '<button type="button" class="btn b-main" style="margin-top:0" id="ivPrint">&#128424; ' + esc(t('print')) + '</button></div>' +
      '<button type="button" class="btn b-soft" style="margin-top:10px" id="ivPdf">&#128196; ' + esc(t('pdf_download')) + '</button>' +
      '<button type="button" class="btn b-soft" style="margin-top:10px" data-close>' + esc(t('close')) + '</button>' +
      (admin && !inv.void ? '<button type="button" class="btn b-danger" style="margin-top:10px" id="ivVoid">' + esc(t('void_invoice')) + '</button>' : '');
    App.openModal('ivModal');
  }
  function payOptions(sel) {
    return ['cash', 'card', 'transfer', 'cheque'].map(function (m) {
      return '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + esc(t('pay_' + m)) + '</option>';
    }).join('');
  }

  function persist(inv, msg) {
    if (busy) return Promise.resolve();
    busy = true;
    return Store.updateInvoice(inv).then(function () {
      toast(msg); render(); if (openId === inv.id && !$('ivModal').hidden) openDetail(inv.id);
      if ($('view-customers').classList.contains('active')) Customers.refresh();
    }).catch(function (e) { toast(App.errText(e), 'bad'); }).then(function () { busy = false; });
  }
  function addPayment() {
    var inv = Store.invoiceById(openId); if (!inv) return;
    var amt = r3(num($('rpAmt').value)), bal = Calc.balance(inv);
    if (!(amt > 0)) { $('ivErr').textContent = t('err_amount'); return; }
    if (amt > bal + 0.0004) { $('ivErr').textContent = t('err_overpay', { n: f3(bal) }); return; }
    var copy = JSON.parse(JSON.stringify(inv));
    copy.payments = (copy.payments || []).concat([{ date: ymd(), amount: amt, method: $('rpMethod').value }]);
    persist(copy, t('payment_saved'));
  }
  function setJob(id, job) {
    var inv = Store.invoiceById(id); if (!inv || inv.void || inv.job === job || inv.kind === 'parts') return;
    var copy = JSON.parse(JSON.stringify(inv)); copy.job = job;
    persist(copy, inv.number + ' → ' + t('job_' + job));
  }
  function voidInvoice() {
    var inv = Store.invoiceById(openId); if (!inv) return;
    if (!confirm(t('confirm_void', { no: inv.number }))) return;
    var copy = JSON.parse(JSON.stringify(inv)); copy.void = true; copy.voidedAt = ymd();
    persist(copy, t('invoice_voided'));
  }

  /* ------------------------------------------------ export */
  function exportXlsx() {
    var list = filtered().slice().reverse();
    if (!list.length) { toast(t('nothing_export'), 'bad'); return; }
    var X = XLSX.S;
    var h1 = ['invoice_no', 'date', 'time', 'customer', 'phone', 'cust_vat', 'bill_type', 'plate_no', 'car', 'color', 'mileage', 'fault',
      'subtotal', 'discount', 'vat', 'total', 'paid', 'balance', 'pay_status', 'job_status', 'created_by'];
    var rows1 = [h1.map(function (k) { return { v: t(k), s: X.HEAD }; })];
    var rows2 = [['invoice_no', 'date', 'customer', 'plate_no', 'category', 'service', 'unit', 'qty', 'price', 'amount'].map(function (k) { return { v: t(k), s: X.HEAD }; })];
    var tot = { sub: 0, disc: 0, vat: 0, total: 0, paid: 0, bal: 0 };
    list.forEach(function (i) {
      var live = !i.void, p = Calc.paid(i), b = Calc.balance(i), d = Catalog.kind(i.kind), sub = (i.office || 0) + (i.behalf || 0);
      rows1.push([i.number, i.date, i.time || '', i.customerName, i.customerPhone || '', i.customerVat || '', I18N.pick(d.en, d.ar), i.plate || '', i.car || '',
        i.color || '', i.km || '', i.fault || '',
        { v: sub, s: X.MONEY }, { v: i.discount || 0, s: X.MONEY }, { v: i.vat || 0, s: X.MONEY }, { v: i.total, s: X.MONEY },
        { v: p, s: X.MONEY }, { v: b, s: X.MONEY }, i.void ? t('voided') : t('st_' + Calc.payStatus(i)), i.kind === 'parts' ? '' : t('job_' + i.job), i.createdBy || '']);
      if (live) { tot.sub += sub; tot.disc += i.discount || 0; tot.vat += i.vat || 0; tot.total += i.total; tot.paid += p; tot.bal += b; }
      if (live) i.items.forEach(function (it) {
        var c = Catalog.cat(it.cat), u = Catalog.unit(it.unit);
        rows2.push([i.number, i.date, i.customerName, i.plate || '', I18N.pick(c.en, c.ar), nm(it), I18N.pick(u.en, u.ar), it.q,
          { v: it.price, s: X.MONEY }, { v: Calc.line(it), s: X.MONEY }]);
      });
    });
    rows1.push([]);
    rows1.push([{ v: t('grand_total'), s: X.HEAD }, '', '', '', '', '', '', '', '', '', '', '',
      { v: tot.sub, s: X.MONEY_B }, { v: tot.disc, s: X.MONEY_B }, { v: tot.vat, s: X.MONEY_B },
      { v: tot.total, s: X.MONEY_B }, { v: tot.paid, s: X.MONEY_B }, { v: tot.bal, s: X.MONEY_B }]);
    XLSX.save('Best-and-Fast_Invoices_' + stamp() + '.xlsx', [
      { name: t('sheet_invoices'), rows: rows1, cols: [14, 11, 8, 26, 12, 15, 14, 12, 18, 12, 10, 30, 12, 10, 10, 12, 12, 12, 12, 14, 12], headerRows: 1, rtl: I18N.isRTL() },
      { name: t('sheet_lines'), rows: rows2, cols: [14, 11, 26, 12, 18, 34, 12, 8, 11, 11], headerRows: 1, rtl: I18N.isRTL() }
    ]);
    toast(t('excel_saved', { n: list.length }));
  }

  /* ------------------------------------------------ wiring */
  function init() {
    ['ivSearch'].forEach(function (id) { $(id).addEventListener('input', render); });
    ['ivFrom', 'ivTo', 'ivPay', 'ivJob'].forEach(function (id) { $(id).addEventListener('change', render); });
    $('ivReset').addEventListener('click', function () { $('ivSearch').value = ''; $('ivFrom').value = ''; $('ivTo').value = ''; $('ivPay').value = ''; $('ivJob').value = ''; render(); });
    $('ivExport').addEventListener('click', exportXlsx);
    $('ivDelete').addEventListener('click', function () { setSelecting(!selecting); });
    $('ivCancelDelete').addEventListener('click', function () { setSelecting(false); });
    $('ivDoDelete').addEventListener('click', deleteSelected);
    $('ivSelAll').addEventListener('change', function (e) { selectAll(e.target.checked); });
    $('ivBody').addEventListener('click', function (e) {
      var wa = e.target.closest('[data-wa], [data-pdf]');
      if (wa) { Whatsapp.open(Store.invoiceById(wa.dataset.wa || wa.dataset.pdf)); return; }       // the window sends the bill as an A4 PDF
      if (selecting) {                                  // in delete mode a click only ticks / unticks
        if (e.target.closest('[data-print]')) { Print.invoice(Store.invoiceById(e.target.closest('[data-print]').dataset.print)); return; }
        var row = e.target.closest('tr[data-id]'); if (row) toggleSel(row.dataset.id);
        return;
      }
      var j = e.target.closest('[data-job]');
      if (j) { var inv = Store.invoiceById(j.dataset.job); setJob(inv.id, JOB_ORDER[Math.min(JOB_ORDER.indexOf(inv.job) + 1, JOB_ORDER.length - 1)]); return; }
      var p = e.target.closest('[data-print]');
      if (p) { Print.invoice(Store.invoiceById(p.dataset.print)); return; }
      var r = e.target.closest('tr[data-id]'); if (r) openDetail(r.dataset.id);
    });
    $('ivBox').addEventListener('click', function (e) {
      if (e.target.closest('#rpAdd')) addPayment();
      else if (e.target.closest('#ivPrint')) Print.invoice(Store.invoiceById(openId));
      else if (e.target.closest('#ivWa')) Whatsapp.open(Store.invoiceById(openId));
      else if (e.target.closest('#ivRemind')) Reminders.openSet(openId);
      else if (e.target.closest('#ivPdf')) Pdf.downloadFor(Store.invoiceById(openId), e.target.closest('#ivPdf'));
      else if (e.target.closest('#ivVoid')) voidInvoice();
    });
    $('ivBox').addEventListener('change', function (e) { if (e.target.id === 'ivJobSel') setJob(openId, e.target.value); });
  }
  function showFor(text) { $('ivSearch').value = text || ''; $('ivFrom').value = ''; $('ivTo').value = ''; $('ivPay').value = ''; $('ivJob').value = ''; }

  window.Invoices = { init: init, refresh: render, openDetail: openDetail, showFor: showFor };
})();
