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

  // Simulated SNS review time. In production this is staff review (1–2 business
  // days); in this demo a connected account auto-approves after a few seconds.
  var REVIEW_MS = 4000;
  // Simulated KYC (本人確認) review time.
  var KYC_REVIEW_MS = 5000;

  // Accepted identity documents for the KYC flow.
  var DOC_TYPES = [
    { id: "passport", name: "パスポート",           note: "顔写真のあるページ" },
    { id: "license",  name: "運転免許証",           note: "表面" },
    { id: "mynumber", name: "マイナンバーカード",   note: "顔写真のある面" }
  ];
  function docTypeName(id) {
    for (var i = 0; i < DOC_TYPES.length; i++) if (DOC_TYPES[i].id === id) return DOC_TYPES[i].name;
    return id || "";
  }

  /* ---- categories (media type) ---- */
  var CATEGORIES = [
    { id: "all",     name: "すべて" },
    { id: "movie",   name: "映画" },
    { id: "drama",   name: "ドラマ" },
    { id: "anime",   name: "アニメ" },
    { id: "music",   name: "音楽" },
    { id: "manga",   name: "漫画" },
    { id: "youtube", name: "YouTube" }
  ];
  function categoryName(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].name;
    return id || "";
  }

  /* ---- countries a campaign is recruiting clippers for ---- */
  var COUNTRIES = {
    US: { flag: "🇺🇸", name: "アメリカ" },
    JP: { flag: "🇯🇵", name: "日本" },
    KR: { flag: "🇰🇷", name: "韓国" },
    CN: { flag: "🇨🇳", name: "中国" },
    TW: { flag: "🇹🇼", name: "台湾" },
    TH: { flag: "🇹🇭", name: "タイ" },
    ID: { flag: "🇮🇩", name: "インドネシア" },
    PH: { flag: "🇵🇭", name: "フィリピン" },
    VN: { flag: "🇻🇳", name: "ベトナム" },
    ES: { flag: "🇪🇸", name: "スペイン語圏" }
  };
  function country(code) { return COUNTRIES[code] || { flag: "🏳️", name: code }; }

  /* ---- campaigns (shared catalogue) ---- */
  var CAMPAIGNS = [
    // ---- アニメ ----
    {
      id: "blade", category: "anime",
      title: "BLADE OF THE LAST SUN",
      meta: "アニメ・全24話／独占一次配信",
      countries: ["US", "ES", "TH", "ID", "KR"],
      tier1: 0.03, tier2: 60, daysLeft: 42, budgetUsed: 34,
      status: "open", requiresId: true,
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a1"
    },
    {
      id: "hanabi", category: "anime",
      title: "NEON HANABI",
      meta: "アニメ・全32話／独占一次配信",
      countries: ["US", "KR", "CN", "TH", "ID"],
      tier1: 0.03, tier2: 60, daysLeft: 60, budgetUsed: 11,
      status: "new", requiresId: true,
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a3"
    },
    // ---- 漫画 ----
    {
      id: "orbit", category: "manga",
      title: "SILENT ORBIT",
      meta: "漫画・全18話／独占先行配信",
      countries: ["US", "ID", "TH"],
      tier1: 0.03, tier2: 55, daysLeft: 28, budgetUsed: 62,
      status: "open", requiresId: true,
      plats: ["TikTok", "Shorts", "Reels"], art: "a2"
    },
    {
      id: "echo", category: "manga",
      title: "ECHOES OF TOKYO",
      meta: "漫画・全12話／独占先行配信",
      countries: ["US", "JP", "KR"],
      tier1: 0.05, tier2: 0, daysLeft: 35, budgetUsed: 20,
      status: "open", requiresId: false,
      plats: ["TikTok", "Reels", "Shorts"], art: "a4"
    },
    // ---- 映画 ----
    {
      id: "shibuya", category: "movie",
      title: "MIDNIGHT IN SHIBUYA",
      meta: "映画・本編118分／公式予告＆名シーン",
      countries: ["JP", "US", "TW", "TH"],
      tier1: 0.04, tier2: 50, daysLeft: 45, budgetUsed: 18,
      status: "new", requiresId: true,
      plats: ["TikTok", "Reels", "Shorts"], art: "a5"
    },
    {
      id: "ferry", category: "movie",
      title: "THE LAST FERRY",
      meta: "映画・本編96分／公式クリップ配布",
      countries: ["US", "ID", "PH"],
      tier1: 0.03, tier2: 0, daysLeft: 30, budgetUsed: 41,
      status: "open", requiresId: false,
      plats: ["TikTok", "Shorts", "X"], art: "a1"
    },
    // ---- ドラマ ----
    {
      id: "office2049", category: "drama",
      title: "OFFICE 2049",
      meta: "ドラマ・全10話／独占配信・見どころ",
      countries: ["JP", "KR", "TW"],
      tier1: 0.03, tier2: 45, daysLeft: 52, budgetUsed: 27,
      status: "open", requiresId: true,
      plats: ["TikTok", "Reels", "Shorts"], art: "a2"
    },
    {
      id: "hanasaku", category: "drama",
      title: "花咲く頃に",
      meta: "ドラマ・全8話／公式名場面",
      countries: ["JP", "TW", "TH"],
      tier1: 0.04, tier2: 0, daysLeft: 38, budgetUsed: 9,
      status: "new", requiresId: false,
      plats: ["TikTok", "Shorts", "Reels"], art: "a3"
    },
    // ---- 音楽 ----
    {
      id: "aurora", category: "music",
      title: "AURORA SOUND",
      meta: "音楽・公式MV／アーティスト公認",
      countries: ["US", "KR", "JP", "ID"],
      tier1: 0.05, tier2: 40, daysLeft: 25, budgetUsed: 55,
      status: "open", requiresId: true,
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a4"
    },
    {
      id: "yoake", category: "music",
      title: "夜明けのメロディ",
      meta: "音楽・公式ライブ映像／切り抜き公認",
      countries: ["JP", "TW", "KR"],
      tier1: 0.04, tier2: 0, daysLeft: 47, budgetUsed: 13,
      status: "new", requiresId: false,
      plats: ["TikTok", "Shorts", "Reels"], art: "a5"
    },
    // ---- YouTube ----
    {
      id: "gamelegends", category: "youtube",
      title: "GAME LEGENDS 実況アーカイブ",
      meta: "YouTube・公式アーカイブ／許諾済み",
      countries: ["US", "ID", "PH", "TH"],
      tier1: 0.03, tier2: 35, daysLeft: 33, budgetUsed: 22,
      status: "open", requiresId: true,
      plats: ["TikTok", "Shorts", "Reels"], art: "a1"
    },
    {
      id: "creatorclip", category: "youtube",
      title: "クリエイター公式クリップ",
      meta: "YouTube・公式チャンネル素材／公認",
      countries: ["US", "JP", "ID"],
      tier1: 0.04, tier2: 0, daysLeft: 58, budgetUsed: 6,
      status: "new", requiresId: false,
      plats: ["TikTok", "Shorts", "X"], art: "a3"
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
      socials: [],  // { platform, handle, status: "pending"|"approved", connectedAt }
      joined: {},   // campaignId -> { joinedAt, ref }
      posts: [],    // { id, campaignId, url, views, sales, at }
      identity: { status: "none" }, // 本人確認（KYC）: none|pending|verified
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
    var c = campaignById(campaignId);
    if (c && c.requiresId && !identityVerified()) {
      throw new Error("この案件への参加には本人確認（個人ID登録）が必要です。");
    }
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
    // New connections enter review ("審査中") before they are approved.
    var rec = { platform: platformId, handle: "@" + handle, status: "pending", connectedAt: Date.now() };
    u.socials.push(rec);
    persist(u);
    return rec;
  }
  // Flip any pending SNS reviews that have passed the (simulated) review window.
  function refreshSocialReviews() {
    var u = current(); if (!u) return false;
    var changed = false, now = Date.now();
    (u.socials || []).forEach(function (s) {
      if (s.status === "pending" && now - (s.connectedAt || 0) >= REVIEW_MS) {
        s.status = "approved"; s.approvedAt = now; changed = true;
      }
    });
    if (changed) persist(u);
    return changed;
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
  // Legacy records (before review existed) are treated as approved.
  function socialStatus(s) { return s ? (s.status || "approved") : null; }
  function approvedSocialCount() {
    var u = current(); if (!u) return 0;
    return (u.socials || []).filter(function (s) { return socialStatus(s) === "approved"; }).length;
  }

  /* ---- 本人確認（KYC）: gates campaigns flagged requiresId ----
     Submitted on the dedicated kyc.html page. IMPORTANT: uploaded document /
     selfie images are NEVER stored — only the document type + status metadata.
     In production this connects to a KYC provider. */
  function submitKyc(info) {
    var u = current(); if (!u) return null;
    info = info || {};
    if (!info.docType)     throw new Error("本人確認書類の種類を選択してください。");
    if (!info.hasDocument) throw new Error("本人確認書類の画像をアップロードしてください。");
    if (!info.hasSelfie)   throw new Error("セルフィー（顔写真）をアップロードしてください。");
    u.identity = {
      status: "pending",
      docType: info.docType,
      name: String(info.name || "").trim(),
      submittedAt: Date.now()
    };
    persist(u);
    return u.identity;
  }
  // Flip a pending KYC to verified once the (simulated) review window passes.
  function refreshKycReview() {
    var u = current(); if (!u) return false;
    var id = u.identity;
    if (id && id.status === "pending" && Date.now() - (id.submittedAt || 0) >= KYC_REVIEW_MS) {
      id.status = "verified"; id.verifiedAt = Date.now();
      persist(u); return true;
    }
    return false;
  }
  function identityStatus() {
    var u = current(); if (!u) return "none";
    var id = u.identity;
    if (!id) return "none";
    if (id.registered === true) return "verified"; // legacy records
    return id.status || "none";
  }
  function identityVerified() { return identityStatus() === "verified"; }
  function clearIdentity() {
    var u = current(); if (!u) return;
    u.identity = { status: "none" };
    persist(u);
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
    CATEGORIES: CATEGORIES, categoryName: categoryName, country: country,
    SOCIAL_PLATFORMS: SOCIAL_PLATFORMS,
    DOC_TYPES: DOC_TYPES,
    REVIEW_MS: REVIEW_MS, KYC_REVIEW_MS: KYC_REVIEW_MS,
    signup: signup, login: login, logout: logout, current: current,
    requireAuth: requireAuth, persist: persist,
    joinCampaign: joinCampaign, addPost: addPost, campaignById: campaignById,
    connectSocial: connectSocial, disconnectSocial: disconnectSocial, socialFor: socialFor,
    refreshSocialReviews: refreshSocialReviews, socialStatus: socialStatus, approvedSocialCount: approvedSocialCount,
    submitKyc: submitKyc, refreshKycReview: refreshKycReview, identityStatus: identityStatus,
    identityVerified: identityVerified, clearIdentity: clearIdentity, docTypeName: docTypeName,
    earnings: earnings, refLink: refLink,
    yen: yen, num: num, toast: toast, esc: esc
  };
})(window);
