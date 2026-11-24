// app.js — UI. Salon (calm opener) and Mutfak (ledger detail).
(function () {
  'use strict';
  var C = window.Core, S = window.Sync;
  var $app = document.getElementById('app');
  var $sheet = document.getElementById('sheet-root');
  var $toast = document.getElementById('toast-root');

  // ---------- storage ----------
  var LS_DATA = 'tus.data', LS_CFG = 'tus.cfg';
  function load(key, fallback) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }

  var data = load(LS_DATA, C.emptyData());
  var cfg = Object.assign({ owner: 'baturalpalooza', repo: 'tus-data', path: 'data.json', token: '', mutfakForm: false, setupSkipped: false }, load(LS_CFG, {}));
  var ui = { view: 'salon', tab: 'zincir', subject: null, syncState: 'idle', syncMsg: '', factIdx: Math.floor(Math.random() * 100) };

  function persist() { save(LS_DATA, data); }
  function saveCfg() { save(LS_CFG, cfg); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- mutations ----------
  function addEvent(e) {
    e.id = C.newId(); e.t = new Date().toISOString(); e.by = 'app';
    data.events.push(e); persist(); scheduleSync(); render();
    return e.id;
  }
  function removeEvent(id) {
    data.events.forEach(function (e) { if (e.id === id) { e.deleted = true; e.deletedAt = new Date().toISOString(); } });
    persist(); scheduleSync(); render();
  }
  function restoreEvent(id) {
    // undo of a delete: re-add as a fresh copy (deleted flags never revert, so sync stays simple)
    var src = null; data.events.forEach(function (e) { if (e.id === id) src = e; });
    if (!src) return;
    var copy = JSON.parse(JSON.stringify(src)); delete copy.deleted; delete copy.deletedAt;
    copy.id = C.newId(); data.events.push(copy); persist(); scheduleSync(); render();
  }

  // ---------- sync ----------
  var syncTimer = null, syncing = false, again = false;
  function hasToken() { return !!cfg.token; }
  function scheduleSync(delay) {
    if (!hasToken()) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(doSync, delay == null ? 1200 : delay);
  }
  async function doSync() {
    if (!hasToken()) return;
    if (syncing) { again = true; return; }
    if (!navigator.onLine) { ui.syncState = 'offline'; renderBadge(); return; }
    syncing = true; ui.syncState = 'busy'; renderBadge();
    try {
      var merged = await S.sync(cfg, data);
      // keep anything added locally while the request was in flight
      data = C.merge(merged, data); persist();
      ui.syncState = 'ok'; ui.syncMsg = ''; cfg.lastSync = new Date().toISOString(); saveCfg();
      render();
    } catch (err) {
      ui.syncState = 'err'; ui.syncMsg = err.message || String(err); renderBadge();
    } finally {
      syncing = false;
      if (again) { again = false; scheduleSync(300); }
    }
  }
  function badgeText() {
    if (!hasToken()) return 'Yerel · senkron kapalı';
    return { idle: 'Senkron', busy: 'Senkron…', ok: 'Senkron ✓', err: 'Senkron hatası', offline: 'Çevrimdışı · bekliyor' }[ui.syncState] || '';
  }
  function renderBadge() { var b = document.querySelector('[data-badge]'); if (b) b.textContent = badgeText(); }

  // ---------- helpers ----------
  function chainCells(s, weeks) {
    // columns = weeks (Mon..Sun), last column holds today
    var today = C.parseDay(s.today);
    var dow = (today.getDay() + 6) % 7; // Mon=0
    var start = C.addDays(s.today, -(dow + (weeks - 1) * 7));
    var out = [];
    for (var i = 0; i < weeks * 7; i++) {
      var k = C.addDays(start, i), cls = '';
      if (k > s.today) cls = 'f';
      else if (k in s.anki) cls = 'l' + C.ankiLevel(s.anki[k]);
      if (k === s.today) cls += ' t';
      out.push('<i class="' + cls + '" title="' + k + '"></i>');
    }
    return out.join('');
  }
  function sinceParts(s, now) {
    if (!s.lastStudy) return null;
    var mins = Math.max(0, Math.round((now - s.lastStudy.when) / 60000));
    if (mins < 60) return { big: String(mins), unit: 'dk önce' };
    if (mins < 48 * 60) { var h = Math.floor(mins / 60), m = mins % 60; return { big: h + ':' + (m < 10 ? '0' : '') + m, unit: 'sa önce' }; }
    return { big: String(Math.floor(mins / 1440)), unit: 'gün önce' };
  }
  function lerp(a, b, f) { return Math.round(a + (b - a) * f); }
  function mix(h1, h2, f) {
    var a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    var r = lerp(a >> 16, b >> 16, f), g = lerp((a >> 8) & 255, (b >> 8) & 255, f), bl = lerp(a & 255, b & 255, f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function heroSvg(f) {
    // f: 0 = just studied (warm sunset) .. 1 = long gap (cool dusk)
    var warm = ['#8F9AD0', '#B8B2D3', '#F2B48C', '#F0662C'], cool = ['#7F90C6', '#A3B1DA', '#C3CEEA', '#9DB3E6'];
    var c = warm.map(function (w, i) { return mix(w, cool[i], f); });
    var glow = (0.95 * (1 - f)).toFixed(2);
    return '<svg viewBox="0 0 390 300" preserveAspectRatio="none" aria-hidden="true"><defs>' +
      '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="0.45" stop-color="' + c[1] + '"/><stop offset="0.78" stop-color="' + c[2] + '"/><stop offset="1" stop-color="' + c[3] + '"/></linearGradient>' +
      '<radialGradient id="glow" cx="0.5" cy="1.08" r="0.62"><stop offset="0" stop-color="#FF5A1F" stop-opacity="' + glow + '"/><stop offset="1" stop-color="#FF5A1F" stop-opacity="0"/></radialGradient>' +
      '<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.28"/></feComponentTransfer></filter>' +
      '</defs><rect width="390" height="300" fill="url(#sky)"/><rect width="390" height="300" fill="url(#glow)"/><rect width="390" height="300" filter="url(#grain)"/></svg>';
  }
  function gauge(p) { p = Math.max(0, Math.min(1, p)); return '<div class="gauge"><i style="top:' + Math.round(p * 50) + 'px"></i></div>'; }
  function bookName(key) { var b = C.allBooks().filter(function (x) { return x.key === key; })[0]; return b ? b.name + ' ' + b.vol : key; }
  function fmtDay(k) { var p = k.split('-'); return p[2] + '.' + p[1]; }

  // ---------- Salon ----------
  function renderSalon(s, now) {
    var since = sinceParts(s, now);
    var hrs = s.lastStudy ? (now - s.lastStudy.when) / 3600000 : 72;
    var f = Math.max(0, Math.min(1, hrs / 72));
    var last = s.lastStudy ? s.lastStudy.event : null;
    var studiedToday = s.todayMinutes > 0;
    var runningBook = s.running[0];
    var studiedGaps = s.gaps.filter(function (g) { return g.days !== null; }).sort(function (a, b) { return b.days - a.days; });
    var far = studiedGaps[0];
    var facts = C.facts(s);
    var fact = facts.length ? facts[ui.factIdx % facts.length] : 'İlk kaydını gir; burada her açılışta başka bir bilgi çıkacak.';
    var pct = Math.round(s.filledCount / s.bookCount * 100);

    return '<div class="screen salon">' +
      '<div class="hero">' + heroSvg(f) +
        '<div class="hero-dots mono">' +
          '<span><i class="dot' + (s.ankiToday ? ' on' : '') + '" style="' + (s.ankiToday ? 'background:#F0662C' : '') + '"></i>Anki' + (s.ankiToday ? ' ✓' : '') + '</span>' +
          '<span><i class="dot' + (studiedToday ? ' on' : '') + '" style="' + (studiedToday ? 'background:#F2A65A' : '') + '"></i>Çalışma' + (studiedToday ? ' ✓' : '') + '</span>' +
          '<span><i class="dot' + (runningBook ? ' on' : '') + '" style="' + (runningBook ? 'background:#B8B2D3' : '') + '"></i>Kitap</span>' +
        '</div>' +
        '<button class="hero-gear" data-act="settings" aria-label="Ayarlar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1C1C1E" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></button>' +
        '<div class="sync-badge" data-badge>' + esc(badgeText()) + '</div>' +
      '</div>' +
      '<div class="pad">' +
        '<div class="last-row"><div><div class="mono" style="font-size:12px">Son çalışma</div><div class="sub">' + (last ? esc((C.subjectById(last.subject) || {}).name || 'Genel') + ' · ' + C.fmtMinutes(last.minutes || 0) : 'Henüz kayıt yok') + '</div></div>' +
        '<span class="mono" style="font-size:12px;letter-spacing:.1em">' + fmtDay(s.today) + '.' + s.today.slice(0, 4) + '</span></div>' +
        (since ? '<div class="big"><b>' + since.big + '</b><span>' + since.unit + '</span></div>' : '<div class="big"><b>—</b></div>') +
        '<div class="chain-head"><span class="mono">Anki zinciri</span><span class="v">' + s.streak + ' gün <small>' + (s.ankiToday ? 'kırılmadı' : (s.streak ? 'bugün bekliyor' : '')) + '</small></span></div>' +
        '<div class="chain" style="grid-template-columns:repeat(26,1fr)">' + chainCells(s, 26) + '</div>' +
        '<div class="stats">' +
          stat('Bugün', s.todayMinutes ? C.fmtMinutes(s.todayMinutes) : '—', s.todayMinutes / 240) +
          stat('Bu hafta', s.week ? C.fmtMinutes(s.week) : '—', s.week / 1200) +
          stat('Elindeki kitap', runningBook ? runningBook.name + ' ' + runningBook.vol : '—', runningBook ? (s.books[runningBook.key].reading ? 0.8 : 0.4) : 0) +
          stat('En uzak ders', far ? far.days + ' gün' : '—', far ? far.days / 30 : 0, far ? far.name : '') +
        '</div>' +
        '<div class="fact"><span class="mono">Bu arada</span><p>' + esc(fact) + '</p></div>' +
        '<div class="progress"><span class="mono">% Kitaplar dolduruldu</span><div class="bar"><i style="width:' + pct + '%"></i><span>' + pct + '<small>%  ·  ' + s.filledCount + '/' + s.bookCount + ' cilt</small></span></div></div>' +
        '<div class="actions"><button class="btn dark" data-act="add">+ Kayıt</button>' +
          (s.ankiToday ? '<button class="btn done" data-act="anki-edit">Anki ✓' + (s.anki[s.today].cards ? ' · ' + s.anki[s.today].cards : '') + '</button>' : '<button class="btn" data-act="anki">Anki ✓</button>') + '</div>' +
      '</div>' +
      '<button class="mutfak-strip" data-act="mutfak"><span class="grip"></span><b>↑ Mutfak</b><span>Zincir · Kitaplar · Dersler</span></button>' +
    '</div>';
  }
  function stat(label, value, p, sub) {
    return '<div class="stat"><div><div class="mono" style="line-height:1.35">' + esc(label) + '</div><div class="val">' + esc(value) + '</div>' + (sub ? '<div class="sub" style="margin-top:2px">' + esc(sub) + '</div>' : '') + '</div>' + gauge(p) + '</div>';
  }

  // ---------- Mutfak ----------
  function renderMutfak(s) {
    var body = ui.subject ? renderSubject(s, ui.subject) : ui.tab === 'kitaplar' ? renderBooks(s) : ui.tab === 'dersler' ? renderSubjects(s) : renderZincir(s);
    var tabs = ['zincir', 'kitaplar', 'dersler'].map(function (t) {
      return '<button data-act="tab" data-v="' + t + '" class="' + (ui.tab === t && !ui.subject ? 'on' : '') + '">' + { zincir: 'Zincir', kitaplar: 'Kitaplar', dersler: 'Dersler' }[t] + '</button>';
    }).join('');
    return '<div class="screen mutfak">' +
      '<div class="m-top"><div class="m-top-row"><span class="mm" style="font-weight:700">TUS / Mutfak</span>' +
      '<button class="mm muted" data-act="settings">⚙ Ayarlar</button></div><div class="m-tabs">' + tabs + '</div></div>' +
      body +
      '<button class="back" data-act="salon">↓ Salon</button></div>';
  }

  function renderZincir(s) {
    var gaps = s.gaps.slice().sort(function (a, b) {
      if (a.days === null && b.days === null) return 0; if (a.days === null) return -1; if (b.days === null) return 1; return b.days - a.days;
    });
    var rows = gaps.map(function (g) {
      var pct = g.days === null ? 100 : Math.min(100, Math.round(g.days / 30 * 100));
      var warn = g.days === null || g.days >= 14;
      return '<button class="gap-row" data-act="subject" data-v="' + g.id + '"><span style="font-size:15px">' + esc(g.name) + '</span><span class="track"><i class="' + (warn ? 'warn' : '') + '" style="width:' + pct + '%"></i></span><span class="n">' + (g.days === null ? 'hiç' : g.days === 0 ? 'bugün' : g.days + ' gün') + '</span></button>';
    }).join('');
    return (cfg.mutfakForm ? '<div class="sec">' + inlineForm() + '</div>' : '') +
      '<div class="sec"><div class="sec-h"><span class="mm"><b>01</b>Anki zinciri</span><span class="mm muted">Rekor ' + s.bestStreak + '</span></div>' +
      '<div style="display:flex;align-items:baseline;gap:10px"><span class="hugenum">' + s.streak + '</span><span style="font-size:16px">gündür kırılmadı</span></div>' +
      '<div class="m-chain" style="grid-template-columns:repeat(26,1fr)">' + chainCells(s, 26) + '</div>' +
      '<div class="legend" style="justify-content:space-between"><span>Son 7 gün: ' + (s.weekCards || 0) + ' kart</span><span>Az <i class="l1"></i><i class="l2"></i><i class="l3"></i> çok</span></div>' +
      ((s.weekFill || s.weekRead) ? '<div class="legend"><span>Bu hafta: ' + s.weekFill + ' s doldurma · ' + s.weekRead + ' s okuma</span></div>' : '') + '</div>' +
      '<div class="sec"><div class="sec-h"><span class="mm"><b>02</b>Uzak kaldıkların</span></div>' + rows + '</div>' +
      (cfg.mutfakForm ? '' : '<div class="sec" style="padding-top:14px;padding-bottom:14px"><span class="muted" style="font-size:14px">Detaylı kayıt gizli. Ayarlar → Mutfakta kayıt göster.</span></div>');
  }

  var form = { subject: null, minutes: 60, questions: 0, day: 0 };
  function inlineForm() {
    var subj = C.SUBJECTS.map(function (x) { return '<button data-act="f-subj" data-v="' + x.id + '" class="' + (form.subject === x.id ? 'on' : '') + '">' + esc(x.name) + '</button>'; }).join('');
    var durs = [30, 60, 90, 120, 180].map(function (m) { return '<button data-act="f-min" data-v="' + m + '" class="' + (form.minutes === m ? 'on' : '') + '">' + m + '</button>'; }).join('');
    return '<div class="sec-h"><span class="mm"><b>00</b>Çalışma kaydı</span></div><div class="keypad">' + subj + '</div><div class="keypad d5" style="margin-top:8px">' + durs + '</div>' +
      '<button class="m-btn" style="margin-top:10px" data-act="f-save"' + (form.subject ? '' : ' disabled') + '>Kaydet</button>';
  }

  function cellsHtml(st) {
    return C.bookCells(st).map(function (c, i) {
      var plus = (i === 4 && st.reads > 3) ? '<span class="plus">+' + (st.reads - 3) + '</span>' : '';
      return '<span class="cell c' + c + '">' + plus + '</span>';
    }).join('');
  }
  function bookRow(b, st, strong) {
    return '<button class="book-row" data-act="book" data-v="' + b.key + '"><span class="nm"' + (strong ? ' style="font-weight:700"' : '') + '>' + esc(b.name) + ' <small>' + b.vol + '</small></span>' + cellsHtml(st) + '</button>';
  }
  function renderBooks(s) {
    var head = '<div class="book-head"><span></span><span>Başla</span><span>Doldur</span><span>Oku 1</span><span>Oku 2</span><span>Oku 3</span></div>';
    var running = s.running.length ? '<div class="sec running"><div class="sec-h"><span class="mm" style="font-weight:700">Şu an elindeki · ' + s.running.length + '</span></div>' +
      s.running.map(function (b) { var st = s.books[b.key]; return bookRow(b, st, true) + '<div class="mm muted" style="text-transform:none;letter-spacing:0;margin:2px 0 6px">' + (st.reading ? (st.reads + 1) + '. okuma' : 'Doldurma') + (st.stageSince ? ' · ' + fmtDay(st.stageSince) + '’den beri · ' + C.dayDiff(st.stageSince, s.today) + ' gün' : '') + '</div>'; }).join('') + '</div>' : '';
    var groups = [['temel', 'Temel bilimler'], ['klinik', 'Klinik bilimler']].map(function (g) {
      var list = C.allBooks().filter(function (b) { return b.group === g[0]; });
      return '<div class="grp">' + g[1] + ' · ' + list.length + '</div>' + list.map(function (b) { return bookRow(b, s.books[b.key]); }).join('');
    }).join('');
    return '<div class="sec"><div style="display:flex;align-items:baseline;gap:10px"><span class="hugenum">' + s.filledCount + '<span class="muted" style="font-weight:400">/' + s.bookCount + '</span></span><span style="font-size:16px">cilt dolduruldu</span></div><div style="margin-top:18px">' + head + '</div></div>' +
      running + '<div class="sec">' + groups +
      '<div class="legend"><span><i class="c1"></i>Bitti</span><span><i class="c2"></i>Sürüyor</span><span><i></i>Henüz değil</span></div>' +
      '<p class="empty" style="margin-top:12px">Bir cilde dokun: sıradaki adımı işaretle ya da son adımı geri al.</p></div>';
  }

  function renderSubjects(s) {
    var rows = C.SUBJECTS.map(function (x) {
      var g = s.gaps.filter(function (y) { return y.id === x.id; })[0];
      var vols = C.allBooks().filter(function (b) { return b.subject === x.id; });
      var filled = vols.filter(function (b) { return s.books[b.key].filled; }).length;
      return '<button class="subj-row" data-act="subject" data-v="' + x.id + '"><span class="nm">' + esc(x.name) + '</span><span class="meta">' +
        (g.days === null ? 'hiç çalışılmadı' : (g.days === 0 ? 'bugün' : g.days + ' gün önce')) + '<br>' + (g.minutes ? C.fmtMinutes(g.minutes) : '0 sa') + ' · ' + filled + '/' + vols.length + ' cilt</span></button>';
    }).join('');
    return '<div class="sec"><div class="sec-h"><span class="mm"><b>01</b>Dersler</span></div>' + rows + '</div>';
  }

  var DECK = [['locked', 'Kilitli'], ['open', 'Açıldı'], ['newDone', 'Yeni bitti'], ['review', 'Tekrarda']];
  function renderSubject(s, id) {
    var x = C.subjectById(id), g = s.gaps.filter(function (y) { return y.id === id; })[0];
    var vols = C.allBooks().filter(function (b) { return b.subject === id; });
    var filled = vols.filter(function (b) { return s.books[b.key].filled; }).length;
    var deck = s.decks[id] || 'locked';
    var logs = C.live(data).filter(function (e) { return (e.type === 'study' && e.subject === id) || (e.type === 'book' && e.book.indexOf(id + '-') === 0); })
      .sort(function (a, b) { return a.t < b.t ? 1 : -1; }).slice(0, 30);
    var logHtml = logs.length ? logs.map(function (e) {
      var what = e.type === 'study' ? (e.kind === 'read' ? 'Okuma' : 'Doldurma') + ' · ' + C.fmtMinutes(e.minutes || 0) + (e.pages ? ' · ' + e.pages + ' s' : '') + (e.questions ? ' · ' + e.questions + ' soru' : '')
        : bookName(e.book) + ' · ' + { start: 'başlandı', filled: 'dolduruldu', readStart: 'okumaya başlandı', readDone: 'okuma bitti' }[e.action];
      return '<div class="log-row"><span class="d">' + fmtDay(e.date) + '</span><span style="font-size:15px">' + esc(what) + '</span><button data-act="del" data-v="' + e.id + '" aria-label="Kaydı sil">×</button></div>';
    }).join('') : '<p class="empty">Bu derse ait kayıt yok.</p>';
    return '<div class="sec"><button class="mm" data-act="tab" data-v="dersler" style="border:none;background:transparent;padding:0;height:44px;font-weight:700">← Dersler</button>' +
      '<h1 style="margin:4px 0 0;font-size:44px;font-weight:800;letter-spacing:-0.03em;line-height:1">' + esc(x.name) + '</h1>' +
      '<div class="kpis"><div><span class="mm muted" style="font-size:10px">Son çalışma</span><b>' + (g.days === null ? '—' : g.days === 0 ? 'Bugün' : g.days + ' g') + '</b></div>' +
      '<div><span class="mm muted" style="font-size:10px">Toplam</span><b>' + (g.minutes ? C.fmtMinutes(g.minutes).replace(' dk', 'dk') : '0') + '</b></div>' +
      '<div><span class="mm muted" style="font-size:10px">Kitap</span><b>' + filled + '/' + vols.length + '</b></div></div></div>' +
      '<div class="sec"><div class="sec-h"><span class="mm"><b>01</b>Kitaplar</span></div>' +
      '<div class="book-head"><span></span><span>Başla</span><span>Doldur</span><span>Oku 1</span><span>Oku 2</span><span>Oku 3</span></div>' +
      vols.map(function (b) { return bookRow(b, s.books[b.key]); }).join('') + '</div>' +
      '<div class="sec"><div class="sec-h"><span class="mm"><b>02</b>Anki alt destesi</span></div><div class="deck">' +
      DECK.map(function (d) { return '<button data-act="deck" data-v="' + d[0] + '" class="' + (deck === d[0] ? 'on' : '') + '">' + d[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span class="mm"><b>03</b>Son kayıtlar</span></div>' + logHtml + '</div>';
  }

  // ---------- Sheets ----------
  var add = { subject: null, minutes: 60, questions: 0, day: 0, kind: 'fill', pages: 0 };
  function openSheet(html, mutfakStyle) {
    $sheet.innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet' + (mutfakStyle ? ' m' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  }
  function closeSheet() { $sheet.innerHTML = ''; }

  function addSheet() {
    var subj = C.SUBJECTS.map(function (x) { return '<button class="chip' + (add.subject === x.id ? ' on' : '') + '" data-act="a-subj" data-v="' + x.id + '">' + esc(x.name) + '</button>'; }).join('');
    var durs = [[30, '30 dk'], [60, '1 sa'], [90, '1,5 sa'], [120, '2 sa'], [150, '2,5 sa'], [180, '3 sa'], [240, '4 sa'], [300, '5 sa']].map(function (d) {
      return '<button class="tile' + (add.minutes === d[0] ? ' on' : '') + '" data-act="a-min" data-v="' + d[0] + '">' + d[1] + '</button>';
    }).join('');
    var summary = add.subject ? C.subjectById(add.subject).name + ' · ' + C.fmtMinutes(add.minutes) + (add.pages ? ' · ' + add.pages + ' s' : '') + (add.questions ? ' · ' + add.questions + ' soru' : '') : 'Ders seç';
    openSheet('<div class="grab"></div><div class="sheet-head"><h2>Ne çalıştın?</h2><button class="link" data-act="close">Kapat</button></div>' +
      '<div class="field"><span class="mono">Ders</span><div class="chips">' + subj + '</div></div>' +
      '<div class="field"><span class="mono">Süre</span><div class="grid4">' + durs + '</div></div>' +
      '<div class="field"><span class="mono">Ne yaptın?</span><div class="chips"><button class="chip' + (add.kind === 'fill' ? ' on' : '') + '" data-act="a-kind" data-v="fill">Doldurma</button><button class="chip' + (add.kind === 'read' ? ' on' : '') + '" data-act="a-kind" data-v="read">Okuma / tekrar</button></div><div class="note">Doldurma: Cortex videosu + kitaba yazma. Okuma: doldurduğun kitabı baştan okuma.</div></div>' +
      '<div class="stepper-row" style="border-bottom:none"><div><div class="mono">Kaç sayfa?</div><div class="note">İsteğe bağlı</div></div><div class="stepper">' +
        '<button data-act="a-p" data-v="-5" aria-label="5 azalt">−</button><output>' + add.pages + '</output><button data-act="a-p" data-v="5" aria-label="5 artır">+</button></div></div>' +
      '<div class="stepper-row"><div><div class="mono">Soru da çözdün mü?</div><div class="note">İsteğe bağlı</div></div><div class="stepper">' +
        '<button data-act="a-q" data-v="-10" aria-label="10 azalt">−</button><output>' + add.questions + '</output><button data-act="a-q" data-v="10" aria-label="10 artır">+</button></div></div>' +
      '<div class="field"><span class="mono">Gün</span><div class="chips"><button class="chip' + (add.day === 0 ? ' on' : '') + '" data-act="a-day" data-v="0">Bugün</button><button class="chip' + (add.day === -1 ? ' on' : '') + '" data-act="a-day" data-v="-1">Dün</button></div></div>' +
      '<button class="save" data-act="a-save"' + (add.subject ? '' : ' disabled') + '><span>Kaydet</span><small>' + esc(summary) + '</small></button>');
  }

  function bookSheet(key) {
    var s = C.derive(data), st = s.books[key], next = C.nextBookAction(st);
    var lastEv = C.live(data).filter(function (e) { return e.type === 'book' && e.book === key; }).pop();
    var status = !st.started ? 'Henüz başlanmadı.' : !st.filled ? 'Dolduruluyor.' : st.reading ? (st.reads + 1) + '. okuma sürüyor.' : st.reads ? st.reads + ' kez okundu.' : 'Dolduruldu, okuma başlamadı.';
    openSheet('<div class="sheet-head"><h2>' + esc(bookName(key)) + '</h2><button class="link" data-act="close">Kapat</button></div>' +
      '<div class="book-head"><span></span><span>Başla</span><span>Doldur</span><span>Oku 1</span><span>Oku 2</span><span>Oku 3</span></div>' +
      '<div class="book-row" style="border-top:none"><span class="nm">' + esc(status) + '</span>' + cellsHtml(st) + '</div>' +
      '<button class="m-btn" data-act="b-next" data-v="' + key + '" data-a="' + next.action + '">' + esc(next.label) + '</button>' +
      (lastEv ? '<button class="m-btn ghost" data-act="b-undo" data-v="' + lastEv.id + '">Son adımı geri al</button>' : ''), true);
  }

  var ak = { cards: 0, minutes: 0 };
  function ankiSheet() {
    var quick = [100, 200, 300, 500].map(function (n) { return '<button class="tile' + (ak.cards === n ? ' on' : '') + '" data-act="k-set" data-v="' + n + '">' + n + '</button>'; }).join('');
    var mins = [15, 30, 45, 60].map(function (m) { return '<button class="tile' + (ak.minutes === m ? ' on' : '') + '" data-act="k-m" data-v="' + m + '">' + m + ' dk</button>'; }).join('');
    openSheet('<div class="grab"></div><div class="sheet-head"><h2>Bugünkü Anki</h2><button class="link" data-act="close">Kapat</button></div>' +
      '<p class="note">Anki’de <b>Stats</b> ekranının en üstündeki “Today” satırı: “Studied … cards in … minutes”. İkisi de isteğe bağlı; kart sayısı arttıkça zincirdeki kare koyulaşır.</p>' +
      '<div class="stepper-row"><div><div class="mono">Kart</div></div><div class="stepper"><button data-act="k-c" data-v="-10" aria-label="10 azalt">−</button><output>' + ak.cards + '</output><button data-act="k-c" data-v="10" aria-label="10 artır">+</button></div></div>' +
      '<div class="grid4">' + quick + '</div>' +
      '<div class="field"><span class="mono">Süre</span><div class="grid4">' + mins + '</div></div>' +
      '<button class="save" data-act="k-save"><span>Kaydet</span><small>' + (ak.cards ? ak.cards + ' kart' : 'kart yok') + (ak.minutes ? ' · ' + ak.minutes + ' dk' : '') + '</small></button>' +
      '<button class="link" style="color:#B23A0E;align-self:flex-start" data-act="anki-undo">Bugünkü Anki’yi kaldır</button>');
  }

  function settingsSheet(msg) {
    var tokenSet = !!cfg.token;
    openSheet('<div class="grab"></div><div class="sheet-head"><h2>Ayarlar</h2><button class="link" data-act="close">Kapat</button></div>' +
      '<div class="field"><span class="mono">GitHub erişim anahtarı</span>' +
      '<input class="input" id="tok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + (tokenSet ? '•••••••• (kayıtlı)' : 'github_pat_…') + '">' +
      '<p class="note">Veri reposu: ' + esc(cfg.owner + '/' + cfg.repo) + '. Anahtar sadece bu cihazda saklanır.</p>' +
      '<button class="save" data-act="s-token"><span>Kaydet ve dene</span><small>' + (tokenSet ? 'Bağlı' : 'Bağlı değil') + '</small></button>' +
      (msg ? '<p class="' + (msg.ok ? 'note' : 'err') + '">' + esc(msg.text) + '</p>' : '') + '</div>' +
      '<div class="toggle-row"><div><div style="font-size:16px">Mutfakta kayıt göster</div><div class="note">Tuş takımlı detaylı kayıt formu</div></div><button class="switch' + (cfg.mutfakForm ? ' on' : '') + '" data-act="s-form" aria-label="Mutfakta kayıt göster" aria-pressed="' + cfg.mutfakForm + '"></button></div>' +
      '<div class="toggle-row"><div><div style="font-size:16px">Şimdi senkronla</div><div class="note">' + (cfg.lastSync ? 'Son: ' + new Date(cfg.lastSync).toLocaleString('tr-TR') : 'Henüz senkron olmadı') + (ui.syncMsg ? ' · ' + esc(ui.syncMsg) : '') + '</div></div><button class="link" data-act="s-sync">Senkronla</button></div>' +
      '<div class="toggle-row"><div><div style="font-size:16px">Yedek indir</div><div class="note">Bütün kayıtlar tek dosya (JSON)</div></div><button class="link" data-act="s-export">İndir</button></div>' +
      (tokenSet ? '<div class="toggle-row"><div><div style="font-size:16px">Anahtarı bu cihazdan sil</div><div class="note">Kayıtlar silinmez</div></div><button class="link" style="color:#B23A0E" data-act="s-forget">Sil</button></div>' : '') +
      '<p class="note">' + C.live(data).length + ' kayıt · sürüm 1.0</p>');
  }

  function setupScreen(msg) {
    return '<div class="screen salon" style="padding-bottom:0"><div class="hero" style="height:calc(220px + var(--safe-top))">' + heroSvg(0.15) + '</div>' +
      '<div class="setup"><h1>TUS</h1>' +
      '<p class="note" style="font-size:16px;color:#1C1C1E">Kayıtların gizli <b>' + esc(cfg.owner + '/' + cfg.repo) + '</b> reposunda durur. iPhone, iPad ve Mac aynı veriyi görür. Bunun için bu cihaza bir kez erişim anahtarı gir.</p>' +
      '<input class="input" id="tok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…">' +
      '<button class="save" data-act="s-token"><span>Bağlan</span><small>Anahtarı dene</small></button>' +
      (msg ? '<p class="' + (msg.ok ? 'note' : 'err') + '">' + esc(msg.text) + '</p>' : '') +
      '<button class="link" data-act="skip" style="align-self:flex-start">Şimdilik anahtarsız devam et</button></div></div>';
  }

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(text, buttons, ms) {
    clearTimeout(toastTimer);
    $toast.innerHTML = '<div class="toast" role="status"><span>' + esc(text) + '</span>' + (buttons || []).map(function (b) {
      return '<button class="' + (b.alt ? 'alt' : '') + '" data-act="' + b.act + '" data-v="' + esc(b.v || '') + '">' + esc(b.label) + '</button>';
    }).join('') + '</div>';
    toastTimer = setTimeout(function () { $toast.innerHTML = ''; }, ms || 6000);
  }

  // ---------- render ----------
  var setupMsg = null;
  function render() {
    var now = new Date(), s = C.derive(data, now);
    if (!cfg.token && !cfg.setupSkipped) { $app.innerHTML = setupScreen(setupMsg); return; }
    $app.innerHTML = ui.view === 'mutfak' ? renderMutfak(s) : renderSalon(s, now);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', ui.view === 'mutfak' ? '#F3EFE7' : '#EDECEA');
  }

  async function saveToken() {
    var el = document.getElementById('tok'); var v = el ? el.value.trim() : '';
    if (!v) { if (cfg.token) { doSync(); closeSheet(); } return; }
    var test = await S.test(Object.assign({}, cfg, { token: v }));
    var inSettings = !!$sheet.innerHTML;
    if (test) { if (inSettings) settingsSheet({ ok: false, text: test }); else { setupMsg = { ok: false, text: test }; render(); } return; }
    cfg.token = v; cfg.setupSkipped = false; saveCfg(); setupMsg = null;
    await doSync();
    if (inSettings) settingsSheet({ ok: ui.syncState === 'ok', text: ui.syncState === 'ok' ? 'Bağlandı ve senkronlandı.' : 'Bağlandı ama senkron hatası: ' + ui.syncMsg });
    else { render(); toast(ui.syncState === 'ok' ? 'Bağlandı ✓' : 'Senkron hatası: ' + ui.syncMsg); }
  }

  // ---------- events ----------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), v = el.getAttribute('data-v');
    var today = C.dateKey(new Date());
    switch (act) {
      case 'mutfak': ui.view = 'mutfak'; ui.subject = null; render(); window.scrollTo(0, 0); break;
      case 'salon': ui.view = 'salon'; ui.subject = null; ui.factIdx++; render(); window.scrollTo(0, 0); break;
      case 'tab': ui.tab = v; ui.subject = null; render(); window.scrollTo(0, 0); break;
      case 'subject': ui.view = 'mutfak'; ui.subject = v; render(); window.scrollTo(0, 0); break;
      case 'close': closeSheet(); break;
      case 'settings': settingsSheet(); break;
      case 'skip': cfg.setupSkipped = true; saveCfg(); render(); break;

      case 'add': add = { subject: add.subject, minutes: 60, questions: 0, day: 0, kind: add.kind, pages: 0 }; addSheet(); break;
      case 'a-kind': add.kind = v; addSheet(); break;
      case 'a-p': add.pages = Math.max(0, add.pages + (+v)); addSheet(); break;
      case 'a-subj': add.subject = v; addSheet(); break;
      case 'a-min': add.minutes = +v; addSheet(); break;
      case 'a-q': add.questions = Math.max(0, add.questions + (+v)); addSheet(); break;
      case 'a-day': add.day = +v; addSheet(); break;
      case 'a-save':
        if (!add.subject) break;
        var e = { type: 'study', date: C.addDays(today, add.day), subject: add.subject, minutes: add.minutes, kind: add.kind };
        if (add.pages) e.pages = add.pages;
        if (add.questions) e.questions = add.questions;
        var id = addEvent(e); closeSheet();
        toast(C.subjectById(add.subject).name + ' · ' + C.fmtMinutes(add.minutes) + ' kaydedildi', [{ act: 'undo', v: id, label: 'Geri al' }]);
        break;

      case 'f-subj': form.subject = v; render(); break;
      case 'f-min': form.minutes = +v; render(); break;
      case 'f-save':
        if (!form.subject) break;
        var fid = addEvent({ type: 'study', date: today, subject: form.subject, minutes: form.minutes });
        toast(C.subjectById(form.subject).name + ' · ' + C.fmtMinutes(form.minutes) + ' kaydedildi', [{ act: 'undo', v: fid, label: 'Geri al' }]);
        form.subject = null; render();
        break;

      case 'anki':
        var aid = addEvent({ type: 'anki', date: today });
        toast('Anki ✓', [{ act: 'anki-edit', label: 'Kart / süre', alt: true }, { act: 'undo', v: aid, label: 'Geri al' }], 8000);
        break;
      case 'anki-edit':
        $toast.innerHTML = '';
        var cur = C.derive(data).anki[today] || { cards: 0, minutes: 0 };
        ak = { cards: cur.cards, minutes: cur.minutes }; ankiSheet();
        break;
      case 'k-c': ak.cards = Math.max(0, ak.cards + (+v)); ankiSheet(); break;
      case 'k-set': ak.cards = +v; ankiSheet(); break;
      case 'k-m': ak.minutes = ak.minutes === +v ? 0 : +v; ankiSheet(); break;
      case 'k-save':
        C.live(data).filter(function (x) { return x.type === 'anki' && x.date === today; }).forEach(function (x) { removeEvent(x.id); });
        var ke = { type: 'anki', date: today }; if (ak.cards) ke.cards = ak.cards; if (ak.minutes) ke.minutes = ak.minutes;
        addEvent(ke); closeSheet(); toast('Anki ✓' + (ak.cards ? ' · ' + ak.cards + ' kart' : '') + (ak.minutes ? ' · ' + C.fmtMinutes(ak.minutes) : ''));
        break;
      case 'anki-undo':
        closeSheet();
        var todays = C.live(data).filter(function (x) { return x.type === 'anki' && x.date === today; });
        todays.forEach(function (x) { removeEvent(x.id); });
        toast('Bugünkü Anki kaldırıldı', [{ act: 'restore', v: todays.map(function (x) { return x.id; }).join(','), label: 'Geri al' }]);
        break;

      case 'undo': removeEvent(v); $toast.innerHTML = ''; break;
      case 'restore': v.split(',').forEach(restoreEvent); $toast.innerHTML = ''; break;
      case 'del':
        removeEvent(v);
        toast('Kayıt silindi', [{ act: 'restore', v: v, label: 'Geri al' }]);
        break;

      case 'book': bookSheet(v); break;
      case 'b-next':
        var bid = addEvent({ type: 'book', date: today, book: v, action: el.getAttribute('data-a') });
        closeSheet(); toast(bookName(v) + ' · ' + el.textContent, [{ act: 'undo', v: bid, label: 'Geri al' }]);
        break;
      case 'b-undo': removeEvent(v); closeSheet(); toast('Son adım geri alındı', [{ act: 'restore', v: v, label: 'Geri al' }]); break;

      case 'deck':
        if (ui.subject) addEvent({ type: 'deck', date: today, subject: ui.subject, state: v });
        break;

      case 's-token': saveToken(); break;
      case 's-form': cfg.mutfakForm = !cfg.mutfakForm; saveCfg(); settingsSheet(); render(); break;
      case 's-sync': doSync().then(function () { settingsSheet({ ok: ui.syncState === 'ok', text: ui.syncState === 'ok' ? 'Senkronlandı.' : 'Hata: ' + ui.syncMsg }); }); break;
      case 's-export':
        var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tus-' + today + '.json'; a.click();
        break;
      case 's-forget': cfg.token = ''; cfg.setupSkipped = true; saveCfg(); ui.syncState = 'idle'; settingsSheet(); render(); break;
    }
  });

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { render(); scheduleSync(0); } });
  window.addEventListener('online', function () { scheduleSync(0); });
  setInterval(function () { if (document.visibilityState === 'visible') { scheduleSync(0); } }, 90000);
  setInterval(function () { if (document.visibilityState === 'visible' && !$sheet.innerHTML) render(); }, 60000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

  render();
  scheduleSync(0);
})();
