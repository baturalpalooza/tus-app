// sync.js — keeps data.json in the private GitHub repo in step with the local copy.
(function (root) {
  'use strict';
  var Core = root.Core || (typeof require !== 'undefined' ? require('./core.js') : null);

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function url(cfg) {
    return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path;
  }
  function headers(cfg) {
    return { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  // -> {data, sha} ; data null + sha null when the file does not exist yet
  async function pull(cfg, fetchFn) {
    var res = await fetchFn(url(cfg) + '?t=' + Date.now(), { headers: headers(cfg), cache: 'no-store' });
    if (res.status === 404) return { data: null, sha: null };
    if (res.status === 401) throw new Error('Anahtar geçersiz ya da süresi dolmuş.');
    if (!res.ok) throw new Error('GitHub ' + res.status);
    var j = await res.json();
    var text = j.content ? b64decode(j.content) : '';
    var data = text ? JSON.parse(text) : Core.emptyData();
    return { data: data, sha: j.sha };
  }

  async function push(cfg, data, sha, fetchFn) {
    var body = { message: 'app: ' + new Date().toISOString(), content: b64encode(JSON.stringify(data, null, 1) + '\n') };
    if (sha) body.sha = sha;
    var res = await fetchFn(url(cfg), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers(cfg)), body: JSON.stringify(body) });
    if (res.status === 409 || res.status === 422) return { conflict: true };
    if (res.status === 403 || res.status === 404) throw new Error('Anahtarın yazma izni yok (Contents: Read and write olmalı).');
    if (res.status === 401) throw new Error('Anahtar geçersiz ya da süresi dolmuş.');
    if (!res.ok) throw new Error('GitHub ' + res.status);
    var j = await res.json();
    return { sha: j.content.sha };
  }

  // Merge local with remote; push if remote lacks anything. Returns merged data.
  async function sync(cfg, local, fetchFn) {
    fetchFn = fetchFn || fetch.bind(root);
    for (var attempt = 0; attempt < 4; attempt++) {
      var r = await pull(cfg, fetchFn);
      var remote = r.data || Core.emptyData();
      var merged = Core.merge(remote, local);
      if (r.data && Core.covers(remote, merged)) return merged;
      var p = await push(cfg, merged, r.sha, fetchFn);
      if (!p.conflict) return merged;
      local = merged;
    }
    throw new Error('Çakışma çözülemedi');
  }

  async function test(cfg, fetchFn) {
    fetchFn = fetchFn || fetch.bind(root);
    var res = await fetchFn('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo, { headers: headers(cfg), cache: 'no-store' });
    if (res.status === 401) return 'Anahtar geçersiz.';
    if (res.status === 404) return 'Repo bulunamadı ya da anahtarın bu repoya izni yok.';
    if (!res.ok) return 'GitHub hatası: ' + res.status;
    var j = await res.json();
    if (j.permissions && !j.permissions.push) return 'Anahtarın yazma izni yok (Contents: Read and write olmalı).';
    return '';
  }

  var api = { sync: sync, pull: pull, push: push, test: test, b64encode: b64encode, b64decode: b64decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Sync = api;
})(typeof window !== 'undefined' ? window : globalThis);
