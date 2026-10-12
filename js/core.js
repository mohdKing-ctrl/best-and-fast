/* core.js - small helpers and the one place where money is calculated. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* Money is kept to the baisa (3 decimals). */
  var r3 = function (n) { return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000; };
  var f3 = function (n) { return r3(n || 0).toFixed(3); };
  var num = function (v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };

  /* Local dates (not UTC) so an invoice made at 1 AM in Oman gets today's date. */
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var ymd = function (d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var hm = function (d) { d = d || new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var addDays = function (n, from) { var d = from ? new Date(from) : new Date(); d.setDate(d.getDate() + n); return d; };
  var fdate = function (s) { var p = String(s || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : (s || ''); };
  var stamp = function () { var d = new Date(); return ymd(d) + '_' + pad(d.getHours()) + pad(d.getMinutes()); };

  var uid = function (prefix) {
    var rnd = '';
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(6); crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) rnd += a[i].toString(36).padStart(2, '0');
    } else { rnd = Math.random().toString(36).slice(2, 12); }
    return (prefix || 'x') + '-' + Date.now().toString(36) + rnd;
  };

  function download(filename, content, mime) {
    var blob = new Blob(['﻿' + content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  var toastTimer;
  function toast(msg, kind) {
    var t = $('toast');
    t.innerHTML = '<span>' + (kind === 'bad' ? '&#9888;' : '&#10004;') + '</span> ' + esc(msg);
    t.className = 'toast show' + (kind === 'bad' ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, kind === 'bad' ? 4200 : 2400);
  }

  /* ---------------------------------------------------------------
     Invoice maths.  Two kinds of line:
       - office services (commission, weighbridge, logistics ...): VAT applies
       - paid on behalf of the customer (customs duty, government permit fees):
         passed through at cost, no VAT, never discounted
     VAT is only added when the business is VAT registered.
     --------------------------------------------------------------- */
  var Calc = {
    line: function (it) { return r3(num(it.price) * num(it.q)); },
    totals: function (items, discount, vatOn, vatPct) {
      var office = 0, behalf = 0, pieces = 0;
      (items || []).forEach(function (it) {
        var lt = Calc.line(it);
        if (it.ob) behalf += lt; else office += lt;
        pieces += num(it.q);
      });
      office = r3(office); behalf = r3(behalf);
      var disc = Math.min(Math.max(num(discount), 0), office);
      var base = r3(office - disc);
      var pct = vatOn ? num(vatPct) : 0;
      var vat = r3(base * pct / 100);
      return {
        office: office, behalf: behalf, disc: r3(disc), base: base,
        vatPct: pct, vat: vat, total: r3(base + vat + behalf), pieces: pieces,
        gross: r3(office + behalf)
      };
    },
    paid: function (inv) {
      return r3((inv.payments || []).reduce(function (t, p) { return t + num(p.amount); }, 0));
    },
    balance: function (inv) { return r3(num(inv.total) - Calc.paid(inv)); },
    payStatus: function (inv) {
      var paid = Calc.paid(inv), bal = r3(num(inv.total) - paid);
      if (bal <= 0.0004) return 'paid';
      return paid > 0 ? 'partial' : 'unpaid';
    }
  };

  window.$ = $; window.esc = esc; window.r3 = r3; window.f3 = f3; window.num = num;
  window.fdate = fdate; window.ymd = ymd; window.hm = hm; window.addDays = addDays; window.stamp = stamp; window.uid = uid;
  window.download = download; window.toast = toast; window.Calc = Calc;
})();
