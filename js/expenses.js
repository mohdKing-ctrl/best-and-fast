/* expenses.js - the garage's expenses (المصروفات), kept per section (accident repair, painting, mechanical,
   used parts, other) plus "General" for costs of the whole garage (rent, electricity, wages ...).
   Owner only. The Reports page compares them with the income of each section. */
(function () {
  'use strict';

  var editing = null, busy = false;

  function t(k, v) { return I18N.t(k, v); }
  function secName(id) { var c = Catalog.expSection(id); return c.ic + ' ' + I18N.pick(c.en, c.ar); }
  function typeName(v) {                         // a stored type that is one of the suggestions is shown in the current language
    var m = Catalog.EXPENSE_TYPES.filter(function (x) { return x[0] === v || x[1] === v; })[0];
    return m ? I18N.pick(m[0], m[1]) : v;
  }

  function filtered() {
    var q = $('exSearch').value.toLowerCase().trim(), sec = $('exSection').value, from = $('exFrom').value, to = $('exTo').value;
    return Store.s.expenses.filter(function (x) {
      if (sec && x.section !== sec) return false;
      if (from && x.date < from) return false;
      if (to && x.date > to) return false;
      if (q && [x.desc, x.type, x.note, typeName(x.type)].join(' ').toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); });
  }
  function stat(ic, cls, l, v) {
    return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="l">' + esc(l) + '</div><div class="v num">' + v + '</div></div></div>';
  }
  function render() {
    // the section filter lists every section, then "General"
    var cur = $('exSection').value;
    $('exSection').innerHTML = '<option value="">' + esc(t('all_sections')) + '</option>' + Catalog.expSections().map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.ic + ' ' + I18N.pick(c.en, c.ar)) + '</option>';
    }).join('');
    $('exSection').value = cur;
    $('exReset').classList.toggle('hasfilter', !!($('exSearch').value.trim() || $('exSection').value || $('exFrom').value || $('exTo').value));

    var list = filtered(), total = 0, by = {};
    list.forEach(function (x) { total += x.amount; by[x.section] = (by[x.section] || 0) + x.amount; });
    total = r3(total);
    var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
    $('exStats').innerHTML =
      stat('&#128184;', 'c-bad', t('x_total'), f3(total) + ' <small>' + esc(t('omr')) + '</small>') +
      stat('&#129534;', 'c-info', t('x_count'), list.length) +
      stat('&#127970;', 'c-gold', t('x_top_section'), top ? esc(Catalog.expSection(top).ic + ' ' + I18N.pick(Catalog.expSection(top).en, Catalog.expSection(top).ar)) : '-');

    var secs = Catalog.expSections().filter(function (c) { return by[c.id]; }).map(function (c) { return { l: c.ic + ' ' + I18N.pick(c.en, c.ar), v: by[c.id] }; }).sort(function (a, b) { return b.v - a.v; });
    var max = secs.length ? secs[0].v : 1;
    $('exBars').innerHTML = secs.length ? '<div class="bars">' + secs.map(function (r) {
      return '<div class="bar"><div class="top"><span>' + esc(r.l) + '</span><span>' + f3(r.v) + '</span></div><div class="track"><div class="fill gold" style="width:' + Math.max(1, r.v / max * 100) + '%"></div></div></div>';
    }).join('') + '</div>' : '<div class="blank"><b>' + esc(t('no_data')) + '</b></div>';

    if (!list.length) {
      $('exBody').innerHTML = '<tr><td colspan="7"><div class="blank"><span class="em">&#128184;</span><b>' + esc(t('no_expenses')) + '</b><small>' + esc(t('no_expenses_s')) + '</small></div></td></tr>';
      return;
    }
    $('exBody').innerHTML = list.map(function (x) {
      return '<tr data-id="' + esc(x.id) + '">' +
        '<td data-l="' + esc(t('date')) + '">' + fdate(x.date) + '</td>' +
        '<td data-l="' + esc(t('category')) + '"><span class="chip c-brand">' + esc(secName(x.section)) + '</span></td>' +
        '<td data-l="' + esc(t('expense_type')) + '">' + esc(typeName(x.type)) + '</td>' +
        '<td data-l="' + esc(t('description')) + '">' + esc(x.desc) + (x.note ? '<div class="mini">' + esc(x.note) + '</div>' : '') + (x.demo ? ' <span class="chip c-gold">' + esc(t('demo_tag')) + '</span>' : '') + '</td>' +
        '<td data-l="' + esc(t('pay_method')) + '">' + esc(t('pay_' + x.method)) + '</td>' +
        '<td class="money num" data-l="' + esc(t('amount')) + '">' + f3(x.amount) + '</td>' +
        '<td data-l=""><div class="acts"><button class="iconbtn" data-act="edit" title="' + esc(t('edit')) + '">&#9998;</button>' +
        '<button class="iconbtn d" data-act="del" title="' + esc(t('delete')) + '">&#128465;</button></div></td></tr>';
    }).join('');
  }

  function openForm(id) {
    editing = id ? Store.expenseById(id) : null;
    var x = editing || { date: ymd(), section: $('exSection').value || 'general', type: '', desc: '', amount: '', method: 'cash', note: '' };
    $('exmTitle').textContent = t(editing ? 'edit_expense' : 'add_expense');
    $('exmSection').innerHTML = Catalog.expSections().map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.ic + ' ' + I18N.pick(c.en, c.ar)) + '</option>'; }).join('');
    $('exmDate').value = x.date; $('exmDate').max = ymd(); $('exmSection').value = x.section; $('exmType').value = typeName(x.type); $('exmDesc').value = x.desc;
    $('exmAmount').value = x.amount > 0 ? f3(x.amount) : ''; $('exmMethod').value = x.method; $('exmNote').value = x.note; $('exmErr').textContent = '';
    App.openModal('exModal');
    setTimeout(function () { $('exmAmount').focus(); }, 50);
  }
  function saveForm() {
    if (busy) return;
    var amount = r3(num($('exmAmount').value));
    if (!$('exmDate').value) { $('exmErr').textContent = t('err_date'); return; }
    if (!(amount > 0)) { $('exmErr').textContent = t('err_amount'); return; }
    var typed = $('exmType').value.trim();
    var doc = { id: editing ? editing.id : uid('e'), date: $('exmDate').value, section: $('exmSection').value, type: typed, desc: $('exmDesc').value.trim(),
      amount: amount, method: $('exmMethod').value, note: $('exmNote').value.trim(), createdBy: editing ? editing.createdBy : (Store.s.user ? Store.s.user.name : '') };
    if (editing && editing.demo) doc.demo = true;
    busy = true;
    Store.saveExpense(doc).then(function () { App.closeModal('exModal'); toast(t('saved')); render(); })
      .catch(function (e) { $('exmErr').textContent = App.errText(e); }).then(function () { busy = false; });
  }
  function remove(id) {
    var x = Store.expenseById(id); if (!x) return;
    if (!confirm(t('confirm_del_expense', { amount: f3(x.amount), desc: x.desc || typeName(x.type) }))) return;
    Store.removeExpense(id).then(function () { toast(t('deleted')); render(); App.refreshDemoBar(); }).catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  function exportXlsx() {
    var list = filtered().slice().reverse();
    if (!list.length) { toast(t('nothing_export'), 'bad'); return; }
    var X = XLSX.S, tot = 0;
    var rows = [['date', 'category', 'expense_type', 'description', 'pay_method', 'amount', 'note'].map(function (k) { return { v: t(k), s: X.HEAD }; })];
    list.forEach(function (x) {
      tot += x.amount;
      var c = Catalog.expSection(x.section);
      rows.push([x.date, I18N.pick(c.en, c.ar), typeName(x.type), x.desc, t('pay_' + x.method), { v: x.amount, s: X.MONEY }, x.note]);
    });
    rows.push([]); rows.push([{ v: t('grand_total'), s: X.HEAD }, '', '', '', '', { v: r3(tot), s: X.MONEY_B }]);
    var by = {}; list.forEach(function (x) { by[x.section] = (by[x.section] || 0) + x.amount; });
    var secRows = [[t('category'), t('amount') + ' (OMR)'].map(function (k) { return { v: k, s: X.HEAD }; })]
      .concat(Catalog.expSections().filter(function (c) { return by[c.id]; }).map(function (c) { return [I18N.pick(c.en, c.ar), { v: r3(by[c.id]), s: X.MONEY }]; }));
    XLSX.save('Best-and-Fast_Expenses_' + stamp() + '.xlsx', [
      { name: t('nav_expenses'), rows: rows, cols: [12, 24, 22, 34, 14, 12, 26], headerRows: 1, rtl: I18N.isRTL() },
      { name: t('sheet_by_category'), rows: secRows, cols: [30, 16], headerRows: 1, rtl: I18N.isRTL() }
    ]);
    toast(t('excel_saved_x', { n: list.length }));
  }

  function init() {
    ['exSearch'].forEach(function (id) { $(id).addEventListener('input', render); });
    ['exSection', 'exFrom', 'exTo'].forEach(function (id) { $(id).addEventListener('change', render); });
    $('exReset').addEventListener('click', function () { $('exSearch').value = ''; $('exSection').value = ''; $('exFrom').value = ''; $('exTo').value = ''; render(); });
    $('exAdd').addEventListener('click', function () { openForm(null); });
    $('exExport').addEventListener('click', exportXlsx);
    $('exmSave').addEventListener('click', saveForm);
    $('exmAmount').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveForm(); });
    Combo.attach($('exmType'), function () { return Catalog.EXPENSE_TYPES.map(function (x) { return I18N.pick(x[0], x[1]); }); });
    $('exBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.closest('tr').dataset.id;
      if (b.dataset.act === 'edit') openForm(id); else remove(id);
    });
  }

  window.Expenses = { init: init, refresh: render };
})();
