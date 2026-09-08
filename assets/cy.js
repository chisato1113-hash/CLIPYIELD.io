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

  // Simulated 活動アカウント review time. In production this is staff review
  // (1–2 business days); in this demo an account auto-approves after a few seconds.
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

  /* ---- categories (IP media domains) ----
     基本的にIP領域（TV・アニメ・映画・ドラマ・漫画・ゲーム・YouTuberなど）の
     クライアントに絞る。一般企業がIPとコラボする案件は「コラボ」として請け負う。 */
  var CATEGORIES = [
    { id: "all",     name: "すべて" },
    { id: "tv",      name: "テレビ" },
    { id: "movie",   name: "映画" },
    { id: "drama",   name: "ドラマ" },
    { id: "anime",   name: "アニメ" },
    { id: "manga",   name: "漫画" },
    { id: "game",    name: "ゲーム" },
    { id: "music",   name: "音楽" },
    { id: "youtube", name: "YouTube" },
    { id: "collab",  name: "コラボ" }
  ];

  // 1再生あたりの成果報酬レンジ（案件により変動）
  var CPV_MIN = 0.03, CPV_MAX = 0.5;

  // 出金タイミング（月末締め・翌月末以降、切り抜き師が指定）
  var PAYOUT_TIMINGS = [
    { id: "next_month_end", name: "翌月末に自動出金", note: "月末締めの翌月末に自動で出金" },
    { id: "quarterly",      name: "四半期ごとにまとめて", note: "3か月分をまとめて出金" },
    { id: "half_year",      name: "半年ごとにまとめて", note: "6か月分をまとめて出金" },
    { id: "manual",         name: "手動（翌月末以降いつでも）", note: "確定後、好きなタイミングで出金" }
  ];
  function payoutTimingName(id) {
    for (var i = 0; i < PAYOUT_TIMINGS.length; i++) if (PAYOUT_TIMINGS[i].id === id) return PAYOUT_TIMINGS[i].name;
    return PAYOUT_TIMINGS[0].name;
  }

  /* ---- ティア制（R4-b）: 累計再生数で昇格、単価アクセスを制御 ---- */
  var TIERS = [
    { id: "bronze", name: "BRONZE", minViews: 0,        maxCpv: 0.10, label: "審査通過直後" },
    { id: "silver", name: "SILVER", minViews: 1000000,  maxCpv: 0.30, label: "累計100万再生・違反ゼロ" },
    { id: "gold",   name: "GOLD",   minViews: 10000000, maxCpv: 0.50, label: "累計1,000万再生・品質上位（独占案件）" }
  ];
  function tierRank(id) { for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) return i; return 0; }
  function tierName(id) { var i = tierRank(id); return TIERS[i] ? TIERS[i].name : "BRONZE"; }
  function tierByRank(r) { return TIERS[Math.max(0, Math.min(TIERS.length - 1, r))]; }

  // 立ち上げ期の最低保証（R8）
  var GUARANTEE_DEFAULT = { monthlyAmount: 30000, months: 3, minPostsPerMonth: 20 };
  // 早期出金の手数料（R7-b）
  var EARLY_PAYOUT_FEE_RATE = 0.04;
  // 1アカウント1日あたりの投稿上限（論点A・不正ビュー/アカウント保護）
  var DAILY_POST_LIMIT = 5;

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
    ES: { flag: "🇪🇸", name: "スペイン語圏" },
    WW: { flag: "🌐", name: "全世界" }
  };
  // client 入稿フォームの国名 → 国コード
  var COUNTRY_NAME_TO_CODE = {
    "日本": "JP", "アメリカ": "US", "インドネシア": "ID", "タイ": "TH",
    "韓国": "KR", "台湾": "TW", "中国": "CN", "全世界": "WW"
  };
  function country(code) { return COUNTRIES[code] || { flag: "🏳️", name: code }; }

  /* ---- campaigns (shared catalogue) ----
     TIER1（再生報酬）は 1再生 ¥0.03〜¥0.5 の範囲で案件により変動する。 */
  var CAMPAIGNS = [
    // ---- テレビ ----
    {
      id: "tvdrama", category: "tv",
      title: "月9ドラマ 公式見逃し名場面",
      meta: "テレビ・連続ドラマ／公式見逃しクリップ",
      countries: ["JP", "TW", "KR"],
      tier1: 0.15, tier2: 30, daysLeft: 40, budgetUsed: 24,
      status: "new",
      plats: ["TikTok", "Reels", "Shorts"], art: "a4"
    },
    {
      id: "variety", category: "tv",
      title: "国民的バラエティ 神回クリップ",
      meta: "テレビ・バラエティ／公式切り抜き公認",
      countries: ["JP", "TW"],
      tier1: 0.06, tier2: 0, daysLeft: 33, budgetUsed: 12,
      status: "open",
      plats: ["TikTok", "Shorts", "Reels"], art: "a2"
    },
    // ---- 映画 ----
    {
      id: "shibuya", category: "movie",
      title: "MIDNIGHT IN SHIBUYA",
      meta: "映画・本編118分／公式予告＆名シーン",
      countries: ["JP", "US", "TW", "TH"],
      tier1: 0.40, tier2: 50, daysLeft: 45, budgetUsed: 18,
      status: "new",
      plats: ["TikTok", "Reels", "Shorts"], art: "a5"
    },
    {
      id: "ferry", category: "movie",
      title: "THE LAST FERRY",
      meta: "映画・本編96分／公式クリップ配布",
      countries: ["US", "ID", "PH"],
      tier1: 0.10, tier2: 0, daysLeft: 30, budgetUsed: 41,
      status: "open",
      plats: ["TikTok", "Shorts", "X"], art: "a1"
    },
    // ---- ドラマ ----
    {
      id: "office2049", category: "drama",
      title: "OFFICE 2049",
      meta: "ドラマ・全10話／独占配信・見どころ",
      countries: ["JP", "KR", "TW"],
      tier1: 0.12, tier2: 45, daysLeft: 52, budgetUsed: 27,
      status: "open",
      plats: ["TikTok", "Reels", "Shorts"], art: "a2"
    },
    {
      id: "hanasaku", category: "drama",
      title: "花咲く頃に",
      meta: "ドラマ・全8話／公式名場面",
      countries: ["JP", "TW", "TH"],
      tier1: 0.05, tier2: 0, daysLeft: 38, budgetUsed: 9,
      status: "new",
      plats: ["TikTok", "Shorts", "Reels"], art: "a3"
    },
    // ---- アニメ ----
    {
      id: "blade", category: "anime",
      title: "BLADE OF THE LAST SUN",
      meta: "アニメ・全24話／独占一次配信",
      countries: ["US", "ES", "TH", "ID", "KR"],
      tier1: 0.05, tier2: 60, daysLeft: 42, budgetUsed: 34,
      status: "open",
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a1"
    },
    {
      id: "hanabi", category: "anime",
      title: "NEON HANABI",
      meta: "アニメ・全32話／独占一次配信",
      countries: ["US", "KR", "CN", "TH", "ID"],
      tier1: 0.08, tier2: 60, daysLeft: 60, budgetUsed: 11,
      status: "new",
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a3"
    },
    // ---- 漫画 ----
    {
      id: "orbit", category: "manga",
      title: "SILENT ORBIT",
      meta: "漫画・全18話／独占先行配信",
      countries: ["US", "ID", "TH"],
      tier1: 0.03, tier2: 55, daysLeft: 28, budgetUsed: 62,
      status: "open",
      plats: ["TikTok", "Shorts", "Reels"], art: "a2"
    },
    {
      id: "echo", category: "manga",
      title: "ECHOES OF TOKYO",
      meta: "漫画・全12話／独占先行配信",
      countries: ["US", "JP", "KR"],
      tier1: 0.06, tier2: 0, daysLeft: 35, budgetUsed: 20,
      status: "open",
      plats: ["TikTok", "Reels", "Shorts"], art: "a4"
    },
    // ---- ゲーム ----
    {
      id: "rpgquest", category: "game",
      title: "EPIC QUEST SAGA 公式実況素材",
      meta: "ゲーム・公式配信素材／切り抜き許諾済み",
      countries: ["US", "JP", "KR", "ID"],
      tier1: 0.20, tier2: 45, daysLeft: 44, budgetUsed: 15,
      status: "open",
      plats: ["TikTok", "Shorts", "Reels", "X"], art: "a3"
    },
    {
      id: "fpsleague", category: "game",
      title: "NEO FPS LEAGUE 公式ハイライト",
      meta: "ゲーム・eスポーツ公式／名プレー集",
      countries: ["US", "KR", "ID", "PH"],
      tier1: 0.50, tier2: 40, daysLeft: 21, budgetUsed: 48,
      status: "new",
      plats: ["TikTok", "Shorts", "Reels"], art: "a1"
    },
    // ---- 音楽 ----
    {
      id: "aurora", category: "music",
      title: "AURORA SOUND",
      meta: "音楽・公式MV／アーティスト公認",
      countries: ["US", "KR", "JP", "ID"],
      tier1: 0.30, tier2: 40, daysLeft: 25, budgetUsed: 55,
      status: "open",
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a4"
    },
    {
      id: "yoake", category: "music",
      title: "夜明けのメロディ",
      meta: "音楽・公式ライブ映像／切り抜き公認",
      countries: ["JP", "TW", "KR"],
      tier1: 0.07, tier2: 0, daysLeft: 47, budgetUsed: 13,
      status: "new",
      plats: ["TikTok", "Shorts", "Reels"], art: "a5"
    },
    // ---- YouTube ----
    {
      id: "gamelegends", category: "youtube",
      title: "人気YouTuber 公式アーカイブ",
      meta: "YouTube・公式アーカイブ／許諾済み",
      countries: ["US", "ID", "PH", "TH"],
      tier1: 0.04, tier2: 35, daysLeft: 33, budgetUsed: 22,
      status: "open",
      plats: ["TikTok", "Shorts", "Reels"], art: "a1"
    },
    {
      id: "creatorclip", category: "youtube",
      title: "クリエイター公式クリップ",
      meta: "YouTube・公式チャンネル素材／公認",
      countries: ["US", "JP", "ID"],
      tier1: 0.05, tier2: 0, daysLeft: 58, budgetUsed: 6,
      status: "new",
      plats: ["TikTok", "Shorts", "X"], art: "a3"
    },
    // ---- コラボ（一般企業 × IP） ----
    {
      id: "brandcollab", category: "collab",
      title: "BRAND × ANIME 限定コラボ",
      meta: "コラボ・一般企業×人気アニメ／公式タイアップ",
      countries: ["JP", "US", "TW"],
      tier1: 0.25, tier2: 50, daysLeft: 36, budgetUsed: 8,
      status: "new", collab: true,
      plats: ["TikTok", "Reels", "Shorts", "X"], art: "a5"
    }
  ];

  // 各案件に minTier / exclusive / disclosureText を自動付与（単価に応じてティアを対応付け）。
  // 高単価ほど上位ティア（bronze ≤0.10 / silver ≤0.30 / gold ≤0.50・独占）。
  function tierForCpv(cpv) { return cpv > 0.30 ? "gold" : (cpv > 0.10 ? "silver" : "bronze"); }
  CAMPAIGNS.forEach(function (c) {
    if (!c.minTier) c.minTier = tierForCpv(c.tier1);
    if (c.exclusive === undefined) c.exclusive = (c.minTier === "gold");
    if (!c.disclosureText) c.disclosureText = "#PR #提供CLIPYIELD";
  });

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
      // ---- 審査制（R1）: 登録直後は案件にアクセスできない ----
      applicationStatus: "unsubmitted", // unsubmitted | pending | approved | rejected
      appliedAt: null, reviewedAt: null, rejectReason: null,
      // ---- ティア（R4-b） ----
      tier: "bronze",
      lifetimeViews: 0,
      violations: 0,
      qualityScore: null,
      // ---- 活動用アカウント（R2・複数可）: { id, platform, handle, accountType:"new"|"certified", status, createdAt } ----
      accounts: [],
      joined: {},   // campaignId -> { joinedAt, ref }
      posts: [],    // { id, campaignId, url, views, sales, clipId, socialAccount, disclosureConfirmed, rewardEligible, at }
      identity: { status: "none" }, // 本人確認（KYC・全員必須）: none|pending|verified
      // ---- 立ち上げ期の最低保証（R8）: 認定アカウント利用者は対象外 ----
      guarantee: { eligible: null, startedAt: null, monthsRemaining: GUARANTEE_DEFAULT.months,
                   monthlyAmount: GUARANTEE_DEFAULT.monthlyAmount, minPostsPerMonth: GUARANTEE_DEFAULT.minPostsPerMonth },
      payoutMethod: "銀行振込",
      payoutTiming: "next_month_end", // 出金タイミング（月末締め・翌月末以降）
      payoutSpeed: "standard"         // standard（無料）| early（翌月末前・手数料4%）
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

  /* ---- client-submitted campaigns bridge ----
     Campaigns created in the client 入稿ポータル (localStorage key cy_submissions)
     are surfaced to clippers here, so a client's グッズアフィリエイトリンク flows all
     the way through to the clipper's personal referral link and TIER2 purchases. */
  var ART_BY_CAT = { tv: "a4", movie: "a5", drama: "a2", anime: "a1", manga: "a2", game: "a3", music: "a4", youtube: "a3", collab: "a5" };
  function clientCampaigns() {
    var subs;
    try { subs = JSON.parse(localStorage.getItem("cy_submissions") || "[]"); }
    catch (e) { subs = []; }
    return subs.map(function (s) {
      var codes = (s.countries || []).map(function (n) { return COUNTRY_NAME_TO_CODE[n] || n; });
      var daysLeft = 30;
      if (s.deadline) {
        daysLeft = Math.max(0, Math.ceil((new Date(s.deadline).getTime() - Date.now()) / 86400000));
      }
      var cpv = s.cpv || 0.03;
      var minTier = s.minTier || tierForCpv(cpv); // クライアント指定 or 単価から自動
      return {
        id: s.id,
        category: s.category || "anime",
        title: s.title || "無題の案件",
        meta: "クライアント入稿・" + (s.org || "権利者") + (s.files ? "／素材" + s.files.length + "点" : ""),
        countries: codes,
        tier1: cpv,
        tier2: s.rate || 0,
        minTier: minTier,                        // R4-b: 参加に必要なティア
        exclusive: minTier === "gold",
        disclosureText: s.disclosureText || "#PR #提供CLIPYIELD", // §2-10: 必要なPR表記
        daysLeft: daysLeft,
        budgetUsed: 0,
        status: "new",
        plats: s.sns || [],
        affiliateBase: s.affiliateBase || "",
        productUrl: s.productUrl || "",
        budget: s.budget || 0,
        source: "client",
        art: ART_BY_CAT[s.category] || "a1"
      };
    });
  }
  function allCampaigns() { return CAMPAIGNS.concat(clientCampaigns()); }

  /* ---- domain actions ---- */
  function refLink(user, campaignId) {
    var handle = user.handle.replace("@", "");
    var c = campaignById(campaignId);
    // client 案件で グッズアフィリエイトリンクがある場合は、その基点リンクに
    // クリッパー固有の識別子を付与した「専用アフィリエイトリンク」を発行する。
    if (c && c.affiliateBase) {
      var sep = c.affiliateBase.indexOf("?") >= 0 ? "&" : "?";
      return c.affiliateBase + sep + "clip=" + handle;
    }
    return "https://clip.yield/r/" + handle + "/" + campaignId;
  }

  function joinCampaign(campaignId) {
    var u = current(); if (!u) return null;
    // 案件を受けられるのは審査を通過した公式切り抜き師のみ（R1）。
    if (!isApproved()) {
      throw new Error("案件への参加には審査の通過が必要です。「公式切り抜き師」タブから審査を受けてください。");
    }
    // ティア要件（R4-b）: ユーザーのティアが案件の必要ティアに満たない場合は不可。
    var c = campaignById(campaignId);
    if (c && !meetsTier(c)) {
      throw new Error("この案件は " + tierName(c.minTier) + " 以上が対象です。累計再生数を伸ばしてティアを上げましょう。");
    }
    if (!u.joined[campaignId]) {
      u.joined[campaignId] = { joinedAt: Date.now(), ref: refLink(u, campaignId) };
      persist(u);
    }
    return u.joined[campaignId];
  }

  function sameDay(a, b) {
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }
  // opts: { url, views, sales, clipId, socialAccount, disclosureConfirmed }
  function addPost(campaignId, opts) {
    var u = current(); if (!u) return null;
    if (!isApproved()) throw new Error("投稿の登録には審査の通過が必要です。");
    opts = opts || {};
    var url = String(opts.url || "").trim();
    var views = Math.max(0, parseInt(opts.views, 10) || 0);
    var sales = Math.max(0, parseInt(opts.sales, 10) || 0);
    var clipId = String(opts.clipId || "").trim();
    var socialAccount = opts.socialAccount || "";
    if (!/^https?:\/\//.test(url)) throw new Error("投稿URLは http(s):// から入力してください。");
    if (!clipId) throw new Error("クリップID（同一動画の識別子）を入力してください。重複投稿の検知に使用します。");
    // §2-10 PR表記: 未確認では登録不可（景品表示法・ステマ規制対応）
    if (!opts.disclosureConfirmed) throw new Error("PR表記を投稿に含めたことの確認が必要です（景品表示法・ステマ規制）。");
    var now = Date.now();
    // §2-8 1アカウント1日 DAILY_POST_LIMIT 本まで（不正ビュー対策・アカウント保護）
    if (socialAccount) {
      var todayCount = (u.posts || []).filter(function (p) { return p.socialAccount === socialAccount && sameDay(p.at, now); }).length;
      if (todayCount >= DAILY_POST_LIMIT) {
        throw new Error("アカウントの安全のため、1つのアカウントからの投稿は1日" + DAILY_POST_LIMIT + "本までです。時間をおいて登録してください。");
      }
    }
    // §2-8 重複投稿検知: 同一 clipId が既にあれば 2件目以降は報酬対象外。
    // NOTE: フロントのみでは真の重複判定（動画ファイルの照合）は不可能。
    //       本番実装では動画の知覚ハッシュ（perceptual hash）による照合が必要。
    var isDuplicate = (u.posts || []).some(function (p) { return p.clipId && p.clipId === clipId; });
    var post = {
      id: "p" + now, campaignId: campaignId, url: url, views: views, sales: sales,
      clipId: clipId, socialAccount: socialAccount,
      disclosureConfirmed: true, rewardEligible: !isDuplicate, at: now
    };
    u.posts.unshift(post);
    persist(u);
    syncProgress(); // 累計再生数の更新＋ティア昇格判定（R4-b）
    return post;
  }
  // 累計再生数（報酬対象のみ）を更新し、ティア昇格/降格を反映する。
  function syncProgress() {
    var u = current(); if (!u) return null;
    var lv = (u.posts || []).filter(function (p) { return p.rewardEligible !== false; })
                            .reduce(function (s, p) { return s + (p.views || 0); }, 0);
    u.lifetimeViews = lv;
    var prev = u.tier;
    u.tier = computeTier(u);
    persist(u);
    return { promoted: prev !== u.tier, from: prev, to: u.tier };
  }

  function campaignById(id) {
    var all = allCampaigns();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ---- 活動用アカウント（複数可・各アカウントを審査） ----
     切り抜き師はClipyield用に新しいアカウントを作って活動する。複数アカウント可。
     各アカウントは審査（pending→approved）を経て承認される。 */
  // Migrate legacy `socials` (one-per-platform) to `accounts` (multiple).
  function migrateAccounts(u) {
    if (!u) return;
    if (!u.accounts) {
      u.accounts = (u.socials || []).map(function (s) {
        return {
          id: "ac" + (s.connectedAt || Date.now()) + Math.random().toString(36).slice(2, 6),
          platform: s.platform, handle: s.handle,
          status: s.status || "approved", createdAt: s.connectedAt || Date.now()
        };
      });
      delete u.socials;
      persist(u);
    }
  }
  function accounts() {
    var u = current(); if (!u) return [];
    migrateAccounts(u);
    return u.accounts || [];
  }
  function addAccount(platformId, handle, accountType) {
    var u = current(); if (!u) return null;
    migrateAccounts(u);
    handle = String(handle || "").trim().replace(/^@+/, "").replace(/\s+/g, "");
    if (!handle) throw new Error("ユーザー名を入力してください。");
    accountType = (accountType === "certified") ? "certified" : "new"; // R2: 既定は新規アカウント
    // 同一プラットフォームで同じハンドルの重複のみ拒否（複数アカウント自体は許可）
    var dup = (u.accounts || []).some(function (a) { return a.platform === platformId && a.handle === "@" + handle; });
    if (dup) throw new Error("このアカウントは既に登録されています。");
    var rec = {
      id: "ac" + Date.now() + Math.random().toString(36).slice(2, 6),
      platform: platformId, handle: "@" + handle,
      accountType: accountType, status: "pending", createdAt: Date.now()
    };
    u.accounts = (u.accounts || []).concat([rec]);
    persist(u);
    return rec;
  }
  function accountTypeName(t) { return t === "certified" ? "認定アカウント（既存）" : "新規アカウント"; }
  function removeAccount(id) {
    var u = current(); if (!u) return;
    migrateAccounts(u);
    u.accounts = (u.accounts || []).filter(function (a) { return a.id !== id; });
    persist(u);
  }
  function accountStatus(a) { return a ? (a.status || "pending") : null; }
  function approvedAccountCount() {
    return accounts().filter(function (a) { return accountStatus(a) === "approved"; }).length;
  }
  function pendingAccountCount() {
    return accounts().filter(function (a) { return accountStatus(a) === "pending"; }).length;
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

  /* ---- 審査制（R1）: 登録 → 要件充足 → 申請 → 審査中 → 承認 ----
     案件を受けられるのは審査を通過した「公式切り抜き師」のみ。要件は本人確認(KYC・
     全員必須)＋活動用アカウント1つ以上。デモでは自動承認せず「審査中」を保持し、運営
     承認を模した手動操作で承認する。本番は運営による審査（2〜3営業日）。 */
  function applicationStatus() { var u = current(); return (u && u.applicationStatus) || "unsubmitted"; }
  function isApproved() { return applicationStatus() === "approved"; }
  function canSubmitApplication() {
    var idv = identityStatus();
    return (idv === "pending" || idv === "verified") && accounts().length >= 1;
  }
  function submitApplication() {
    var u = current(); if (!u) return null;
    if (identityStatus() === "none") throw new Error("本人確認（KYC）を提出してください。全員必須です。");
    if (accounts().length < 1) throw new Error("活動用アカウントを1つ以上登録してください。");
    u.applicationStatus = "pending"; u.appliedAt = Date.now();
    persist(u); return u.applicationStatus;
  }
  // 運営審査を模した手動承認（デモ）。本番は運営が審査し承認/却下する。
  function approveApplication() {
    var u = current(); if (!u) return null;
    u.applicationStatus = "approved"; u.reviewedAt = Date.now();
    if (u.identity && u.identity.status === "pending") { u.identity.status = "verified"; u.identity.verifiedAt = Date.now(); }
    (u.accounts || []).forEach(function (a) { if (a.status === "pending") { a.status = "approved"; a.approvedAt = Date.now(); } });
    // 最低保証（R8）: 認定アカウント（既存）を使う場合は対象外。
    var usesCertified = (u.accounts || []).some(function (a) { return a.accountType === "certified"; });
    u.guarantee = u.guarantee || {};
    u.guarantee.eligible = !usesCertified && (u.accounts || []).length > 0;
    u.guarantee.startedAt = u.guarantee.eligible ? Date.now() : null;
    persist(u); return u.applicationStatus;
  }
  function rejectApplication(reason) {
    var u = current(); if (!u) return null;
    u.applicationStatus = "rejected"; u.reviewedAt = Date.now(); u.rejectReason = reason || "";
    persist(u); return u.applicationStatus;
  }
  function resetApplication() { // デモ用: 審査をやり直す
    var u = current(); if (!u) return;
    u.applicationStatus = "unsubmitted"; u.appliedAt = null; u.reviewedAt = null; u.rejectReason = null;
    persist(u);
  }

  /* ---- ティア（R4-b）: 累計再生数で昇格、単価アクセスを制御 ---- */
  function computeTier(user) {
    var v = user.lifetimeViews || 0;
    var base = v >= 10000000 ? 2 : (v >= 1000000 ? 1 : 0);
    var eff = Math.max(0, base - (user.violations || 0)); // 違反1回で1ティア降格
    return TIERS[eff].id;
  }
  function currentTier() { var u = current(); return (u && u.tier) || "bronze"; }
  function tierProgress() {
    var u = current(); if (!u) return null;
    var r = tierRank(u.tier || "bronze");
    var lv = u.lifetimeViews || 0;
    if (r >= TIERS.length - 1) return { tier: u.tier, next: null, views: lv, need: null, pct: 100 };
    var next = TIERS[r + 1];
    return { tier: u.tier, next: next.id, views: lv, need: next.minViews,
             pct: Math.max(0, Math.min(100, Math.round(lv / next.minViews * 100))) };
  }
  function meetsTier(campaign) {
    if (!campaign || !campaign.minTier) return true;
    return tierRank(currentTier()) >= tierRank(campaign.minTier);
  }

  /* ---- 出金タイミング・早期出金（R7） ---- */
  function payoutTiming() { var u = current(); return (u && u.payoutTiming) || "next_month_end"; }
  function setPayoutTiming(id) { var u = current(); if (!u) return; u.payoutTiming = id; persist(u); }
  function payoutSpeed() { var u = current(); return (u && u.payoutSpeed) || "standard"; }
  function setPayoutSpeed(id) { var u = current(); if (!u) return; u.payoutSpeed = (id === "early") ? "early" : "standard"; persist(u); }

  function postsThisMonth(user) {
    var now = new Date();
    return (user.posts || []).filter(function (p) {
      var d = new Date(p.at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }
  /* earnings computed from the user's registered posts (R4/R7/R8 反映) */
  function earnings(user) {
    var t1 = 0, t2 = 0, views = 0, eligibleViews = 0, orders = 0;
    (user.posts || []).forEach(function (p) {
      var c = campaignById(p.campaignId) || { tier1: 0.03, tier2: 0 };
      views += p.views;
      if (p.rewardEligible !== false) {           // §3-5.1 重複投稿は集計から除外
        t1 += p.views * c.tier1;
        t2 += p.sales * (c.tier2 / 100);
        eligibleViews += p.views;
      }
      if (p.sales > 0) orders += 1;
    });
    var base = Math.round(t1 + t2);
    // 最低保証（R8）: 対象者・当月投稿20本以上・違反ゼロ・保証期間内 のとき差額補填
    var monthPosts = postsThisMonth(user);
    var g = user.guarantee || {};
    var guaranteeActive = !!(g.eligible && (g.monthsRemaining == null || g.monthsRemaining > 0) &&
                             monthPosts >= (g.minPostsPerMonth || 20) && (user.violations || 0) === 0);
    var guaranteeTop = guaranteeActive ? Math.max(0, (g.monthlyAmount || 30000) - base) : 0;
    var total = base + guaranteeTop;
    // 早期出金（R7-b）: 4% 手数料を控除
    var early = (user.payoutSpeed === "early");
    var fee = early ? Math.round(total * EARLY_PAYOUT_FEE_RATE) : 0;
    return {
      tier1: Math.round(t1), tier2: Math.round(t2), base: base,
      guarantee: guaranteeTop, guaranteeActive: guaranteeActive,
      total: total, fee: fee, net: total - fee, early: early,
      views: views, eligibleViews: eligibleViews, orders: orders,
      posts: (user.posts || []).length, monthPosts: monthPosts
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
    CPV_MIN: CPV_MIN, CPV_MAX: CPV_MAX,
    PAYOUT_TIMINGS: PAYOUT_TIMINGS, payoutTimingName: payoutTimingName,
    TIERS: TIERS, tierRank: tierRank, tierName: tierName,
    GUARANTEE_DEFAULT: GUARANTEE_DEFAULT, EARLY_PAYOUT_FEE_RATE: EARLY_PAYOUT_FEE_RATE, DAILY_POST_LIMIT: DAILY_POST_LIMIT,
    signup: signup, login: login, logout: logout, current: current,
    requireAuth: requireAuth, persist: persist,
    joinCampaign: joinCampaign, addPost: addPost, campaignById: campaignById,
    clientCampaigns: clientCampaigns, allCampaigns: allCampaigns,
    accounts: accounts, addAccount: addAccount, removeAccount: removeAccount,
    accountStatus: accountStatus, accountTypeName: accountTypeName,
    approvedAccountCount: approvedAccountCount, pendingAccountCount: pendingAccountCount,
    submitKyc: submitKyc, identityStatus: identityStatus,
    identityVerified: identityVerified, clearIdentity: clearIdentity, docTypeName: docTypeName,
    applicationStatus: applicationStatus, isApproved: isApproved, canSubmitApplication: canSubmitApplication,
    submitApplication: submitApplication, approveApplication: approveApplication,
    rejectApplication: rejectApplication, resetApplication: resetApplication,
    currentTier: currentTier, tierProgress: tierProgress, meetsTier: meetsTier, computeTier: computeTier,
    syncProgress: syncProgress,
    payoutTiming: payoutTiming, setPayoutTiming: setPayoutTiming,
    payoutSpeed: payoutSpeed, setPayoutSpeed: setPayoutSpeed,
    earnings: earnings, refLink: refLink,
    yen: yen, num: num, toast: toast, esc: esc
  };
})(window);
