/* ==========================================================================
   CLIPYIELD — client (advertiser / rights-holder) submission portal
   Functional front-end demo. Client accounts and submissions are stored in
   localStorage so the ID/PASS gate and 入稿フォーム work on GitHub Pages.
   NOTE: This is a prototype. Do NOT store real credentials here in production.
   ========================================================================== */
(function (global) {
  "use strict";

  var K = {
    clients: "cy_clients",     // { id: {id, pass, org} }
    session: "cy_client_sess", // logged-in client id
    subs: "cy_submissions"     // [ {..submission..} ]
  };

  function read(key, fb) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; }
    catch (e) { return fb; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ---- seed a demo client so reviewers can log in immediately ---- */
  function seed() {
    var c = read(K.clients, null);
    if (!c) {
      c = { "clip-demo": { id: "clip-demo", pass: "clip1234", org: "デモ・スタジオ株式会社" } };
      write(K.clients, c);
    }
    return c;
  }

  function login(id, pass) {
    var clients = seed();
    id = (id || "").trim();
    var c = clients[id];
    if (!c || c.pass !== pass) return { ok: false, error: "IDまたはパスワードが違います。" };
    write(K.session, id);
    return { ok: true, client: c };
  }
  function logout() { localStorage.removeItem(K.session); }
  function current() {
    var id = read(K.session, null);
    if (!id) return null;
    var clients = seed();
    return clients[id] || null;
  }
  function requireAuth(redirect) {
    var c = current();
    if (!c) { location.href = redirect || "client-login.html"; return null; }
    return c;
  }

  function listSubs() {
    var c = current();
    var all = read(K.subs, []);
    if (!c) return [];
    return all.filter(function (s) { return s.clientId === c.id; });
  }
  function saveSub(sub) {
    var c = current();
    if (!c) return null;
    var all = read(K.subs, []);
    sub.id = "SUB-" + Date.now().toString(36).toUpperCase();
    sub.clientId = c.id;
    sub.org = c.org;
    sub.createdAt = new Date().toISOString();
    sub.status = "審査待ち";
    all.push(sub);
    write(K.subs, all);
    return sub;
  }

  global.CYClient = {
    K: K, seed: seed, login: login, logout: logout, current: current,
    requireAuth: requireAuth, listSubs: listSubs, saveSub: saveSub
  };
})(window);
