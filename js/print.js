/* print.js - printable documents.
   Everything printed is bilingual (English + Arabic), as an Omani invoice should be,
   whichever language the screen is using.
   The same A4 layout is used by the public bill page (bill.html) that a customer opens from the WhatsApp link. */
(function () {
  'use strict';

  var PAYM = { cash: ['Cash', 'نقداً'], card: ['Card', 'بطاقة'], transfer: ['Bank transfer', 'تحويل بنكي'], cheque: ['Cheque', 'شيك'] };
  var JOBS = { received: ['Received', 'تم الاستلام'], repair: ['In repair', 'قيد الإصلاح'], ready: ['Ready for pickup', 'جاهزة للاستلام'], delivered: ['Delivered', 'تم التسليم'] };
  var logo = 'img/logo.png';
  var override = null;                 // the shop's details when a bill is drawn for the public page

  function S() { return override || Store.s.settings; }
  function payName(m) { var p = PAYM[m] || [m, m]; return p[0] + ' / ' + p[1]; }
  function jobName(j) { var p = JOBS[j] || JOBS.received; return p[0] + ' / ' + p[1]; }

  function docType(inv) {
    if (inv.kind === 'quote') return ['QUOTATION', 'عرض أسعار'];
    if (!(inv.vatPct > 0)) return ['INVOICE', 'فاتورة'];
    if (inv.total < 500 && !inv.customerVat) return ['SIMPLIFIED TAX INVOICE', 'فاتورة ضريبية مبسطة'];
    return ['TAX INVOICE', 'فاتورة ضريبية'];
  }
  function row(en, ar, val) {
    if (val === '' || val === null || val === undefined) return '';
    return '<div class="row"><span>' + esc(en) + ' / ' + esc(ar) + '</span><b>' + val + '</b></div>';
  }
  function cell(v) { return '<b class="ltr">' + esc(v) + '</b>'; }
  function hasVehicle(inv) { return inv.kind !== 'parts' && !!(inv.plate || inv.car || inv.color || inv.km || inv.vin || inv.claim || inv.due || inv.fault); }
  var QSTAT = { open: ['Open', 'مفتوح'], accepted: ['Accepted', 'مقبول'], rejected: ['Rejected', 'مرفوض'], expired: ['Expired', 'منتهي الصلاحية'] };
  /* open + past its validity date = expired (worked out on the fly, never stored) */
  function quoteState(q) { return q.status === 'open' && q.validUntil && q.validUntil < ymd() ? 'expired' : (q.status || 'open'); }
  function quoteStatus(q) { var p = QSTAT[quoteState(q)] || QSTAT.open; return p[0] + ' / ' + p[1]; }

  /* ------------------------------------------------ A4 invoice */
  function a4(inv) {
    var s = S(), dt = docType(inv), tax = inv.vatPct > 0;
    var kind = Catalog.kind(inv.kind), quote = inv.kind === 'quote';
    var paid = Calc.paid(inv), bal = Calc.balance(inv);

    var rows = inv.items.map(function (it, i) {
      var u = Catalog.unit(it.unit);
      var same = (it.n || '') === (it.a || '');
      return '<tr><td class="c">' + (i + 1) + '</td>' +
        '<td>' + esc(it.n) + (!same && it.a ? '<span class="ar">' + esc(it.a) + '</span>' : '') + '</td>' +
        '<td class="c">' + esc(u.en) + ' / ' + esc(u.ar) + '</td>' +
        '<td class="c">' + esc(it.q) + '</td>' +
        '<td class="n">' + f3(it.price) + '</td><td class="n">' + f3(Calc.line(it)) + '</td></tr>';
    }).join('');

    var payRows = (inv.payments || []).map(function (p) {
      return '<div class="row"><span>' + fdate(p.date) + ' &middot; ' + esc(payName(p.method)) + '</span><b>' + f3(p.amount) + '</b></div>';
    }).join('');

    var vehicle = hasVehicle(inv) ?
      '<div class="box" style="margin-bottom:8px"><div class="t"><span>Vehicle details</span><span>بيانات المركبة</span></div>' +
        '<div class="meta" style="margin:0;gap:2px 22px">' +
        '<div>' + row('Plate No', 'رقم اللوحة', inv.plate ? cell(inv.plate) : '') + row('Car', 'السيارة', esc(inv.car)) + row('Colour', 'اللون', esc(inv.color)) + row('Chassis / VIN', 'رقم الشاصي', inv.vin ? cell(inv.vin) : '') + '</div>' +
        '<div>' + row('Mileage (km)', 'قراءة العداد (كم)', inv.km ? cell(inv.km) : '') + row('Claim / Ref no', 'رقم المطالبة / المرجع', inv.claim ? cell(inv.claim) : '') +
          row('Expected delivery', 'موعد التسليم المتوقع', inv.due ? '<span class="ltr">' + fdate(inv.due) + '</span>' : '') + '</div></div>' +
        (inv.fault ? '<div class="fault"><b>Work required / العمل المطلوب:</b> ' + esc(inv.fault) + '</div>' : '') + '</div>' : '';

    return '<div class="inv">' +
      '<div class="hd">' +
        '<div class="l"><h1>' + esc(s.name) + '</h1>' +
          '<div class="sm">' + esc(s.addr) + '</div>' +
          '<div class="sm">Tel: <span class="ltr">' + esc(s.phone) + '</span>' + (s.email ? ' &nbsp;|&nbsp; ' + esc(s.email) : '') + '</div>' +
          '<div class="sm">C.R. No: <b class="ltr">' + esc(inv.cr || s.cr) + '</b>' + (tax ? ' &nbsp;|&nbsp; VATIN: <b class="ltr">' + esc(inv.vatNo || s.vatNo) + '</b>' : '') + '</div></div>' +
        '<img src="' + logo + '" alt="">' +
        '<div class="r"><h1>' + esc(s.nameAr) + '</h1>' +
          '<div class="sm">' + esc(s.addrAr) + '</div>' +
          '<div class="sm">هاتف: <span class="ltr">' + esc(s.phone) + '</span></div>' +
          '<div class="sm">السجل التجاري: <b class="ltr">' + esc(inv.cr || s.cr) + '</b>' + (tax ? ' &nbsp;|&nbsp; الرقم الضريبي: <b class="ltr">' + esc(inv.vatNo || s.vatNo) + '</b>' : '') + '</div></div>' +
      '</div><div class="goldbar"></div>' +
      '<div class="doc">' + dt[0] + '<small>' + dt[1] + '</small>' + (inv.void ? '<div class="stamp">VOID / ملغاة</div>' : '') + '</div>' +
      '<div class="meta">' +
        '<div class="box"><div class="t"><span>Customer</span><span>العميل</span></div>' +
          row('Name', 'الاسم', esc(inv.customerName)) +
          row('Phone', 'الهاتف', inv.customerPhone ? cell(inv.customerPhone) : '') +
          row('Address', 'العنوان', esc(inv.customerAddr)) +
          row('Customer VATIN', 'الرقم الضريبي للعميل', inv.customerVat ? cell(inv.customerVat) : '') + '</div>' +
        '<div class="box"><div class="t"><span>Invoice</span><span>الفاتورة</span></div>' +
          (quote ? row('Quotation No', 'رقم عرض السعر', cell(inv.number)) : row('Invoice No', 'رقم الفاتورة', cell(inv.number))) +
          row('Date', 'التاريخ', '<span class="ltr">' + fdate(inv.date) + ' ' + esc(inv.time || '') + '</span>') +
          row('Type', 'النوع', esc(kind.en) + ' / ' + esc(kind.ar)) +
          (quote ? row('Valid until', 'صالح حتى', inv.validUntil ? '<span class="ltr">' + fdate(inv.validUntil) + '</span>' : '') + row('Status', 'الحالة', esc(quoteStatus(inv))) : '') +
          (inv.kind === 'repair' && !inv.void ? row('Status', 'الحالة', esc(jobName(inv.job))) : '') +
          row('Prepared by', 'أعدّها', esc(inv.createdBy || '')) + '</div>' +
      '</div>' + vehicle +
      '<table><thead><tr><th class="c" style="width:28px">#</th><th>Description / الوصف</th><th class="c">Unit / الوحدة</th><th class="c">Qty / الكمية</th><th class="n">Rate / السعر</th><th class="n">Amount / المبلغ (OMR)</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="bottom"><div>' +
        (quote ? '<div class="note"><b>Price quotation / عرض سعر:</b> This is a quotation, not an invoice. The final amount may change after inspection.<br><span style="direction:rtl;display:block">هذا عرض سعر وليس فاتورة، وقد يتغيّر المبلغ النهائي بعد الفحص.</span></div>' : '') +
        (inv.note ? '<div class="note"><b>Note / ملاحظة:</b> ' + esc(inv.note) + '</div>' : '') +
        (s.bank ? '<div class="note"><b>Bank / البنك:</b> ' + esc(s.bank).replace(/\n/g, '<br>') + '</div>' : '') +
        (payRows ? '<div class="box"><div class="t"><span>Payments received</span><span>الدفعات المستلمة</span></div>' + payRows + '</div>' : '') +
      '</div><div class="tot">' +
        row('Subtotal', 'المجموع', f3(inv.office != null ? inv.office : inv.total)) +
        (inv.discount > 0 ? row('Discount', 'الخصم', '-' + f3(inv.discount)) : '') +
        (tax ? row('Taxable amount', 'المبلغ الخاضع للضريبة', f3(inv.office - inv.discount)) + row('VAT ' + inv.vatPct + '%', 'ضريبة القيمة المضافة', f3(inv.vat)) : '') +
        (inv.behalf > 0 ? row('Other charges (no VAT)', 'رسوم أخرى (بدون ضريبة)', f3(inv.behalf)) : '') +
        '<div class="grand"><span>TOTAL / الإجمالي (OMR)</span><span>' + f3(inv.total) + '</span></div>' +
        (quote ? '' : row('Paid', 'المدفوع', f3(paid))) +
        (!quote && bal > 0.0004 ? '<div class="row" style="font-weight:800"><span style="color:#b00005">Balance due / المتبقي</span><b style="color:#b00005">' + f3(bal) + '</b></div>' : '') +
      '</div></div>' +
      '<div class="sign"><div>Prepared by / أعدّها</div><div>' + (quote ? 'Customer approval / موافقة العميل' : 'Customer signature / توقيع العميل') + '</div><div>Stamp / الختم</div></div>' +
      '<div class="foot">' + esc(s.footer) + (s.terms ? '<br>' + esc(s.terms) : '') + '</div>' +
    '</div>';
  }

  /* ------------------------------------------------ 80 mm receipt */
  function thermal(inv) {
    var s = S(), dt = docType(inv), tax = inv.vatPct > 0, paid = Calc.paid(inv), bal = Calc.balance(inv);
    var rows = inv.items.map(function (it) {
      return '<tr><td>' + esc(it.n) + '</td><td style="text-align:center">' + esc(it.q) + '</td><td style="text-align:right">' + f3(Calc.line(it)) + '</td></tr>';
    }).join('');
    function l(a, b) { return b === '' || b == null ? '' : '<div class="l"><span>' + a + '</span><span>' + b + '</span></div>'; }
    return '<div class="rc">' +
      '<div style="text-align:center"><img src="' + logo + '" style="width:34mm;height:22mm;object-fit:contain" alt=""></div>' +
      '<h2>' + esc(s.name) + '</h2><div class="arh">' + esc(s.nameAr) + '</div>' +
      '<div class="sub">' + esc(s.addr) + '</div><div class="sub">Tel: ' + esc(s.phone) + '</div>' +
      '<div class="sub">C.R.: ' + esc(inv.cr || s.cr) + (tax ? ' | VATIN: ' + esc(inv.vatNo || s.vatNo) : '') + '</div>' +
      '<div class="doctype">' + dt[0] + ' / ' + dt[1] + (inv.void ? '<br>** VOID / ملغاة **' : '') + '</div>' +
      l('<b>No: ' + esc(inv.number) + '</b>', fdate(inv.date) + ' ' + esc(inv.time || '')) +
      l('Customer:', esc(inv.customerName)) + l('Phone:', esc(inv.customerPhone)) + l('Cust. VATIN:', esc(inv.customerVat)) +
      (inv.kind !== 'parts' ? l('Plate:', esc(inv.plate)) + l('Car:', esc(inv.car)) + l('Due:', inv.due ? fdate(inv.due) : '') : '') +
      '<hr><table><thead><tr><th>Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + rows + '</tbody></table><hr>' +
      l('Subtotal', f3(inv.office)) + (inv.discount > 0 ? l('Discount', '-' + f3(inv.discount)) : '') +
      (tax ? l('VAT ' + inv.vatPct + '%', f3(inv.vat)) : '') + (inv.behalf > 0 ? l('Other (no VAT)', f3(inv.behalf)) : '') +
      '<div class="grand"><span>TOTAL OMR</span><span>' + f3(inv.total) + '</span></div>' +
      l('Paid / المدفوع', f3(paid)) + (bal > 0.0004 ? l('<b>Balance / المتبقي</b>', '<b>' + f3(bal) + '</b>') : '') +
      '<div class="ft">' + esc(s.footer) + '<br>- - - - - - - - - -</div></div>';
  }

  /* ------------------------------------------------ customer statement */
  function statement(cust) {
    var s = S();
    var list = Store.s.invoices.filter(function (i) { return !i.void && (i.customerId === cust.id || (!i.customerId && i.customerName === cust.name)); })
      .sort(function (a, b) { return a.no - b.no; });
    var tot = 0, paid = 0;
    var rows = list.map(function (i) {
      var p = Calc.paid(i), b = Calc.balance(i); tot += i.total; paid += p;
      return '<tr><td>' + fdate(i.date) + '</td><td>' + esc(i.number) + '</td><td>' + esc(i.plate || '') + '</td><td>' + esc([i.car, i.fault].filter(Boolean).join(' - ')) +
        '</td><td class="n">' + f3(i.total) + '</td><td class="n">' + f3(p) + '</td><td class="n">' + f3(b) + '</td></tr>';
    }).join('');
    return '<div class="inv stmt">' +
      '<div class="hd"><div class="l"><h1>' + esc(s.name) + '</h1><div class="sm">' + esc(s.addr) + '</div><div class="sm">C.R. No: ' + esc(s.cr) + '</div></div>' +
      '<img src="' + logo + '" alt=""><div class="r"><h1>' + esc(s.nameAr) + '</h1><div class="sm">' + esc(s.addrAr) + '</div></div></div><div class="goldbar"></div>' +
      '<div class="doc">STATEMENT OF ACCOUNT<small>كشف حساب</small></div>' +
      '<div class="box" style="margin-bottom:8px">' + row('Customer', 'العميل', esc(cust.name)) + row('Phone', 'الهاتف', cust.phone ? cell(cust.phone) : '') +
        row('VATIN', 'الرقم الضريبي', cust.vatNo ? cell(cust.vatNo) : '') + row('Date', 'التاريخ', fdate(ymd())) + '</div>' +
      '<table><thead><tr><th>Date</th><th>Invoice</th><th>Plate</th><th>Details</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="bottom"><div></div><div class="tot">' + row('Total invoiced', 'إجمالي الفواتير', f3(tot)) + row('Total paid', 'إجمالي المدفوع', f3(paid)) +
        '<div class="grand"><span>BALANCE DUE / المستحق (OMR)</span><span>' + f3(r3(tot - paid)) + '</span></div></div></div>' +
      '<div class="foot">' + esc(s.footer) + '</div></div>';
  }

  /* ------------------------------------------------ print engine */
  function run(html, paper) {
    $('printArea').innerHTML = html;
    $('pageStyle').textContent = paper === '80' ? '@page{size:80mm auto;margin:3mm}' : '@page{size:A4;margin:11mm}';
    var imgs = Array.prototype.slice.call($('printArea').querySelectorAll('img'));
    var pending = imgs.filter(function (i) { return !i.complete; });
    var fired = false;
    var go = function () { if (fired) return; fired = true; setTimeout(function () { window.print(); }, 120); };   // never open two print windows
    if (!pending.length) return go();
    var left = pending.length, done = function () { if (--left <= 0) go(); };
    pending.forEach(function (i) { i.addEventListener('load', done); i.addEventListener('error', done); });
    setTimeout(go, 1500);
  }

  window.Print = {
    invoice: function (inv) { var p = S().paper === '80' && inv.kind !== 'quote' ? '80' : 'a4'; run(p === '80' ? thermal(inv) : a4(inv), p); },
    statement: function (cust) { run(statement(cust), 'a4'); },
    /* the A4 bill as HTML, drawn with the shop's details given (used by bill.html) */
    billHtml: function (inv, settings) { override = settings; try { return a4(inv); } finally { override = null; } },
    PAYM: PAYM, JOBS: JOBS, docType: docType, quoteState: quoteState, quoteStatus: quoteStatus
  };
})();
