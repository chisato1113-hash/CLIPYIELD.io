/* ==========================================================================
   CLIPYIELD — client-side app layer (no backend)
   Everything is persisted in localStorage so the flow works on GitHub Pages.
   NOTE: This is a functional front-end demo. Passwords are stored locally in
   the browser only and are NOT a substitute for real server-side auth.
   ========================================================================== */
(function (global) {
  "use strict";

  var K = {
    users: "cy_users_v1",
    session: "cy_session_v1"
  };

  /* ---- campaigns (shared catalogue, mirrors the landing board) ---- */
  var CAMPAIGNS = [
    {
      id: "blade",
      title: "BLADE OF THE LAST SUN",
      meta: "全24話・独占一次配信／EN・ES・TH・ID・KO",
      tier1: 0.03, tier2: 60, daysLeft: 42, budgetUsed: 34,
      status: "open", genre: "action",
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a1"
    },
    {
      id: "orbit",
      title: "SILENT ORBIT",
      meta: "全18話・独占一次配信／EN・ID・TH",
      tier1: 0.03, tier2: 55, daysLeft: 28, budgetUsed: 62,
      status: "open", genre: "fantasy",
      plats: ["TikTok", "Shorts", "Reels"], art: "a2"
    },
    {
      id: "hanabi",
      title: "NEON HANABI",
      meta: "全32話・独占一次配信／EN・KO・ZH・TH・ID",
      tier1: 0.03, tier2: 60, daysLeft: 60, budgetUsed: 11,
      status: "new", genre: "romance",
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a3"
    },
    {
      // View-only campaign: no merch, so TIER2 = 0 (higher TIER1 to compensate)
      id: "echo",
      title: "ECHOES OF TOKYO",
      meta: "全12話・独占一次配信／EN・JA・KO",
      tier1: 0.05, tier2: 0, daysLeft: 35, budgetUsed: 20,
      status: "open", genre: "fantasy",
      plats: ["TikTok", "Reels", "Shorts"], art: "a4"
    },
    {
      // View-only campaign (no merch line)
      id: "diner",
      title: "MIDNIGHT DINER STORIES",
      meta: "全20話・独占一次配信／EN・TH・ID・ZH",
      tier1: 0.04, tier2: 0, daysLeft: 50, budgetUsed: 8,
      status: "new", genre: "romance",
      plats: ["TikTok", "Shorts", "X"], art: "a5"
    }
  ];

  /* ---- SNS platforms (mirrors the landing "SNSをつなぐ" step) ---- */
  var SOCIAL_PLATFORMS = [
    { id: "tiktok", name: "TikTok",           abbr: "TT", color: "#010101", hint: "ユーザー名（例: your_handle）" },
    { id: "reels",  name: "Instagram Reels",  abbr: "IG", color: "linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)", hint: "ユーザー名" },
    { id: "shorts", name: "YouTube Shorts",   abbr: "YT", color: "#FF0000", hint: "チャンネル / ハンドル" },
    { id: "x",      name: "X（旧Twitter）",    abbr: "X",  color: "#000000", hint: "ユーザー名" }
  ];

  /* ---- tiny store helpers ---- */
  function read(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ---- password hashing (djb2 — obfuscation only, demo grade) ---- */
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function handleFromEmail(email) {
    var base = String(email).split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 14) || "clipper";
    return "@" + base;
  }

  /* ---- auth ---- */
  function getUsers() { return read(K.users, {}); }
  function saveUsers(u) { write(K.users, u); }

  function signup(email, password) {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("メールアドレスの形式が正しくありません。");
    if (!password || password.length < 6) throw new Error("パスワードは6文字以上で設定してください。");
    var users = getUsers();
    if (users[email]) throw new Error("このメールアドレスは既に登録されています。ログインしてください。");
    var user = {
      email: email,
      pass: hash(password),
      handle: handleFromEmail(email),
      createdAt: Date.now(),
      socials: [],
      joined: {},   // campaignId -> { joinedAt, ref }
      posts: [],    // { id, campaignId, url, views, sales, at }
      payoutMethod: "銀行振込"
    };
    users[email] = user;
    saveUsers(users);
    write(K.session, email);
    return user;
  }

  function login(email, password) {
    email = String(email || "").trim().toLowerCase();
    var users = getUsers();
    var user = users[email];
    if (!user || user.pass !== hash(password)) throw new Error("メールアドレスまたはパスワードが正しくありません。");
    write(K.session, email);
    return user;
  }

  function logout() { localStorage.removeItem(K.session); }

  function current() {
    var email = read(K.session, null);
    if (!email) return null;
    return getUsers()[email] || null;
  }

  function persist(user) {
    var users = getUsers();
    users[user.email] = user;
    saveUsers(users);
  }

  function requireAuth(redirect) {
    var u = current();
    if (!u) { location.href = redirect || "login.html"; return null; }
    return u;
  }

  /* ---- domain actions ---- */
  function refLink(user, campaignId) {
    return "https://clip.yield/r/" + user.handle.replace("@", "") + "/" + campaignId;
  }

  function joinCampaign(campaignId) {
    var u = current(); if (!u) return null;
    if (!u.joined[campaignId]) {
      u.joined[campaignId] = { joinedAt: Date.now(), ref: refLink(u, campaignId) };
      persist(u);
    }
    return u.joined[campaignId];
  }

  function addPost(campaignId, url, views, sales) {
    var u = current(); if (!u) return null;
    views = Math.max(0, parseInt(views, 10) || 0);
    sales = Math.max(0, parseInt(sales, 10) || 0);
    var post = {
      id: "p" + Date.now(),
      campaignId: campaignId,
      url: url,
      views: views,
      sales: sales,
      at: Date.now()
    };
    u.posts.unshift(post);
    persist(u);
    return post;
  }

  function campaignById(id) {
    for (var i = 0; i < CAMPAIGNS.length; i++) if (CAMPAIGNS[i].id === id) return CAMPAIGNS[i];
    return null;
  }

  /* ---- SNS linking (demo: stores handle per platform, no real OAuth) ---- */
  function connectSocial(platformId, handle) {
    var u = current(); if (!u) return null;
    handle = String(handle || "").trim().replace(/^@+/, "").replace(/\s+/g, "");
    if (!handle) throw new Error("ユーザー名を入力してください。");
    u.socials = (u.socials || []).filter(function (s) { return s.platform !== platformId; });
    var rec = { platform: platformId, handle: "@" + handle, connectedAt: Date.now() };
    u.socials.push(rec);
    persist(u);
    return rec;
  }
  function disconnectSocial(platformId) {
    var u = current(); if (!u) return;
    u.socials = (u.socials || []).filter(function (s) { return s.platform !== platformId; });
    persist(u);
  }
  function socialFor(platformId) {
    var u = current(); if (!u) return null;
    var f = (u.socials || []).filter(function (s) { return s.platform === platformId; });
    return f.length ? f[0] : null;
  }

  /* earnings computed from the user's registered posts */
  function earnings(user) {
    var t1 = 0, t2 = 0, views = 0, orders = 0;
    (user.posts || []).forEach(function (p) {
      var c = campaignById(p.campaignId) || { tier1: 0.03, tier2: 60 };
      t1 += p.views * c.tier1;
      t2 += p.sales * (c.tier2 / 100);
      views += p.views;
      if (p.sales > 0) orders += 1;
    });
    return {
      tier1: Math.round(t1),
      tier2: Math.round(t2),
      total: Math.round(t1 + t2),
      views: views,
      orders: orders,
      posts: (user.posts || []).length
    };
  }

  /* ---- formatting ---- */
  function yen(n) { return "¥" + Math.round(n).toLocaleString("ja-JP"); }
  function num(n) { return Number(n).toLocaleString("ja-JP"); }

  /* ---- ui helpers ---- */
  function toast(msg) {
    var el = document.getElementById("cy-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "cy-toast"; el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("on"); }, 2200);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  global.CY = {
    CAMPAIGNS: CAMPAIGNS,
    SOCIAL_PLATFORMS: SOCIAL_PLATFORMS,
    signup: signup, login: login, logout: logout, current: current,
    requireAuth: requireAuth, persist: persist,
    joinCampaign: joinCampaign, addPost: addPost, campaignById: campaignById,
    connectSocial: connectSocial, disconnectSocial: disconnectSocial, socialFor: socialFor,
    earnings: earnings, refLink: refLink,
    yen: yen, num: num, toast: toast, esc: esc
  };
})(window);
