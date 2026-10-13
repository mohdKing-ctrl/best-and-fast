/* invoice.js - the "New Invoice" screen: customer + car details, pick services and parts, price, take payment.
   The same screen makes a QUOTATION (عرض أسعار): same lines and totals, but no payment, a "valid until" date, and
   the number comes from the quotation series (QT-00001...). A quotation can later be turned into a bill. */
(function () {
  'use strict';

  var cart = [];            // {sid, cat, n, a, unit, ob, price, q}
  var kind = 'repair';      // 'repair' = a job on a customer's car, 'parts' = a plain sale of spare parts, 'quote' = a price quotation
  var curCat = 'all';
  var custId = null;
  var payTouched = false;
  var saving = false;
  var remindTouched = false; // he chose (or cleared) the reminder date himself: stop suggesting one
  var fromQuote = null;     // the quotation this bill is being made from (it becomes "accepted" when the bill is saved)
  var saveKey = null, saveFp = '';      // one-time key of the bill being saved (kept while a save is being retried)

  function t(k, v) { return I18N.t(k, v); }
  function S() { return Store.s; }
  function nm(o) { return I18N.pick(o.n, o.a); }
  function nm2(o) { return I18N.pick(o.a, o.n); }
  function isQuote() { return kind === 'quote'; }

  /* ------------------------------------------------ render */
  function setText(id, key) { var el = $(id); el.setAttribute('data-i18n', key); el.textContent = t(key); }
  function renderKind() {
    $('nvKind').innerHTML = Catalog.KINDS.map(function (d) {
      return '<button type="button" data-kind="' + d.id + '" class="' + (d.id === kind ? 'active' : '') + '">' + esc(I18N.pick(d.en, d.ar)) + '</button>';
    }).join('');
    var repair = kind === 'repair', quote = isQuote();
    $('nvVehBox').style.display = repair || quote ? '' : 'none';      // a parts sale has no car details
    $('nvDueWrap').style.display = repair ? '' : 'none';
    $('nvValidWrap').style.display = quote ? '' : 'none';
    $('nvPayBlock').style.display = quote ? 'none' : '';              // nothing is paid on a quotation
    $('nvFromQ').hidden = !fromQuote;
    if (fromQuote) $('nvFromQ').textContent = t('from_quote', { no: fromQuote.number });
    setText('nvStep3', quote ? 'step_quote' : 'step_invoice');
    setText('nvSaveTxt', quote ? 'save_print_quote' : 'save_print');
    setText('nvSaveWaTxt', quote ? 'save_whatsapp_quote' : 'save_whatsapp');
    if (quote && !$('nvValid').value) $('nvValid').value = ymd(addDays(Number(S().settings.quoteDays) || 14));
  }
  function renderCats() {
    var html = '<button type="button" data-cat="all" class="' + (curCat === 'all' ? 'active' : '') + '">' + esc(t('all')) + '</button>';
    Catalog.CATS.forEach(function (c) {
      html += '<button type="button" data-cat="' + esc(c.id) + '" class="' + (curCat === c.id ? 'active' : '') + '">' + c.ic + ' ' + esc(I18N.pick(c.en, c.ar)) + '</button>';
    });
    $('nvCats').innerHTML = html;
  }
  function renderGrid() {
    var q = $('nvSearch').value.trim().toLowerCase();
    var list = S().services.filter(function (s) {
      if (curCat !== 'all' && s.cat !== curCat) return false;
      if (q && (s.n + ' ' + s.a).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    $('nvCount').textContent = t('n_services', { n: list.length });
    var html = list.map(function (s) {
      var cat = Catalog.cat(s.cat), u = Catalog.unit(s.unit);
      return '<button type="button" class="svc" data-sid="' + esc(s.id) + '">' +
        '<span class="plus">+</span>' +
        '<span class="cc">' + cat.ic + ' ' + esc(I18N.pick(cat.en, cat.ar)) + '</span>' +
        '<span class="n">' + esc(nm(s)) + '</span>' +
        '<span class="n2">' + esc(nm2(s)) + '</span>' +
        (s.price > 0
          ? '<span class="p">' + f3(s.price) + '<small>' + esc(t('omr')) + ' / ' + esc(I18N.pick(u.en, u.ar)) + '</small></span>'
          : '<span class="p var">' + esc(t('price_on_invoice')) + '</span>') +
        '</button>';
    }).join('');
    html += '<button type="button" class="svc custom" data-custom="1"><span class="em">&#10133;</span><b>' + esc(t('custom_service')) + '</b><span class="n2">' + esc(t('custom_service_s')) + '</span></button>';
    $('nvGrid').innerHTML = html;
  }
  function renderCart() {
    if (!cart.length) {
      $('nvCart').innerHTML = '<div class="blank"><span class="em">&#129534;</span><b>' + esc(t('cart_empty')) + '</b><small>' + esc(t('cart_empty_s')) + '</small></div>';
    } else {
      $('nvCart').innerHTML = cart.map(function (it, i) {
        var u = Catalog.unit(it.unit);
        return '<div class="ci" data-i="' + i + '">' +
          '<div class="nm">' + esc(nm(it)) +
            '<small>' + esc(I18N.pick(Catalog.cat(it.cat).en, Catalog.cat(it.cat).ar)) + ' &middot; ' + esc(t('per')) + ' ' + esc(I18N.pick(u.en, u.ar)) + '</small></div>' +
          '<button type="button" class="x" data-act="del" title="' + esc(t('remove')) + '">&#10006;</button>' +
          '<div class="row2">' +
            '<div class="stepper"><button type="button" data-act="dec">&minus;</button>' +
              '<input type="number" inputmode="decimal" min="0" step="any" data-f="q" value="' + esc(it.q) + '" aria-label="' + esc(t('qty')) + '">' +
              '<button type="button" data-act="inc">+</button></div>' +
            '<span class="times">&times;</span>' +
            '<input class="pr" type="number" inputmode="decimal" min="0" step="0.001" data-f="price" value="' + (it.price ? f3(it.price) : '') + '" placeholder="0.000" aria-label="' + esc(t('price')) + '">' +
            '<span class="lt num" data-lt>' + f3(Calc.line(it)) + '</span>' +
          '</div></div>';
      }).join('');
    }
    calc();
  }

  /* ------------------------------------------------ maths */
  function calc() {
    var s = S().settings;
    var tt = Calc.totals(cart, $('nvDisc').value, s.vatOn, s.vatPct);
    $('nvOffice').textContent = f3(tt.office + tt.behalf);
    $('nvVatRow').style.display = s.vatOn ? 'flex' : 'none';
    $('nvVatPct').textContent = s.vatPct;
    $('nvVatAmt').textContent = f3(tt.vat);
    $('nvTotal').innerHTML = f3(tt.total) + ' <small>' + esc(t('omr')) + '</small>';
    if (!payTouched) $('nvPaid').value = tt.total > 0 ? f3(tt.total) : '';
    var paid = Math.min(num($('nvPaid').value), tt.total);
    var bal = r3(tt.total - paid);
    var b = $('nvBalance');
    b.className = 'balance' + (bal > 0.0004 ? ' due' : '');
    b.innerHTML = '<span>' + esc(bal > 0.0004 ? t('balance_due') : t('fully_paid')) + '</span><span class="num">' + f3(bal) + ' ' + esc(t('omr')) + '</span>';
    $('nvNo').textContent = I18N.t('next_no') + ' ' + nextNumber();
    renderRemind(bal);
    return tt;
  }
  function nextNumber() {
    return isQuote() ? (S().settings.quotePrefix || 'QT') + '-' + String((S().qcounter || 0) + 1).padStart(5, '0')
                     : (S().settings.prefix || 'INV') + '-' + String((S().counter || 0) + 1).padStart(5, '0');
  }

  /* The payment reminder: shown only when part of the bill stays unpaid. The default date comes from Settings (3 days). */
  var REMIND_DAYS = [1, 2, 3, 7, 14];
  function renderRemind(bal) {
    var show = !isQuote() && bal > 0.0004;
    $('nvRemindBox').hidden = !show;
    if (!show) { $('nvRemindOn').value = ''; remindTouched = false; markQuick(); return; }
    if (!remindTouched && !$('nvRemindOn').value) {
      var n = Number(S().settings.remindDays);
      if (n > 0) $('nvRemindOn').value = ymd(addDays(n));
    }
    markQuick();
  }
  function markQuick() {
    var v = $('nvRemindOn').value;
    document.querySelectorAll('#nvRemindQuick button').forEach(function (b) {
      var on = b.dataset.d === '0' ? !v : v === ymd(addDays(Number(b.dataset.d)));
      b.classList.toggle('active', on);
    });
  }

  /* ------------------------------------------------ cart actions */
  function addService(id) {
    var s = Store.serviceById(id); if (!s) return;
    var ex = cart.filter(function (x) { return x.sid === id; })[0];
    if (ex) ex.q = num(ex.q) + 1;
    else cart.push({ sid: s.id, cat: s.cat, n: s.n, a: s.a, unit: s.unit, ob: !!s.ob, price: s.price, q: 1 });
    renderCart();
    if (!(s.price > 0)) {                                   // amount is decided per job: jump to the price box
      var box = $('nvCart').querySelectorAll('.ci');
      var last = ex ? box[cart.indexOf(ex)] : box[box.length - 1];
      var inp = last && last.querySelector('[data-f=price]');
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  /* ------------------------------------------------ custom line modal */
  function openCustom() {
    $('clName').value = ''; $('clAmount').value = ''; $('clQty').value = '1'; $('clErr').textContent = '';
    $('clCat').innerHTML = Catalog.CATS.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === 'other' ? ' selected' : '') + '>' + esc(I18N.pick(c.en, c.ar)) + '</option>';
    }).join('');
    $('clUnit').innerHTML = Catalog.UNITS.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(I18N.pick(u.en, u.ar)) + '</option>'; }).join('');
    App.openModal('customModal');
    setTimeout(function () { $('clName').focus(); }, 50);
  }
  function addCustom() {
    var name = $('clName').value.trim(), amount = num($('clAmount').value), q = num($('clQty').value) || 1;
    if (!name) { $('clErr').textContent = t('err_desc'); return; }
    if (!(amount > 0)) { $('clErr').textContent = t('err_amount'); return; }
    cart.push({ sid: null, cat: $('clCat').value, n: name, a: name, unit: $('clUnit').value, ob: false, price: amount, q: q });
    App.closeModal('customModal'); renderCart();
  }

  /* ------------------------------------------------ customer */
  function matchCustomer() {
    var v = $('nvName').value.trim().toLowerCase();
    var c = v ? S().customers.filter(function (x) { return x.name.toLowerCase() === v; })[0] : null;
    custId = c ? c.id : null;
    if (c) {
      $('nvPhone').value = c.phone || '';
      $('nvCompany').checked = !!c.company; toggleCompany();
      $('nvCVat').value = c.vatNo || ''; $('nvAddr').value = c.addr || '';
    }
    $('nvSaveCustWrap').style.display = (!c && v) ? 'flex' : 'none';
  }
  function toggleCompany() { $('nvB2b').style.display = $('nvCompany').checked ? 'grid' : 'none'; }

  /* ------------------------------------------------ save */
  function build() {
    var s = S().settings, tt = calc();
    var items = cart.map(function (it) {
      return { sid: it.sid, cat: it.cat, n: it.n, a: it.a, unit: it.unit, ob: !!it.ob, price: r3(num(it.price)), q: num(it.q) };
    });
    var quote = isQuote(), car = kind === 'repair' || quote;
    var paid = quote ? 0 : Math.min(r3(num($('nvPaid').value)), tt.total);
    var d = new Date();
    var date = $('nvDate').value || ymd(d);
    var company = $('nvCompany').checked;
    var doc = {
      date: date, time: hm(d),
      customerId: custId, customerName: $('nvName').value.trim() || t('walk_in'),
      customerPhone: $('nvPhone').value.trim(),
      customerVat: company ? $('nvCVat').value.trim() : '', customerAddr: company ? $('nvAddr').value.trim() : '', company: company,
      kind: kind,
      plate: car ? $('nvPlate').value.trim() : '', car: car ? $('nvCar').value.trim() : '', color: car ? $('nvColor').value.trim() : '',
      km: car ? $('nvKm').value.replace(/\D/g, '') : '', vin: car ? $('nvVin').value.trim() : '', claim: car ? $('nvClaim').value.trim() : '',
      fault: car ? $('nvFault').value.trim() : '',
      items: items, discount: tt.disc, vatPct: tt.vatPct, vat: tt.vat, office: tt.office, behalf: tt.behalf, total: tt.total,
      payments: paid > 0 ? [{ date: date, amount: paid, method: $('nvPay').value }] : [],
      note: $('nvNote').value.trim(), void: false,
      cr: s.cr, vatNo: s.vatNo
    };
    if (quote) { doc.validUntil = $('nvValid').value || ''; doc.status = 'open'; doc.convertedTo = ''; }
    else {
      doc.due = kind === 'repair' ? $('nvDue').value : ''; doc.job = kind === 'repair' ? 'received' : 'delivered';
      doc.remindOn = r3(tt.total - paid) > 0.0004 ? $('nvRemindOn').value : ''; doc.remindNote = ''; doc.lastReminded = '';
    }
    return doc;
  }
  /* after: 'print' | 'whatsapp' | '' */
  function save(after) {
    if (saving) return;
    if (!cart.length) { toast(t('err_no_items'), 'bad'); return; }
    var missing = cart.filter(function (it) { return !(num(it.price) > 0) || !(num(it.q) > 0); })[0];
    if (missing) { toast(t('err_enter_price', { name: nm(missing) }), 'bad'); return; }
    if (S().settings.vatOn && !S().settings.vatNo) { toast(t('err_vat_no'), 'bad'); return; }

    var inv = build(), quote = isQuote();
    var fp = JSON.stringify([inv.items, inv.customerName, inv.customerPhone, inv.kind, inv.plate, inv.car, inv.color, inv.km, inv.vin, inv.claim, inv.due, inv.validUntil, inv.remindOn, inv.fault, inv.date, inv.total, inv.payments, inv.discount, inv.note]);
    if (!saveKey || fp !== saveFp) { saveKey = uid('k'); saveFp = fp; }     // edited since the failed attempt = a different bill
    inv.clientKey = saveKey;
    var needCust = !custId && $('nvName').value.trim() && $('nvSaveCust').checked;
    var source = fromQuote;
    saving = true; setBusy(true);
    var chain = Promise.resolve();
    if (needCust) {
      var c = { id: uid('c'), name: inv.customerName, phone: inv.customerPhone, vatNo: inv.customerVat, addr: inv.customerAddr, company: inv.company, notes: '' };
      chain = Store.saveCustomer(c).then(function () { inv.customerId = c.id; });
    }
    chain.then(function () { return quote ? Store.createQuote(inv) : Store.createInvoice(inv); }).then(function (saved) {
      saveKey = null; saveFp = '';
      toast(t(quote ? 'quote_saved' : 'invoice_saved', { no: saved.number }));
      reset(true);
      App.updateBadge();
      if (source && !quote) {                                        // the quotation became a bill: mark it accepted (best effort - the bill is already saved)
        Store.updateQuote(Object.assign({}, source, { status: 'accepted', convertedTo: saved.number })).then(function () { App.updateBadge(); }, function () { /* the owner can mark it by hand */ });
      }
      if (after === 'print') Print.invoice(saved);
      else if (after === 'whatsapp') Whatsapp.open(saved);
    }).catch(function (e) { toast(App.errText(e), 'bad'); })
      .then(function () { saving = false; setBusy(false); });
  }
  function setBusy(b) { document.querySelectorAll('#view-new .btn').forEach(function (x) { x.disabled = b; }); }

  function reset(silent) {
    if (!silent && cart.length && !confirm(t('confirm_clear'))) return;
    cart = []; custId = null; payTouched = false; remindTouched = false; saveKey = null; saveFp = ''; fromQuote = null;
    ['nvName', 'nvPhone', 'nvCVat', 'nvAddr', 'nvPlate', 'nvCar', 'nvColor', 'nvKm', 'nvVin', 'nvClaim', 'nvFault', 'nvDue', 'nvValid', 'nvNote', 'nvRemindOn'].forEach(function (id) { $(id).value = ''; });
    $('nvDisc').value = ''; $('nvCompany').checked = false; toggleCompany();
    $('nvSaveCust').checked = true; $('nvSaveCustWrap').style.display = 'none';
    $('nvDate').value = ymd(); $('nvPay').value = 'cash'; kind = 'repair';
    renderKind(); renderCart();
  }

  /* Turn a quotation into a bill: the screen is filled from the quotation, the owner checks it and saves. */
  function loadFromQuote(q) {
    reset(true);
    fromQuote = q; kind = 'repair';
    $('nvName').value = q.customerName; matchCustomer();
    if (!custId) { $('nvPhone').value = q.customerPhone || ''; $('nvCompany').checked = !!q.company; toggleCompany(); $('nvCVat').value = q.customerVat || ''; $('nvAddr').value = q.customerAddr || ''; }
    $('nvPlate').value = q.plate || ''; $('nvCar').value = q.car || ''; $('nvColor').value = q.color || ''; $('nvKm').value = q.km || '';
    $('nvVin').value = q.vin || ''; $('nvClaim').value = q.claim || ''; $('nvFault').value = q.fault || ''; $('nvNote').value = q.note || '';
    cart = q.items.map(function (it) { return { sid: it.sid, cat: it.cat, n: it.n, a: it.a, unit: it.unit, ob: !!it.ob, price: it.price, q: it.q }; });
    $('nvDisc').value = q.discount > 0 ? String(q.discount) : '';
    renderKind(); renderCart();
  }

  /* open the screen already set to "quotation" (the button on the Quotations page) */
  function startQuote() { reset(true); kind = 'quote'; renderKind(); calc(); }

  /* ------------------------------------------------ wiring */
  function init() {
    $('nvKind').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; kind = b.dataset.kind; renderKind(); calc();
    });
    $('nvCats').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; curCat = b.dataset.cat; renderCats(); renderGrid();
    });
    $('nvSearch').addEventListener('input', renderGrid);
    $('nvGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.svc'); if (!b) return;
      if (b.dataset.custom) openCustom(); else addService(b.dataset.sid);
    });
    $('nvCart').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var row = b.closest('.ci'), i = Number(row.dataset.i), it = cart[i]; if (!it) return;
      if (b.dataset.act === 'del') cart.splice(i, 1);
      else if (b.dataset.act === 'inc') it.q = num(it.q) + 1;
      else if (b.dataset.act === 'dec') { it.q = num(it.q) - 1; if (it.q <= 0) cart.splice(i, 1); }
      renderCart();
    });
    $('nvCart').addEventListener('input', function (e) {
      var f = e.target.dataset.f; if (!f) return;
      var row = e.target.closest('.ci'), it = cart[Number(row.dataset.i)]; if (!it) return;
      it[f] = e.target.value === '' ? 0 : num(e.target.value);
      row.querySelector('[data-lt]').textContent = f3(Calc.line(it));
      calc();
    });
    // suggestion lists (our own, so they look right and can be scrolled with a normal scrollbar)
    Combo.attach($('nvName'), function () { return S().customers.map(function (c) { return c.name; }); });
    Combo.attach($('nvCar'), function () { return Catalog.MAKES.map(function (m) { return I18N.pick(m[0], m[1]); }); });
    $('nvName').addEventListener('input', matchCustomer);
    $('nvName').addEventListener('change', matchCustomer);
    $('nvCompany').addEventListener('change', toggleCompany);
    $('nvDisc').addEventListener('input', calc);
    $('nvPaid').addEventListener('input', function () { payTouched = true; calc(); });
    $('nvPayFull').addEventListener('click', function () { payTouched = false; calc(); });
    $('nvPayNone').addEventListener('click', function () { payTouched = true; $('nvPaid').value = '0.000'; calc(); });
    $('nvRemindQuick').innerHTML = '<button type="button" data-d="0">' + esc(t('remind_none')) + '</button>' + REMIND_DAYS.map(function (n) { return '<button type="button" data-d="' + n + '">' + esc(t('rd_' + n)) + '</button>'; }).join('');
    $('nvRemindQuick').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      remindTouched = true; $('nvRemindOn').value = b.dataset.d === '0' ? '' : ymd(addDays(Number(b.dataset.d))); markQuick();
    });
    $('nvRemindOn').addEventListener('input', function () { remindTouched = true; markQuick(); });
    $('nvSave').addEventListener('click', function () { save('print'); });
    $('nvSaveWa').addEventListener('click', function () { save('whatsapp'); });
    $('nvSaveOnly').addEventListener('click', function () { save(''); });
    $('nvClear').addEventListener('click', function () { reset(false); });
    $('clAdd').addEventListener('click', addCustom);
    $('clName').addEventListener('keydown', function (e) { if (e.key === 'Enter') addCustom(); });
    $('nvDate').value = ymd();
  }

  function refresh() {
    $('nvRemindQuick').innerHTML = '<button type="button" data-d="0">' + esc(t('remind_none')) + '</button>' + REMIND_DAYS.map(function (n) { return '<button type="button" data-d="' + n + '">' + esc(t('rd_' + n)) + '</button>'; }).join('');
    renderKind(); renderCats(); renderGrid(); renderCart();
    $('nvDate').max = ymd();
  }
  function focusSearch() { $('nvSearch').focus(); }

  window.NewInvoice = { init: init, refresh: refresh, calc: calc, focusSearch: focusSearch, hasItems: function () { return cart.length > 0; }, fromQuote: loadFromQuote, startQuote: startQuote };
})();
