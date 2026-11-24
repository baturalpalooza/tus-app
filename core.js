// core.js — data model, derived stats, merge. No DOM here (testable in Node).
(function (root) {
  'use strict';

  var SUBJECTS = [
    { id: 'anatomi', name: 'Anatomi', group: 'temel', vols: 1 },
    { id: 'fizyoloji', name: 'Fizyoloji', group: 'temel', vols: 2 },
    { id: 'biyokimya', name: 'Biyokimya', group: 'temel', vols: 2 },
    { id: 'mikrobiyoloji', name: 'Mikrobiyoloji', group: 'temel', vols: 2 },
    { id: 'patoloji', name: 'Patoloji', group: 'temel', vols: 2 },
    { id: 'farmakoloji', name: 'Farmakoloji', group: 'temel', vols: 2 },
    { id: 'dahiliye', name: 'Dahiliye', group: 'klinik', vols: 4 },
    { id: 'pediatri', name: 'Pediatri', group: 'klinik', vols: 3 },
    { id: 'genel-cerrahi', name: 'Genel Cerrahi', group: 'klinik', vols: 2 },
    { id: 'kadin-dogum', name: 'Kadın Doğum', group: 'klinik', vols: 2 },
    { id: 'kucuk-stajlar', name: 'Küçük Stajlar', group: 'klinik', vols: 3 }
  ];

  function subjectById(id) {
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].id === id) return SUBJECTS[i];
    return null;
  }

  function allBooks() {
    var out = [];
    SUBJECTS.forEach(function (s) {
      for (var v = 1; v <= s.vols; v++) out.push({ key: s.id + '-' + v, subject: s.id, name: s.name, vol: v, group: s.group });
    });
    return out;
  }

  // ---- dates (local time) ----
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = parseDay(k); d.setDate(d.getDate() + n); return dateKey(d); }
  function dayDiff(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }

  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function emptyData() { return { version: 1, events: [] }; }

  // ---- merge: union by id; deleted wins ----
  function merge(a, b) {
    var map = {}, order = [];
    [a, b].forEach(function (d) {
      ((d && d.events) || []).forEach(function (e) {
        if (!e || !e.id) return;
        if (!map[e.id]) { map[e.id] = JSON.parse(JSON.stringify(e)); order.push(e.id); }
        else if (e.deleted && !map[e.id].deleted) { map[e.id].deleted = true; if (e.deletedAt) map[e.id].deletedAt = e.deletedAt; }
      });
    });
    var events = order.map(function (id) { return map[id]; });
    events.sort(function (x, y) { return x.t < y.t ? -1 : x.t > y.t ? 1 : 0; });
    return { version: 1, events: events };
  }

  // true when b has nothing a lacks (same ids, same deleted flags)
  function covers(a, b) {
    var m = {};
    (a.events || []).forEach(function (e) { m[e.id] = !!e.deleted; });
    return (b.events || []).every(function (e) { return e.id in m && (m[e.id] || !e.deleted); });
  }

  function live(data) { return (data.events || []).filter(function (e) { return !e.deleted; }); }

  // moment an event "happened": its timestamp if logged that day, else 21:00 of its date
  function whenOf(e) {
    var t = new Date(e.t);
    if (e.date && dateKey(t) !== e.date) { var d = parseDay(e.date); d.setHours(21, 0, 0, 0); return d; }
    return t;
  }

  // ---- derived state ----
  function derive(data, now) {
    now = now || new Date();
    var today = dateKey(now);
    var ev = live(data);

    var anki = {}; // date -> minutes (0 = done without time)
    var studyByDay = {}; // date -> minutes
    var lastBySubject = {}; // subject -> date
    var minutesBySubject = {};
    var questionsBySubject = {};
    var lastStudy = null;
    var books = {};
    var decks = {};
    var studies = [];
    var pagesFilled = {}, pagesRead = {};

    allBooks().forEach(function (b) { books[b.key] = { started: false, filled: false, reads: 0, reading: false, startedOn: null, stageSince: null }; });

    ev.forEach(function (e) {
      if (e.type === 'anki') {
        var cur = anki[e.date] || { minutes: 0, cards: 0 };
        anki[e.date] = { minutes: Math.max(cur.minutes, e.minutes || 0), cards: Math.max(cur.cards, e.cards || 0) };
      } else if (e.type === 'study') {
        studies.push(e);
        studyByDay[e.date] = (studyByDay[e.date] || 0) + (e.minutes || 0);
        if (e.pages) {
          var bucket = e.kind === 'read' ? pagesRead : pagesFilled;
          bucket[e.date] = (bucket[e.date] || 0) + e.pages;
        }
        if (e.subject) {
          if (!lastBySubject[e.subject] || lastBySubject[e.subject] < e.date) lastBySubject[e.subject] = e.date;
          minutesBySubject[e.subject] = (minutesBySubject[e.subject] || 0) + (e.minutes || 0);
          if (e.questions) questionsBySubject[e.subject] = (questionsBySubject[e.subject] || 0) + e.questions;
        }
        var w = whenOf(e);
        if (!lastStudy || w > lastStudy.when) lastStudy = { when: w, event: e };
      } else if (e.type === 'book' && books[e.book]) {
        var b = books[e.book];
        if (e.action === 'start') { b.started = true; b.startedOn = e.date; b.stageSince = e.date; }
        else if (e.action === 'filled') { b.started = true; b.filled = true; b.stageSince = e.date; }
        else if (e.action === 'readStart') { b.started = true; b.filled = true; b.reading = true; b.stageSince = e.date; }
        else if (e.action === 'readDone') { b.started = true; b.filled = true; b.reading = false; b.reads += 1; b.stageSince = e.date; }
      } else if (e.type === 'deck' && e.subject) {
        decks[e.subject] = e.state;
      }
    });

    // streak: consecutive days ending today, or yesterday if today not done yet
    function runFrom(k) { var n = 0; while (k in anki) { n++; k = addDays(k, -1); } return n; }
    var streak = (today in anki) ? runFrom(today) : runFrom(addDays(today, -1));
    var best = 0;
    Object.keys(anki).forEach(function (k) { if (!(addDays(k, 1) in anki)) best = Math.max(best, runFrom(k)); });

    function sumDays(from, to) { var s = 0; for (var k = from; k <= to; k = addDays(k, 1)) s += studyByDay[k] || 0; return s; }
    var week = sumDays(addDays(today, -6), today);
    function sumMap(m, from, to) { var t = 0; Object.keys(m).forEach(function (k) { if (k >= from && k <= to) t += m[k]; }); return t; }
    var weekFill = sumMap(pagesFilled, addDays(today, -6), today), weekRead = sumMap(pagesRead, addDays(today, -6), today);
    var weekCards = sumMap(Object.keys(anki).reduce(function (o, k) { o[k] = anki[k].cards; return o; }, {}), addDays(today, -6), today);
    var prevWeek = sumDays(addDays(today, -13), addDays(today, -7));
    var total = 0; Object.keys(studyByDay).forEach(function (k) { total += studyByDay[k]; });

    var gaps = SUBJECTS.map(function (s) {
      var d = lastBySubject[s.id];
      return { id: s.id, name: s.name, days: d ? dayDiff(d, today) : null, minutes: minutesBySubject[s.id] || 0 };
    });

    var running = allBooks().filter(function (b) { var st = books[b.key]; return (st.started && !st.filled) || st.reading; });
    var filledCount = allBooks().filter(function (b) { return books[b.key].filled; }).length;

    return {
      today: today, anki: anki, ankiToday: today in anki, streak: streak, bestStreak: best,
      studyByDay: studyByDay, todayMinutes: studyByDay[today] || 0, week: week, prevWeek: prevWeek, total: total,
      lastStudy: lastStudy, gaps: gaps, books: books, running: running, filledCount: filledCount, bookCount: allBooks().length,
      decks: decks, studies: studies, questionsBySubject: questionsBySubject,
      weekFill: weekFill, weekRead: weekRead, weekCards: weekCards,
      totalFill: sumMap(pagesFilled, '0', '9'), totalRead: sumMap(pagesRead, '0', '9')
    };
  }

  function nextBookAction(st) {
    if (!st.started) return { action: 'start', label: 'Başladım' };
    if (!st.filled) return { action: 'filled', label: 'Doldurmayı bitirdim' };
    if (!st.reading) return { action: 'readStart', label: (st.reads + 1) + '. okumaya başladım' };
    return { action: 'readDone', label: (st.reads + 1) + '. okumayı bitirdim' };
  }

  // 0 empty, 1 done, 2 running — for the 5 cells Başla, Doldur, Oku 1..3
  function bookCells(st) {
    var c = [st.started ? 1 : 0, st.filled ? 1 : (st.started ? 2 : 0)];
    for (var k = 1; k <= 3; k++) c.push(st.reads >= k ? 1 : (st.reading && st.reads === k - 1 ? 2 : 0));
    return c;
  }

  // chain darkness: 1 light .. 3 dark. Cards win over minutes when both exist.
  function ankiLevel(a) {
    if (!a) return 0;
    if (a.cards) return a.cards >= 400 ? 3 : a.cards >= 150 ? 2 : 1;
    if (a.minutes) return a.minutes >= 60 ? 3 : 2;
    return 1;
  }

  function fmtMinutes(m) {
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' dk';
    if (!r) return h + ' sa';
    return h + ' sa ' + r + ' dk';
  }

  function facts(s) {
    var out = [];
    if (s.week || s.prevWeek) {
      var diff = s.week - s.prevWeek;
      out.push('Son 7 günde ' + fmtMinutes(s.week) + ' çalıştın.' + (s.prevWeek ? ' Önceki haftadan ' + fmtMinutes(Math.abs(diff)) + (diff >= 0 ? ' fazla.' : ' az.') : ''));
    }
    var studied = s.gaps.filter(function (g) { return g.days !== null; }).sort(function (a, b) { return b.days - a.days; });
    if (studied.length && studied[0].days >= 3) out.push(studied[0].days + ' gündür ' + studied[0].name + ' çalışmadın.');
    if (s.streak >= 2) out.push('Anki zincirin ' + s.streak + ' gün.' + (s.bestStreak > s.streak ? ' Rekorun ' + s.bestStreak + ' gün.' : ' Bu senin rekorun.'));
    if (s.weekFill || s.weekRead) out.push('Bu hafta ' + [s.weekFill ? s.weekFill + ' sayfa doldurdun' : '', s.weekRead ? s.weekRead + ' sayfa okudun' : ''].filter(Boolean).join(', ') + '.');
    if (s.weekCards) out.push('Son 7 günde Anki’de ' + s.weekCards + ' kart çevirdin.');
    if (s.total >= 60) out.push('Toplam ' + Math.round(s.total / 60) + ' saat çalıştın.');
    if (s.filledCount) out.push(s.bookCount + ' ciltten ' + s.filledCount + ' tanesini doldurdun.');
    var never = s.gaps.filter(function (g) { return g.days === null; });
    if (studied.length && never.length && never.length <= 4) out.push('Henüz hiç kayıt girmediğin dersler: ' + never.map(function (g) { return g.name; }).join(', ') + '.');
    return out;
  }

  var api = {
    SUBJECTS: SUBJECTS, subjectById: subjectById, allBooks: allBooks,
    dateKey: dateKey, addDays: addDays, dayDiff: dayDiff, parseDay: parseDay,
    newId: newId, emptyData: emptyData, merge: merge, covers: covers, live: live,
    derive: derive, ankiLevel: ankiLevel, nextBookAction: nextBookAction, bookCells: bookCells, fmtMinutes: fmtMinutes, facts: facts, whenOf: whenOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(this);
