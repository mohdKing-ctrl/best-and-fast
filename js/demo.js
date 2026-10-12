/* demo.js - the example customers and bills a brand-new system starts with, so the owner can see how
   everything works (bills, payments, stages, reports, WhatsApp). Every record carries demo:true, so
   Settings -> "Remove example data" deletes exactly these and never touches real work.
   Example customers have NO phone number on purpose: nothing can be sent to a stranger by mistake -
   to test WhatsApp, type your own number in the send window. */
(function () {
  'use strict';

  function build(settings, userName) {
    var prefix = (settings && settings.prefix) || 'INV';
    var svc = Catalog.defaultServices();
    var day = function (n) { return ymd(addDays(n)); };

    function item(en, q, price) {
      var s = svc.filter(function (x) { return x.n === en; })[0];
      if (!s) throw new Error('demo: unknown service ' + en);
      return { sid: s.id, cat: s.cat, n: s.n, a: s.a, unit: s.unit, ob: false, price: price != null ? price : s.price, q: q };
    }

    var customers = [
      { id: 'demo-c1', name: 'أحمد بن سالم الهنائي', phone: '', company: false, vatNo: '', addr: '', notes: 'عميل مثال' },
      { id: 'demo-c2', name: 'خالد بن محمد البلوشي', phone: '', company: false, vatNo: '', addr: '', notes: 'عميل مثال' },
      { id: 'demo-c3', name: 'شركة النخيل للنقل', phone: '', company: true, vatNo: '', addr: 'سمائل', notes: 'عميل مثال - شركة' },
      { id: 'demo-c4', name: 'سعيد بن ناصر الرحبي', phone: '', company: false, vatNo: '', addr: '', notes: 'عميل مثال' },
      { id: 'demo-c5', name: 'مؤسسة الواحة للمقاولات', phone: '', company: true, vatNo: '', addr: 'سمائل', notes: 'عميل مثال - شركة' }
    ].map(function (c) { c.demo = true; return c; });
    var C = {}; customers.forEach(function (c) { C[c.id] = c; });

    /* d = days ago, due = days from today (expected delivery), pays = [[days ago, amount, method], ...] */
    var specs = [
      { d: 9, t: '09:40', c: 'demo-c1', kind: 'repair', plate: '5231 AB', car: 'Toyota Camry', color: 'أبيض', km: '142000',
        fault: 'صدمة خفيفة في الصدام الأمامي', items: [item('Front bumper repair', 1), item('Bumper paint', 1), item('Polishing & waxing', 1)],
        disc: 5, pays: [[9, 80, 'cash']], job: 'delivered' },
      { d: 8, t: '11:15', c: null, kind: 'parts', items: [item('Used headlight', 1), item('Used bumper', 1)],
        pays: [[8, 45, 'cash']], job: 'delivered', note: 'بيع قطع - بدون تركيب' },
      { d: 6, t: '10:05', c: 'demo-c2', kind: 'repair', plate: '8120 KT', car: 'Nissan Patrol', color: 'رمادي', km: '210000',
        fault: 'حادث جانبي: ضرر في الباب والرفرف الأيمن',
        items: [item('Door repair', 1), item('Door paint', 1), item('Fender (wing) repair', 1), item('Single panel paint', 1)],
        pays: [[6, 50, 'cash'], [2, 65, 'transfer']], job: 'delivered' },
      { d: 5, t: '08:50', c: 'demo-c3', kind: 'repair', plate: '3302 NK', car: 'Isuzu', color: 'أبيض', km: '98000', due: -3,
        fault: 'صيانة دورية وصوت في الفرامل',
        items: [item('Engine oil & filter change', 1), item('Brake pads replacement (labour)', 1), item('Computer diagnostic scan', 1), item('Labour (per hour)', 3)],
        pays: [], job: 'ready', note: 'الدفع بعد نهاية الشهر' },
      { d: 4, t: '12:30', c: 'demo-c5', kind: 'repair', plate: '6710 MM', car: 'Mitsubishi', color: 'أزرق', km: '175000', due: 3,
        fault: 'حادث أمامي: تعديل الشاصيه وصبغ كامل للمقدمة',
        items: [item('Full accident repair (agreed amount)', 1, 380), item('Colour matching (paint mixing)', 1)],
        pays: [[4, 200, 'transfer']], job: 'repair', note: 'مبلغ متفق عليه - دفعة أولى ٢٠٠' },
      { d: 3, t: '16:20', c: 'demo-c1', kind: 'repair', plate: '2288 HD', car: 'Hyundai', color: 'فضي', km: '88000',
        fault: 'المكيف لا يبرد',
        items: [item('Air-conditioning service & gas', 1), item('Battery check / fitting', 1)],
        pays: [[3, 18, 'cash']], job: 'delivered' },
      { d: 2, t: '09:10', c: 'demo-c4', kind: 'repair', plate: '9013 RQ', car: 'Kia', color: 'أسود', km: '120000',
        fault: 'فحص محرك', items: [item('Engine repair / overhaul', 1, 150)],
        pays: [], job: 'received', voided: true, note: 'ألغى العميل العمل - مثال على فاتورة ملغاة' },
      { d: 1, t: '14:00', c: 'demo-c4', kind: 'repair', plate: '9013 RQ', car: 'Kia', color: 'أسود', km: '120050', due: 1,
        fault: 'اهتزاز في المقود وصوت في العفشة',
        items: [item('Computer diagnostic scan', 1), item('Suspension & steering repair', 1, 60)],
        pays: [[1, 30, 'cash']], job: 'repair' },
      { d: 0, t: '09:05', c: null, kind: 'repair', plate: '7745 TY', car: 'Toyota', color: 'ذهبي', km: '256000',
        fault: 'تغيير زيت', items: [item('Engine oil & filter change', 1)],
        pays: [[0, 12, 'cash']], job: 'delivered' },
      { d: 0, t: '10:30', c: 'demo-c3', kind: 'repair', plate: '1199 LC', car: 'Toyota', color: 'أبيض', km: '64000', due: 2,
        fault: 'ضرر في الصدام الخلفي والفانوس',
        items: [item('Rear bumper repair', 1), item('Headlight / taillight fitting', 1)],
        pays: [], job: 'received' }
    ];

    var invoices = specs.map(function (sp, i) {
      var no = i + 1, cust = sp.c ? C[sp.c] : null;
      var tt = Calc.totals(sp.items, sp.disc || 0, false, 0);
      var doc = {
        id: String(no), no: no, number: prefix + '-' + String(no).padStart(5, '0'),
        created: Math.floor(addDays(-sp.d).getTime() / 1000), createdBy: userName || '',
        date: day(-sp.d), time: sp.t,
        customerId: cust ? cust.id : null, customerName: cust ? cust.name : 'عميل نقدي', customerPhone: '',
        customerVat: '', customerAddr: cust && cust.company ? cust.addr : '', company: !!(cust && cust.company),
        kind: sp.kind, plate: sp.plate || '', car: sp.car || '', color: sp.color || '', km: sp.km || '',
        due: sp.due !== undefined ? day(sp.due) : '', fault: sp.fault || '',
        items: sp.items, discount: tt.disc, vatPct: tt.vatPct, vat: tt.vat, office: tt.office, behalf: tt.behalf, total: tt.total,
        payments: sp.pays.map(function (p) { return { date: day(-p[0]), amount: p[1], method: p[2] }; }),
        job: sp.job, note: sp.note || '', void: !!sp.voided,
        cr: settings ? settings.cr : '', vatNo: settings ? settings.vatNo : '', demo: true
      };
      if (sp.voided) doc.voidedAt = day(-sp.d);
      return doc;
    });
    return { customers: customers, invoices: invoices, counter: invoices.length };
  }

  window.Demo = { build: build };
})();
