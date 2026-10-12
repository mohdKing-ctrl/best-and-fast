/* store.js - all saving and loading goes through here.

   Two back ends behind one interface:
     server  -> the PHP API on Hostinger (real login, SQLite database, shared by every device)
     local   -> this browser's localStorage. Used only when there is no PHP (opening the files
                from a folder, or a plain static host). It is only a safety net: the real site always uses the server.
   The rest of the app never needs to know which one is active.
   Every write returns a Promise, so a failure always reaches the screen as a message.   */
(function () {
  'use strict';

  var API = 'api/index.php';
  var LS_KEY = 'bf_pos_demo_db_v1';

  var S = {
    mode: 'local',            // 'server' | 'local'
    user: null,               // {id, username, name, role}
    settings: Catalog.defaultSettings(),
    services: [], customers: [], invoices: [],
    counter: 0,
    features: {}              // optional features the system provider has switched on (from the server)
  };
  var hooks = { authLost: null };      // app.js sets hooks.authLost: called when the login has expired

  function err(code, status) { var e = new Error(code); e.code = code; e.status = status || 0; return e; }

  /* ------------------------------------------------ server calls */
  function call(action, body) {
    var post = body !== undefined;
    var opt = { method: post ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'bf-pos' } };
    if (post) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = null;
    if (ctl) { opt.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, (action === 'restore' || action === 'load') ? 120000 : 40000); }
    var done = function () { if (timer) clearTimeout(timer); };
    return fetch(API + '?action=' + action, opt).then(function (res) {
      return res.text().then(function (txt) {
        done();
        var j = null;
        try { j = JSON.parse(txt); } catch (e) { /* not our API */ }
        if (!j || typeof j !== 'object') throw err('no_api', res.status);
        if (!j.ok) {
          var e = err(j.error || 'server_error', res.status);
          // The login ran out (idle for a long time, or signed out on another screen): go back to the login page.
          if (e.code === 'not_logged_in' && action !== 'status' && S.mode === 'server' && hooks.authLost) hooks.authLost();
          throw e;
        }
        return j;
      });
    }, function () { done(); throw err('network'); });
  }

  /* ------------------------------------------------ local storage */
  function localSave() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        settings: S.settings, services: S.services, customers: S.customers, invoices: S.invoices, counter: S.counter
      }));
    } catch (e) { throw err('storage_full'); }
  }
  /* Run a browser-storage change; any failure (e.g. browser storage full) becomes a rejected Promise, never a crash. */
  function localOp(fn) {
    var snap = { settings: S.settings, services: S.services.slice(), customers: S.customers.slice(), invoices: S.invoices.slice(), counter: S.counter };
    try { return Promise.resolve(fn()); }
    catch (e) {                                   // nothing is half-applied: put everything back as it was
      S.settings = snap.settings; S.services = snap.services; S.customers = snap.customers; S.invoices = snap.invoices; S.counter = snap.counter;
      Catalog.setCustom(S.settings);
      return Promise.reject(e);
    }
  }
  function localLoad() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* private mode */ }
    var d = null;
    if (raw) { try { d = JSON.parse(raw); } catch (e) { d = null; } }
    if (d && d.settings) { adopt(d); return; }
    seedEmpty();
  }
  /* A brand-new system: the price list plus the example customers and bills. */
  function starter() {
    var s = Catalog.defaultSettings();
    var demo = Demo.build(s, S.user ? S.user.name : '');
    return { settings: s, services: Catalog.defaultServices(), customers: demo.customers, invoices: demo.invoices, counter: demo.counter };
  }
  function seedEmpty() {
    var d = starter();
    S.settings = d.settings; Catalog.setCustom(S.settings);
    S.services = d.services; S.customers = d.customers; S.invoices = d.invoices; S.counter = d.counter;
  }
  function adopt(d) {
    S.settings = Object.assign(Catalog.defaultSettings(), d.settings || {}); Catalog.setCustom(S.settings);
    var l = fixLists(d);
    S.services = l.services; S.customers = l.customers; S.invoices = l.invoices;
    S.counter = d.counter || 0;
  }
  function pad(n) { return (S.settings.prefix || 'INV') + '-' + String(n).padStart(5, '0'); }
  function upsert(list, doc) {
    var i = -1; list.forEach(function (x, k) { if (x.id === doc.id) i = k; });
    if (i >= 0) list[i] = doc; else list.push(doc);
  }
  function isServer() { return S.mode === 'server'; }
  /* The view-only account can look at everything and change nothing. The server enforces this;
     these checks only give a friendly message before a request is even sent. */
  function isViewer() { return !!S.user && S.user.role === 'viewer'; }
  function readOnly() { return isViewer() ? Promise.reject(err('read_only')) : null; }

  /* Records coming from the server or from a backup file are repaired once, here, so a single
     incomplete record (a missing name, a missing list...) can never break a whole screen. */
  var str = function (v) { return v === null || v === undefined ? '' : String(v); };
  var nz = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  function fixInvoice(i) {
    i.id = str(i.id); i.no = nz(i.no); i.number = str(i.number);
    i.items = (Array.isArray(i.items) ? i.items : []).map(function (it) {
      it = it || {};
      it.n = str(it.n); it.a = str(it.a); it.cat = str(it.cat); it.unit = str(it.unit); it.ob = !!it.ob; it.price = nz(it.price); it.q = nz(it.q);
      return it;
    });
    i.payments = (Array.isArray(i.payments) ? i.payments : []).filter(function (p) { return p && nz(p.amount) > 0; })
      .map(function (p) { p.amount = nz(p.amount); p.method = str(p.method) || 'cash'; p.date = str(p.date); return p; });
    ['customerName', 'customerPhone', 'customerVat', 'customerAddr', 'plate', 'car', 'color', 'km', 'due', 'fault', 'note', 'date', 'time', 'shareToken'].forEach(function (k) { i[k] = str(i[k]); });
    ['total', 'discount', 'vat', 'behalf', 'vatPct'].forEach(function (k) { i[k] = nz(i[k]); });
    i.office = i.office === undefined || i.office === null ? Math.max(0, nz(i.total) - i.vat - i.behalf + i.discount) : nz(i.office);
    if (Catalog.JOBS.indexOf(i.job) === -1) i.job = 'received';
    if (['repair', 'parts'].indexOf(i.kind) === -1) i.kind = 'repair';
    i.void = !!i.void;
    if (i.demo) i.demo = true; else delete i.demo;
    return i;
  }
  function fixCustomer(c) {
    c.id = str(c.id); c.name = str(c.name); c.phone = str(c.phone); c.vatNo = str(c.vatNo); c.addr = str(c.addr); c.notes = str(c.notes);
    if (c.demo) c.demo = true; else delete c.demo;
    return c;
  }
  function fixService(s) { s.id = str(s.id); s.n = str(s.n); s.a = str(s.a); s.cat = str(s.cat); s.unit = str(s.unit); s.price = nz(s.price); s.ob = !!s.ob; return s; }
  function fixLists(d) {
    return {
      services: (d.services || []).filter(Boolean).map(fixService),
      customers: (d.customers || []).filter(Boolean).map(fixCustomer),
      invoices: (d.invoices || []).filter(Boolean).map(fixInvoice)
    };
  }
  function hasDemo() {
    return S.customers.some(function (c) { return c.demo; }) || S.invoices.some(function (i) { return i.demo; });
  }

  /* ------------------------------------------------ boot / auth */
  /* Resolves to 'ready' | 'login' | 'setup'.  Falls back to browser-only storage when the API is not there. */
  function boot() {
    // DEMO BUILD: there is no server - everything lives in this browser
    S.mode = 'local';
    S.user = { id: 0, username: 'demo', name: 'Demo', role: 'admin' };
    localLoad();
    return Promise.resolve('ready');
  }
  function bootWithServer() {
    return call('status').then(function (st) {
      S.mode = 'server';
      if (st.setup_needed) return 'setup';
      if (!st.user) return 'login';
      S.user = st.user;
      return loadServer().then(function () { return 'ready'; });
    }, function (e) {
      // Browser-only storage is allowed ONLY when the files are opened from a folder / on this computer.
      // On a real website address a missing or broken server must be a loud error, never a quiet fallback.
      var local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
      if (local && (e.code === 'no_api' || e.code === 'network')) {
        S.mode = 'local';
        S.user = { id: 0, username: 'local', name: 'Local', role: 'admin' };
        localLoad();
        return 'ready';
      }
      throw e;
    });
  }
  function loadServer() {
    return call('load').then(function (d) {
      S.user = d.user;
      S.settings = Object.assign(Catalog.defaultSettings(), d.settings || {}); Catalog.setCustom(S.settings);
      var l = fixLists(d);
      S.services = l.services; S.customers = l.customers; S.invoices = l.invoices;
      S.counter = d.counter || 0;
      S.features = d.features || {};
      // A brand-new server install starts with the price list and the example customers / bills
      // (only the owner can write them; the owner removes the examples from Settings).
      if (!d.settings) {
        var st = starter();
        S.settings = st.settings; Catalog.setCustom(S.settings);
        S.services = st.services; S.customers = st.customers; S.invoices = st.invoices; S.counter = st.counter;
        if (d.user && d.user.role === 'admin') {
          return call('restore', { data: { settings: S.settings, services: S.services, customers: S.customers, invoices: S.invoices, counter: S.counter } })
            .then(function () { return call('load'); }).then(function (again) {
              var l2 = fixLists(again);
              S.customers = l2.customers; S.invoices = l2.invoices; S.counter = again.counter || 0;
            });
        }
        S.customers = []; S.invoices = []; S.counter = 0;
      }
    });
  }
  /* Fetch the newest data from the server (another device may have added bills). */
  function reload() { return isServer() ? loadServer() : Promise.resolve(); }

  function login(username, password) {
    return call('login', { username: username, password: password }).then(function () { return loadServer(); });
  }
  function setup(username, name, password, viewer) {
    return call('setup', { username: username, name: name, password: password, viewer: viewer || null }).then(function () { return loadServer(); });
  }
  function logout() {
    if (!isServer()) return Promise.resolve();
    return call('logout', {}).then(function () { S.user = null; });
  }

  /* ------------------------------------------------ writes */
  function saveSettings(doc) {
    var ro = readOnly(); if (ro) return ro;
    var before = S.settings;
    S.settings = Object.assign({}, S.settings, doc); Catalog.setCustom(S.settings);
    var undo = function (e) { S.settings = before; Catalog.setCustom(S.settings); throw e; };   // a failed save leaves nothing half-applied
    if (isServer()) return call('put', { col: 'settings', doc: S.settings }).catch(undo);
    return localOp(localSave).catch(undo);
  }
  function saveService(doc) {
    var ro = readOnly(); if (ro) return ro;
    if (isServer()) return call('put', { col: 'services', doc: doc }).then(function () { upsert(S.services, doc); });
    return localOp(function () { upsert(S.services, doc); localSave(); });
  }
  function removeService(id) {
    var ro = readOnly(); if (ro) return ro;
    var drop = function () { S.services = S.services.filter(function (x) { return x.id !== id; }); };
    if (isServer()) return call('del', { col: 'services', id: id }).then(drop);
    return localOp(function () { drop(); localSave(); });
  }
  function replaceServices(list) {
    var ro = readOnly(); if (ro) return ro;
    if (isServer()) return call('replace', { col: 'services', docs: list }).then(function () { S.services = list; });
    return localOp(function () { S.services = list; localSave(); });
  }
  function saveCustomer(doc) {
    var ro = readOnly(); if (ro) return ro;
    if (isServer()) return call('put', { col: 'customers', doc: doc }).then(function () { upsert(S.customers, doc); });
    return localOp(function () { upsert(S.customers, doc); localSave(); });
  }
  function removeCustomer(id) {
    var ro = readOnly(); if (ro) return ro;
    var drop = function () { S.customers = S.customers.filter(function (x) { return x.id !== id; }); };
    if (isServer()) return call('del', { col: 'customers', id: id }).then(drop);
    return localOp(function () { drop(); localSave(); });
  }
  function createInvoice(inv) {
    var ro = readOnly(); if (ro) return ro;
    if (isServer()) {
      return call('create_invoice', { doc: inv }).then(function (r) {
        var doc = fixInvoice(r.doc);
        if (!S.invoices.some(function (x) { return x.id === doc.id; })) S.invoices.push(doc);
        S.counter = r.counter; return doc;
      });
    }
    return localOp(function () {
      delete inv.clientKey;
      var n = S.counter + 1;
      inv.no = n; inv.id = String(n); inv.number = pad(n);
      inv.created = Math.floor(Date.now() / 1000); inv.createdBy = S.user ? S.user.name : '';
      S.invoices.push(inv); S.counter = n;
      try { localSave(); } catch (e) { S.invoices.pop(); S.counter = n - 1; throw e; }   // storage full: do not keep a bill that was not saved
      return inv;
    });
  }
  function updateInvoice(inv) {
    var ro = readOnly(); if (ro) return ro;
    if (isServer()) return call('put', { col: 'invoices', doc: inv }).then(function (r) { var d = fixInvoice(r.doc); upsert(S.invoices, d); return d; });
    return localOp(function () { upsert(S.invoices, inv); localSave(); return inv; });
  }
  /* The secret link the customer opens on his phone (server only). Returns the token. */
  function shareInvoice(id) {
    var inv = invoiceById(id);
    if (inv && inv.shareToken) return Promise.resolve(inv.shareToken);
    var ro = readOnly(); if (ro) return ro;
    if (!isServer()) return Promise.reject(err('no_api'));
    return call('share_invoice', { id: id }).then(function (r) { if (inv) inv.shareToken = r.token; return r.token; });
  }

  /* Permanently delete bills. Numbers are never re-used: the counter is left as it is. */
  function removeInvoices(ids) {
    var ro = readOnly(); if (ro) return ro;
    var gone = {}; ids.forEach(function (id) { gone[id] = 1; });
    var drop = function () { S.invoices = S.invoices.filter(function (i) { return !gone[i.id]; }); };
    if (isServer()) return call('del_many', { col: 'invoices', ids: ids }).then(drop);
    return localOp(function () { drop(); localSave(); });
  }

  /* Remove only the example customers and bills. Real work is never touched. */
  function removeDemo() {
    var ro = readOnly(); if (ro) return ro;
    var drop = function () {
      S.customers = S.customers.filter(function (c) { return !c.demo; });
      S.invoices = S.invoices.filter(function (i) { return !i.demo; });
    };
    if (isServer()) {
      return call('demo_remove', {}).then(function (r) { drop(); S.counter = r.counter; });
    }
    return localOp(function () { drop(); if (!S.invoices.length) S.counter = 0; localSave(); });
  }

  /* ------------------------------------------------ whole database */
  function exportAll() {
    return { app: 'best-and-fast-pos', version: 1, exported: new Date().toISOString(),
      settings: S.settings, services: S.services, customers: S.customers, invoices: S.invoices, counter: S.counter };
  }
  function restore(data) {
    var ro = readOnly(); if (ro) return ro;
    if (!data || !Array.isArray(data.invoices)) return Promise.reject(err('bad_backup'));
    var payload = {
      settings: Object.assign(Catalog.defaultSettings(), data.settings || {}),
      services: data.services || [], customers: data.customers || [], invoices: data.invoices || [],
      counter: Math.max(data.counter || 0, data.invoices.reduce(function (m, i) { return Math.max(m, i.no || 0); }, 0))
    };
    if (isServer()) return call('restore', { data: payload }).then(function () { adopt(payload); });
    return localOp(function () { adopt(payload); localSave(); });
  }
  function wipe(resetCounter) {
    var ro = readOnly(); if (ro) return ro;
    var settings = S.settings;
    if (isServer()) {
      return call('reset', { resetCounter: !!resetCounter }).then(function () {
        return call('restore', { data: { settings: settings, services: S.services, customers: [], invoices: [], counter: resetCounter ? 0 : S.counter } });
      }).then(function () { S.customers = []; S.invoices = []; if (resetCounter) S.counter = 0; });
    }
    return localOp(function () { S.customers = []; S.invoices = []; if (resetCounter) S.counter = 0; localSave(); });
  }

  /* ------------------------------------------------ worker accounts (server only) */
  function health() { return call('health'); }
  function users() { return call('users'); }
  function addUser(u) { var ro = readOnly(); if (ro) return ro; return call('user_add', u); }
  function delUser(id) { var ro = readOnly(); if (ro) return ro; return call('user_del', { id: id }); }
  function setPassword(body) { return call('user_password', body); }

  function invoiceById(id) { return S.invoices.filter(function (i) { return i.id === id; })[0]; }

  window.Store = {
    s: S, hooks: hooks, isServer: isServer, isAdmin: function () { return !!S.user && S.user.role === 'admin'; },
    feature: function (name) { return !!S.features[name]; },
    maxStaff: function () { return Number(S.features.max_staff) || 0; },
    isViewer: isViewer, canWrite: function () { return !isViewer(); },
    canSeeAll: function () { return !!S.user && (S.user.role === 'admin' || S.user.role === 'viewer'); },
    boot: boot, reload: reload, login: login, setup: setup, logout: logout,
    saveSettings: saveSettings, saveService: saveService, removeService: removeService, replaceServices: replaceServices,
    saveCustomer: saveCustomer, removeCustomer: removeCustomer,
    createInvoice: createInvoice, updateInvoice: updateInvoice, removeInvoices: removeInvoices, shareInvoice: shareInvoice,
    removeDemo: removeDemo, hasDemo: hasDemo,
    exportAll: exportAll, restore: restore, wipe: wipe,
    users: users, health: health, addUser: addUser, delUser: delUser, setPassword: setPassword,
    invoiceById: invoiceById,
    serviceById: function (id) { return S.services.filter(function (i) { return i.id === id; })[0]; },
    customerById: function (id) { return S.customers.filter(function (i) { return i.id === id; })[0]; }
  };
})();
