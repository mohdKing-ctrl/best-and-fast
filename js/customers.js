/* customers.js - customer list with what each one owes, statements, add / edit / delete. */
(function () {
  'use strict';

  var editing = null;
  var busy = false;

  function t(k, v) { return I18N.t(k, v); }

  function invoicesOf(c) {
    return Store.s.invoices.filter(function (i) {
      return !i.void && (i.customerId === c.id || (!i.customerId && i.customerName.toLowerCase() === c.name.toLowerCase()));
    });
  }
  function figures(c) {
    var billed = 0, paid = 0, list = invoicesOf(c);
    list.forEach(function (i) { billed += i.total; paid += Calc.paid(i); });
    return { n: list.length, billed: r3(billed), paid: r3(paid), bal: r3(billed - paid) };
  }

  function render() {
    var q = $('cuSearch').value.toLowerCase().trim();
    var list = Store.s.customers.filter(function (c) {
      return !q || (c.name + ' ' + (c.phone || '') + ' ' + (c.vatNo || '')).toLowerCase().indexOf(q) !== -1;
    }).map(function (c) { return { c: c, f: figures(c) }; })
      .sort(function (a, b) { return b.f.bal - a.f.bal || a.c.name.localeCompare(b.c.name); });

    var owed = 0, billed = 0;
    Store.s.customers.forEach(function (c) { var f = figures(c); owed += f.bal; billed += f.billed; });
    $('cuStats').innerHTML =
      '<div class="stat"><div class="ic c-info">&#128101;</div><div><div class="l">' + esc(t('s_customers')) + '</div><div class="v">' + Store.s.customers.length + '</div></div></div>' +
      '<div class="stat"><div class="ic c-brand">&#128176;</div><div><div class="l">' + esc(t('s_billed')) + '</div><div class="v num">' + f3(billed) + ' <small>' + esc(t('omr')) + '</small></div></div></div>' +
      '<div class="stat"><div class="ic c-bad">&#9203;</div><div><div class="l">' + esc(t('s_outstanding')) + '</div><div class="v num">' + f3(owed) + ' <small>' + esc(t('omr')) + '</small></div></div></div>';

    if (!list.length) {
      $('cuBody').innerHTML = '<tr><td colspan="7"><div class="blank"><span class="em">&#128101;</span><b>' + esc(t('no_customers')) + '</b><small>' + esc(t('no_customers_s')) + '</small></div></td></tr>';
      return;
    }
    var admin = Store.isAdmin();
    $('cuBody').innerHTML = list.map(function (r) {
      var c = r.c, f = r.f;
      return '<tr data-id="' + esc(c.id) + '">' +
        '<td data-l="' + esc(t('customer')) + '"><b>' + esc(c.name) + '</b> ' + (c.company ? '<span class="chip c-brand">' + esc(t('company')) + '</span> ' : '') + (c.demo ? '<span class="chip c-gold">' + esc(t('demo_tag')) + '</span>' : '') +
          (c.notes ? '<div class="mini">' + esc(c.notes) + '</div>' : '') + '</td>' +
        '<td data-l="' + esc(t('phone')) + '"><span class="ltr">' + esc(c.phone || '-') + '</span></td>' +
        '<td data-l="' + esc(t('vat_no')) + '"><span class="ltr">' + esc(c.vatNo || '-') + '</span></td>' +
        '<td class="num" data-l="' + esc(t('s_invoices')) + '">' + f.n + '</td>' +
        '<td class="money num" data-l="' + esc(t('s_billed')) + '">' + f3(f.billed) + '</td>' +
        '<td class="money num" data-l="' + esc(t('balance')) + '" style="color:' + (f.bal > 0.0004 ? 'var(--bad)' : 'var(--ok)') + '">' + f3(f.bal) + '</td>' +
        '<td data-l=""><div class="acts">' +
          '<button class="iconbtn" data-act="invoices" title="' + esc(t('view_invoices')) + '">&#128203;</button>' +
          '<button class="iconbtn" data-act="statement" title="' + esc(t('statement')) + '">&#128424;</button>' +
          '<button class="iconbtn" data-act="edit" title="' + esc(t('edit')) + '">&#9998;</button>' +
          (admin ? '<button class="iconbtn d" data-act="del" title="' + esc(t('delete')) + '">&#128465;</button>' : '') +
        '</div></td></tr>';
    }).join('');
  }

  function openForm(id) {
    editing = id ? Store.customerById(id) : null;
    var c = editing || {};
    $('cmTitle').textContent = t(editing ? 'edit_customer' : 'add_customer');
    $('cmName').value = c.name || ''; $('cmPhone').value = c.phone || '';
    $('cmCompany').checked = c.company !== undefined ? !!c.company : true;
    $('cmVat').value = c.vatNo || ''; $('cmAddr').value = c.addr || ''; $('cmNotes').value = c.notes || '';
    $('cmErr').textContent = '';
    App.openModal('custModal');
    setTimeout(function () { $('cmName').focus(); }, 50);
  }
  function saveForm() {
    if (busy) return;
    var name = $('cmName').value.trim();
    if (!name) { $('cmErr').textContent = t('err_name'); return; }
    var dup = Store.s.customers.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase() && (!editing || x.id !== editing.id); })[0];
    if (dup) { $('cmErr').textContent = t('err_dup_customer'); return; }
    var doc = {
      id: editing ? editing.id : uid('c'), name: name, phone: $('cmPhone').value.trim(), company: $('cmCompany').checked,
      vatNo: $('cmVat').value.trim(), addr: $('cmAddr').value.trim(), notes: $('cmNotes').value.trim()
    };
    if (editing && editing.demo) doc.demo = true;
    busy = true;
    Store.saveCustomer(doc).then(function () {
      App.closeModal('custModal'); toast(t('saved')); render(); NewInvoice.refresh();
    }).catch(function (e) { $('cmErr').textContent = App.errText(e); }).then(function () { busy = false; });
  }
  function remove(id) {
    var c = Store.customerById(id); if (!c) return;
    if (!confirm(t('confirm_del_customer', { name: c.name }))) return;
    Store.removeCustomer(id).then(function () { toast(t('deleted')); render(); NewInvoice.refresh(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  function init() {
    $('cuSearch').addEventListener('input', render);
    $('cuAdd').addEventListener('click', function () { openForm(null); });
    $('cmSave').addEventListener('click', saveForm);
    $('cuBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.closest('tr').dataset.id, c = Store.customerById(id);
      if (b.dataset.act === 'edit') openForm(id);
      else if (b.dataset.act === 'del') remove(id);
      else if (b.dataset.act === 'statement') Print.statement(c);
      else if (b.dataset.act === 'invoices') { Invoices.showFor(c.name); App.show('invoices'); }
    });
  }
  window.Customers = { init: init, refresh: render };
})();
