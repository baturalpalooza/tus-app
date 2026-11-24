// Run: node tests/core.test.js
const assert = require('assert');
const C = require('../core.js');
global.Core = C;
const S = require('../sync.js');

let n = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(() => { n++; console.log('ok  ' + name); }, (e) => { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }); }

const now = new Date(2026, 10, 24, 20, 0); // 24 Nov 2026 20:00 local
const T = (d, h) => new Date(2026, 10, d, h || 12).toISOString();
const ev = (o) => Object.assign({ id: C.newId(), t: T(24) }, o);

(async () => {
  await test('25 volumes', () => assert.strictEqual(C.allBooks().length, 25));

  await test('streak counts back from today, gap breaks it', () => {
    const d = { events: [20, 21, 22, 23, 24].map((x) => ev({ type: 'anki', date: '2026-11-' + x, t: T(x) })).concat([ev({ type: 'anki', date: '2026-11-17', t: T(17) })]) };
    const s = C.derive(d, now);
    assert.strictEqual(s.streak, 5); assert.strictEqual(s.bestStreak, 5); assert.ok(s.ankiToday);
  });

  await test('streak survives until today is done (counts from yesterday)', () => {
    const d = { events: [22, 23].map((x) => ev({ type: 'anki', date: '2026-11-' + x, t: T(x) })) };
    const s = C.derive(d, now);
    assert.strictEqual(s.streak, 2); assert.ok(!s.ankiToday);
  });

  await test('deleted events are ignored', () => {
    const d = { events: [ev({ type: 'anki', date: '2026-11-24', deleted: true })] };
    assert.strictEqual(C.derive(d, now).streak, 0);
  });

  await test('anki cards/minutes kept per day and drive darkness', () => {
    const d = { events: [ev({ type: 'anki', date: '2026-11-24', minutes: 60, cards: 420 })] };
    const a = C.derive(d, now).anki['2026-11-24'];
    assert.deepStrictEqual(a, { minutes: 60, cards: 420 });
    assert.strictEqual(C.ankiLevel(a), 3);
    assert.strictEqual(C.ankiLevel({ cards: 120, minutes: 0 }), 1);
    assert.strictEqual(C.ankiLevel({ cards: 200, minutes: 0 }), 2);
    assert.strictEqual(C.ankiLevel({ cards: 0, minutes: 30 }), 2);
    assert.strictEqual(C.ankiLevel({ cards: 0, minutes: 0 }), 1);
    const d2 = { events: [ev({ type: 'anki', date: '2026-11-24' })] };
    assert.ok(C.derive(d2, now).ankiToday);
  });

  await test('pages: filling and reading counted apart', () => {
    const d = { events: [
      ev({ type: 'study', date: '2026-11-24', subject: 'patoloji', minutes: 90, kind: 'fill', pages: 50 }),
      ev({ type: 'study', date: '2026-11-23', subject: 'genel-cerrahi', minutes: 60, kind: 'read', pages: 15, t: T(23) }),
      ev({ type: 'anki', date: '2026-11-23', cards: 300, t: T(23) })
    ] };
    const s = C.derive(d, now);
    assert.strictEqual(s.weekFill, 50); assert.strictEqual(s.weekRead, 15); assert.strictEqual(s.weekCards, 300);
    assert.strictEqual(s.weekPages, 65);
    assert.ok(C.facts(s).indexOf('Bu hafta 65 sayfa çalıştın: 50 sayfa doldurma, 15 sayfa tekrar.') >= 0);
  });

  await test('study totals, week, gaps, last study', () => {
    const d = { events: [
      ev({ type: 'study', date: '2026-11-24', subject: 'patoloji', minutes: 90, t: T(24, 17) }),
      ev({ type: 'study', date: '2026-11-10', subject: 'farmakoloji', minutes: 60, t: T(10) }),
      ev({ type: 'study', date: '2026-11-20', subject: 'patoloji', minutes: 30, t: T(20) })
    ] };
    const s = C.derive(d, now);
    assert.strictEqual(s.todayMinutes, 90); assert.strictEqual(s.week, 120); assert.strictEqual(s.total, 180);
    const g = Object.fromEntries(s.gaps.map((x) => [x.id, x.days]));
    assert.strictEqual(g.patoloji, 0); assert.strictEqual(g.farmakoloji, 14); assert.strictEqual(g.anatomi, null);
    assert.strictEqual(s.lastStudy.event.subject, 'patoloji');
  });

  await test('a "yesterday" entry counts as 21:00 that day', () => {
    const e = ev({ type: 'study', date: '2026-11-23', subject: 'patoloji', minutes: 60, t: T(24, 9) });
    assert.strictEqual(C.whenOf(e).getHours(), 21); assert.strictEqual(C.whenOf(e).getDate(), 23);
  });

  await test('book stages and cells', () => {
    const k = 'patoloji-1';
    let d = { events: [ev({ type: 'book', book: k, action: 'start', date: '2026-11-21' })] };
    let st = C.derive(d, now).books[k];
    assert.deepStrictEqual(C.bookCells(st), [1, 2, 0, 0, 0]);
    assert.strictEqual(C.nextBookAction(st).action, 'filled');
    assert.strictEqual(C.derive(d, now).running.length, 1);
    d.events.push(ev({ type: 'book', book: k, action: 'filled', date: '2026-11-30', t: T(30) }));
    d.events.push(ev({ type: 'book', book: k, action: 'readStart', date: '2026-11-30', t: T(30, 13) }));
    st = C.derive(d, now).books[k];
    assert.deepStrictEqual(C.bookCells(st), [1, 1, 2, 0, 0]);
    d.events.push(ev({ type: 'book', book: k, action: 'readDone', date: '2026-11-30', t: T(30, 14) }));
    st = C.derive(d, now).books[k];
    assert.deepStrictEqual(C.bookCells(st), [1, 1, 1, 0, 0]);
    assert.strictEqual(C.nextBookAction(st).label, '2. okumaya başladım');
    assert.strictEqual(C.derive(d, now).filledCount, 1);
  });

  await test('merge: union by id, deleted wins, sorted by t', () => {
    const a = { events: [{ id: 'x', t: '2', type: 'anki', date: 'd' }, { id: 'y', t: '1', type: 'anki', date: 'd' }] };
    const b = { events: [{ id: 'x', t: '2', type: 'anki', date: 'd', deleted: true }, { id: 'z', t: '3', type: 'anki', date: 'd' }] };
    const m = C.merge(a, b);
    assert.deepStrictEqual(m.events.map((e) => e.id), ['y', 'x', 'z']);
    assert.ok(m.events[1].deleted);
    assert.ok(C.covers(m, a) && C.covers(m, b)); assert.ok(!C.covers(a, b));
  });

  await test('base64 round-trip keeps Turkish letters', () => {
    const s = 'Küçük Stajlar · Kadın Doğum · ışık ğüşiöç';
    assert.strictEqual(S.b64decode(S.b64encode(s)), s);
  });

  // --- sync against a fake GitHub ---
  function fakeGitHub(initial) {
    const store = { text: initial ? JSON.stringify(initial) : null, sha: initial ? 'sha0' : null, puts: 0, failNextPut: false };
    async function f(url, opts) {
      opts = opts || {};
      const json = (status, body) => ({ status, ok: status < 300, json: async () => body });
      if (!opts.method || opts.method === 'GET') {
        if (!store.text) return json(404, {});
        return json(200, { sha: store.sha, content: S.b64encode(store.text) });
      }
      const body = JSON.parse(opts.body);
      if (store.failNextPut) { store.failNextPut = false; store.text = JSON.stringify({ version: 1, events: [{ id: 'other', t: 'zz', type: 'anki', date: 'd' }] }); store.sha = 'shaX'; return json(409, {}); }
      if ((body.sha || null) !== store.sha) return json(409, {});
      store.text = S.b64decode(body.content); store.sha = 'sha' + (++store.puts);
      return json(201, { content: { sha: store.sha } });
    }
    return { f, store };
  }
  const cfg = { owner: 'o', repo: 'r', path: 'data.json', token: 't' };

  await test('sync creates data.json when missing', async () => {
    const gh = fakeGitHub(null);
    const local = { version: 1, events: [{ id: 'a', t: '1', type: 'anki', date: 'd' }] };
    const m = await S.sync(cfg, local, gh.f);
    assert.strictEqual(m.events.length, 1); assert.strictEqual(gh.store.puts, 1);
    assert.strictEqual(JSON.parse(gh.store.text).events[0].id, 'a');
  });

  await test('sync pulls remote-only events without pushing', async () => {
    const gh = fakeGitHub({ version: 1, events: [{ id: 'r', t: '1', type: 'anki', date: 'd', by: 'claude' }] });
    const m = await S.sync(cfg, { version: 1, events: [] }, gh.f);
    assert.deepStrictEqual(m.events.map((e) => e.id), ['r']); assert.strictEqual(gh.store.puts, 0);
  });

  await test('sync retries after a conflict and keeps both sides', async () => {
    const gh = fakeGitHub({ version: 1, events: [] });
    gh.store.failNextPut = true;
    const m = await S.sync(cfg, { version: 1, events: [{ id: 'mine', t: 'a', type: 'anki', date: 'd' }] }, gh.f);
    const ids = JSON.parse(gh.store.text).events.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ['mine', 'other']); assert.strictEqual(m.events.length, 2);
  });

  await test('facts mention the neglected subject', () => {
    const d = { events: [ev({ type: 'study', date: '2026-11-01', subject: 'farmakoloji', minutes: 60, t: T(1) }), ev({ type: 'study', date: '2026-11-24', subject: 'patoloji', minutes: 60 })] };
    assert.ok(C.facts(C.derive(d, now)).some((f) => f === '23 gündür Farmakoloji çalışmadın.'));
  });

  await test('deck progress: latest count per subject', () => {
    const d = { events: [ev({ type: 'deckCount', subject: 'patoloji', seen: 400, total: 2800, t: T(20), date: '2026-11-20' }), ev({ type: 'deckCount', subject: 'patoloji', seen: 700, total: 2800, date: '2026-11-24' })] };
    const s = C.derive(d, now);
    assert.deepStrictEqual(s.deckCounts.patoloji, { seen: 700, total: 2800, date: '2026-11-24' });
    assert.ok(C.facts(s).some((f) => f === 'Patoloji Anki destesinin %25’ini gördün (700 / 2800 kart).'));
  });

  console.log(n + ' passed');
})();
