/* reports.js - totals for a chosen period: what was billed, collected, owed, and where the money came from. */
(function () {
  'use strict';

  var period = 'month';

  function t(k, v) { return I18N.t(k, v); }

  function range() {
    var today = ymd(), d = new Date();
    switch (period) {
      case 'today':     return [today, today];
      case 'yesterday': var y = ymd(addDays(-1)); return [y, y];
      case 'week':      return [ymd(addDays(-6)), today];
      case 'month':     return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), today];
      case 'all':       return ['0000-00-00', '9999-99-99'];
      default:          return [$('rpFrom').value || '0000-00-00', $('rpTo').value || '9999-99-99'];
    }
  }

  function collect() {
    var r = range(), out = {
      list: [], billed: 0, base: 0, vat: 0, disc: 0, paid: 0, cats: {}, inc: {}, exp: {}, expTotal: 0, custs: {}, days: {}, methods: {}, workers: {}, stages: {}
    };
    Store.s.invoices.forEach(function (i) {
      if (i.void || i.date < r[0] || i.date > r[1]) return;
      out.list.push(i);
      var p = Calc.paid(i);
      out.billed += i.total; out.vat += i.vat || 0; out.disc += i.discount || 0;
      out.base += (i.office || 0) + (i.behalf || 0) - (i.discount || 0); out.paid += p;
      i.items.forEach(function (it) { var cid = Catalog.cat(it.cat).id; out.cats[cid] = (out.cats[cid] || 0) + Calc.line(it); });
      var gross = (i.office || 0) + (i.behalf || 0), ratio = gross > 0 ? (gross - (i.discount || 0)) / gross : 0;   // income per section, after the bill's discount
      i.items.forEach(function (it) { var c2 = Catalog.cat(it.cat).id; out.inc[c2] = (out.inc[c2] || 0) + Calc.line(it) * ratio; });
      var key = i.customerId || i.customerName;
      var c = out.custs[key] || (out.custs[key] = { name: i.customerName, n: 0, billed: 0, paid: 0 });
      c.n++; c.billed += i.total; c.paid += p;
      out.days[i.date] = (out.days[i.date] || 0) + i.total;
      (i.payments || []).forEach(function (x) { out.methods[x.method] = (out.methods[x.method] || 0) + num(x.amount); });
      var wk = i.createdBy || '-';
      var w = out.workers[wk] || (out.workers[wk] = { name: wk, n: 0, billed: 0 });
      w.n++; w.billed += i.total;
      if (i.kind !== 'parts') out.stages[i.job] = (out.stages[i.job] || 0) + 1;
    });
    Store.s.expenses.forEach(function (x) {
      if (x.date < r[0] || x.date > r[1]) return;
      out.exp[x.section] = (out.exp[x.section] || 0) + x.amount; out.expTotal += x.amount;
    });
    ['billed', 'base', 'vat', 'disc', 'paid', 'expTotal'].forEach(function (k) { out[k] = r3(out[k]); });
    return out;
  }

  function stat(ic, cls, l, v) {
    return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="l">' + esc(l) + '</div><div class="v num">' + v + ' <small>' + esc(t('omr')) + '</small></div></div></div>';
  }
  function bars(rows, gold) {
    if (!rows.length) return '<div class="blank"><b>' + esc(t('no_data')) + '</b></div>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
    return '<div class="bars">' + rows.map(function (r) {
      return '<div class="bar"><div class="top"><span>' + esc(r.l) + '</span><span>' + (r.txt !== undefined ? r.txt : f3(r.v)) + (r.extra || '') + '</span></div>' +
        '<div class="track"><div class="fill' + (r.gold || gold ? ' gold' : '') + '" style="width:' + Math.max(1, r.v / max * 100) + '%"></div></div></div>';
    }).join('') + '</div>';
  }

  /* income of each section (bills, after discount) against its expenses; "General" expenses have no income of their own */
  function profitRows(d) {
    return Catalog.expSections().map(function (c) {
      var inc = r3(d.inc[c.id] || 0), exp = r3(d.exp[c.id] || 0);
      return { c: c, inc: inc, exp: exp, net: r3(inc - exp) };
    }).filter(function (r) { return r.inc || r.exp; });
  }
  function profitTable(d) {
    var rows = profitRows(d);
    if (!rows.length) return '<div class="blank"><b>' + esc(t('no_data')) + '</b></div>';
    var ti = 0, te = 0;
    var body = rows.map(function (r) {
      ti += r.inc; te += r.exp;
      return '<tr><td><b>' + esc(r.c.ic + ' ' + I18N.pick(r.c.en, r.c.ar)) + '</b></td><td class="num">' + f3(r.inc) + '</td><td class="num">' + f3(r.exp) + '</td><td class="money num" style="color:' + (r.net >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + f3(r.net) + '</td></tr>';
    }).join('');
    var tn = r3(ti - te);
    return '<table class="profit"><thead><tr><th>' + esc(t('category')) + '</th><th>' + esc(t('r_income')) + '</th><th>' + esc(t('r_expenses')) + '</th><th>' + esc(t('r_net_short')) + '</th></tr></thead><tbody>' + body +
      '</tbody><tfoot><tr><td><b>' + esc(t('grand_total')) + '</b></td><td class="num"><b>' + f3(ti) + '</b></td><td class="num"><b>' + f3(te) + '</b></td><td class="money num" style="color:' + (tn >= 0 ? 'var(--ok)' : 'var(--bad)') + '"><b>' + f3(tn) + '</b></td></tr></tfoot></table>';
  }

  function render() {
    document.querySelectorAll('#rpPeriods button').forEach(function (b) { b.classList.toggle('active', b.dataset.p === period); });
    $('rpCustom').style.display = period === 'custom' ? 'flex' : 'none';
    var d = collect(), vatOn = !!Store.s.settings.vatOn;

    $('rpStats').innerHTML =
      stat('&#128203;', 'c-info', t('s_invoices'), d.list.length).replace(' <small>' + esc(t('omr')) + '</small>', '') +
      stat('&#128176;', 'c-brand', t('s_billed'), f3(d.billed)) +
      stat('&#128188;', 'c-ok', t('r_office_net'), f3(d.base)) +
      (vatOn ? stat('&#129534;', 'c-info', t('vat'), f3(d.vat)) : '') +
      stat('&#128184;', 'c-bad', t('r_expenses'), f3(d.expTotal)) +
      stat('&#128200;', d.base - d.expTotal >= 0 ? 'c-ok' : 'c-bad', t('r_net'), f3(d.base - d.expTotal)) +
      stat('&#9989;', 'c-ok', t('s_collected'), f3(d.paid)) +
      stat('&#9203;', 'c-bad', t('s_outstanding'), f3(d.billed - d.paid));

    $('rpCatBars').innerHTML = bars(Catalog.CATS.filter(function (c) { return d.cats[c.id]; }).map(function (c) {
      return { l: c.ic + ' ' + I18N.pick(c.en, c.ar), v: d.cats[c.id] };
    }).sort(function (a, b) { return b.v - a.v; }));

    var days = Object.keys(d.days).sort().slice(-31);
    var maxd = Math.max.apply(null, days.map(function (k) { return d.days[k]; }).concat([1]));
    $('rpDays').innerHTML = days.length ? days.map(function (k) {
      return '<div class="col"><span class="val">' + Math.round(d.days[k]) + '</span><div class="b" style="height:' + Math.max(2, d.days[k] / maxd * 100) + '%"></div><small>' + k.slice(8) + '/' + k.slice(5, 7) + '</small></div>';
    }).join('') : '<div class="blank" style="width:100%"><b>' + esc(t('no_data')) + '</b></div>';

    var custs = Object.keys(d.custs).map(function (k) { return d.custs[k]; }).sort(function (a, b) { return b.billed - a.billed; }).slice(0, 8);
    $('rpCusts').innerHTML = bars(custs.map(function (c) {
      var bal = r3(c.billed - c.paid);
      return { l: c.name + ' (' + c.n + ')', v: c.billed, extra: bal > 0.0004 ? ' &middot; <span style="color:var(--bad)">' + esc(t('balance')) + ' ' + f3(bal) + '</span>' : '' };
    }));
    $('rpMethods').innerHTML = bars(['cash', 'card', 'transfer', 'cheque'].filter(function (m) { return d.methods[m]; })
      .map(function (m) { return { l: t('pay_' + m), v: d.methods[m] }; }), true);
    $('rpWorkers').innerHTML = bars(Object.keys(d.workers).map(function (k) { return d.workers[k]; }).sort(function (a, b) { return b.billed - a.billed; })
      .map(function (w) { return { l: w.name + ' (' + w.n + ')', v: w.billed }; }), true);
    $('rpProfit').innerHTML = profitTable(d);
    $('rpStages').innerHTML = bars(Catalog.JOBS.filter(function (j) { return d.stages[j]; })
      .map(function (j) { return { l: t('job_' + j), v: d.stages[j], txt: String(d.stages[j]) }; }));
  }

  function exportXlsx() {
    var d = collect(), X = XLSX.S, r = range();
    if (!d.list.length) { toast(t('nothing_export'), 'bad'); return; }
    var title = [{ v: t('app_title'), s: X.TITLE }];
    var summary = [title, [{ v: t('period') + ': ' + (period === 'all' ? t('p_all') : r[0] + '  →  ' + r[1]), s: X.MUTED }], [],
      [{ v: t('item'), s: X.HEAD }, { v: t('amount') + ' (OMR)', s: X.HEAD }],
      [t('s_invoices'), d.list.length], [t('s_billed'), { v: d.billed, s: X.MONEY }], [t('r_office_net'), { v: d.base, s: X.MONEY }],
      [t('discount'), { v: d.disc, s: X.MONEY }], [t('vat'), { v: d.vat, s: X.MONEY }],
      [t('r_expenses'), { v: d.expTotal, s: X.MONEY }], [t('r_net'), { v: r3(d.base - d.expTotal), s: X.MONEY }],
      [t('s_collected'), { v: d.paid, s: X.MONEY }], [{ v: t('s_outstanding'), s: X.HEAD }, { v: r3(d.billed - d.paid), s: X.MONEY_B }]];
    var cats = [[{ v: t('category'), s: X.HEAD }, { v: t('amount') + ' (OMR)', s: X.HEAD }]]
      .concat(Catalog.CATS.filter(function (c) { return d.cats[c.id]; }).map(function (c) { return [I18N.pick(c.en, c.ar), { v: r3(d.cats[c.id]), s: X.MONEY }]; }));
    var custs = [[t('customer'), t('s_invoices'), t('s_billed'), t('paid'), t('balance')].map(function (k) { return { v: k, s: X.HEAD }; })]
      .concat(Object.keys(d.custs).map(function (k) { return d.custs[k]; }).sort(function (a, b) { return b.billed - a.billed; })
        .map(function (c) { return [c.name, c.n, { v: r3(c.billed), s: X.MONEY }, { v: r3(c.paid), s: X.MONEY }, { v: r3(c.billed - c.paid), s: X.MONEY }]; }));
    var workers = [[t('created_by'), t('s_invoices'), t('s_billed')].map(function (k) { return { v: k, s: X.HEAD }; })]
      .concat(Object.keys(d.workers).map(function (k) { return d.workers[k]; }).sort(function (a, b) { return b.billed - a.billed; })
        .map(function (w) { return [w.name, w.n, { v: r3(w.billed), s: X.MONEY }]; }));
    var daily = [[t('date'), t('s_billed')].map(function (k) { return { v: k, s: X.HEAD }; })]
      .concat(Object.keys(d.days).sort().map(function (k) { return [k, { v: r3(d.days[k]), s: X.MONEY }]; }));
    var profit = [[t('category'), t('r_income'), t('r_expenses'), t('r_net_short')].map(function (k) { return { v: k, s: X.HEAD }; })]
      .concat(profitRows(d).map(function (r) { return [I18N.pick(r.c.en, r.c.ar), { v: r.inc, s: X.MONEY }, { v: r.exp, s: X.MONEY }, { v: r.net, s: X.MONEY }]; }));
    var rtl = I18N.isRTL();
    XLSX.save('Best-and-Fast_Report_' + stamp() + '.xlsx', [
      { name: t('sheet_summary'), rows: summary, cols: [34, 18], rtl: rtl },
      { name: t('sheet_by_category'), rows: cats, cols: [34, 18], headerRows: 1, rtl: rtl },
      { name: t('sheet_by_customer'), rows: custs, cols: [34, 10, 14, 14, 14], headerRows: 1, rtl: rtl },
      { name: t('sheet_by_worker'), rows: workers, cols: [28, 10, 14], headerRows: 1, rtl: rtl },
      { name: t('sheet_profit'), rows: profit, cols: [30, 14, 14, 14], headerRows: 1, rtl: rtl },
      { name: t('sheet_daily'), rows: daily, cols: [14, 16], headerRows: 1, rtl: rtl }
    ]);
    toast(t('excel_saved', { n: d.list.length }));
  }

  function init() {
    $('rpPeriods').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { period = b.dataset.p; render(); } });
    $('rpFrom').addEventListener('change', render); $('rpTo').addEventListener('change', render);
    $('rpExport').addEventListener('click', exportXlsx);
  }
  window.Reports = { init: init, refresh: render };
})();
