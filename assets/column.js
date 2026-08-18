/* ==========================================================================
   CLIPYIELD — SEO column (blog) data layer + admin
   Functional front-end demo. Articles are stored in localStorage so the public
   column and the operator admin console work on GitHub Pages with no backend.

   PRODUCTION / AI INTEGRATION NOTE
   --------------------------------
   This module is the single seam through which content flows. A future
   "SEO article-writing AI" pipeline should call the SAME functions the admin UI
   calls, so the automated flow and the manual flow share one code path:

       1. AI generates a draft            -> CYColumn.createDraft({source:"ai", ...})
       2. (optional) human review/edit    -> CYColumn.save(article)
       3. publish (manual or auto)        -> CYColumn.publish(id)

   `CYColumn.ai.generate(topic, opts)` is the concrete integration point. It is
   currently a local template stub; swap its body for a fetch() to your AI
   endpoint / MCP tool (see AI_CONFIG). Everything downstream already works.
   ========================================================================== */
(function (global) {
  "use strict";

  var K = {
    articles: "cy_articles",     // [ {..article..} ]
    adminSess: "cy_admin_sess",  // logged-in admin id
    admins: "cy_admins"          // { id: {id, pass, name} }
  };

  /* ----- AI pipeline configuration (future) -----
     When endpoint is set, CYColumn.ai.generate() will POST { topic, keywords,
     ... } and expect { title, body, excerpt, ... } back. autoPublish lets the
     pipeline publish without human review (keep false until you trust output). */
  var AI_CONFIG = {
    endpoint: null,          // e.g. "https://api.example.com/seo/generate" or an MCP tool
    model: "seo-writer-v1",
    autoPublish: false,
    defaultAuthor: "CLIPYIELD編集部（AI）"
  };

  function read(key, fb) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; }
    catch (e) { return fb; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function slugify(s) {
    var base = (s || "").toString().trim().toLowerCase()
      .replace(/[^\w぀-ヿ一-龯\s-]/g, "")
      .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    // keep Japanese slugs (valid when percent-encoded); only fall back if empty
    if (!base) base = "post";
    return base.slice(0, 48);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function nowISO() { return new Date().toISOString(); }

  /* ---------- admin auth (operator console) ---------- */
  function seedAdmin() {
    var a = read(K.admins, null);
    if (!a) { a = { "admin": { id: "admin", pass: "clipyield-admin", name: "CLIPYIELD運営" } }; write(K.admins, a); }
    return a;
  }
  function adminLogin(id, pass) {
    var admins = seedAdmin();
    var a = admins[(id || "").trim()];
    if (!a || a.pass !== pass) return { ok: false, error: "IDまたはパスワードが違います。" };
    write(K.adminSess, a.id);
    return { ok: true, admin: a };
  }
  function adminLogout() { localStorage.removeItem(K.adminSess); }
  function adminCurrent() {
    var id = read(K.adminSess, null);
    if (!id) return null;
    return seedAdmin()[id] || null;
  }
  function requireAdmin(redirect) {
    var a = adminCurrent();
    if (!a) { location.href = redirect || "admin-login.html"; return null; }
    return a;
  }

  /* ---------- article CRUD ---------- */
  function ensureSeed() {
    var a = read(K.articles, null);
    if (a) return a;
    a = SEED_ARTICLES();
    write(K.articles, a);
    return a;
  }
  function all() { return ensureSeed(); }
  function list(opts) {
    opts = opts || {};
    var items = ensureSeed().slice();
    if (opts.status) items = items.filter(function (x) { return x.status === opts.status; });
    if (opts.category && opts.category !== "all") items = items.filter(function (x) { return x.category === opts.category; });
    items.sort(function (a, b) {
      var da = a.publishedAt || a.updatedAt || a.createdAt || "";
      var db = b.publishedAt || b.updatedAt || b.createdAt || "";
      return db < da ? -1 : db > da ? 1 : 0;
    });
    return items;
  }
  function published(opts) { opts = opts || {}; opts.status = "published"; return list(opts); }
  function getById(id) { return ensureSeed().filter(function (x) { return x.id === id; })[0] || null; }
  function getBySlug(slug) { return ensureSeed().filter(function (x) { return x.slug === slug; })[0] || null; }

  function uniqueSlug(slug, exceptId) {
    var items = ensureSeed(), base = slug || "post", s = base, i = 2;
    while (items.some(function (x) { return x.slug === s && x.id !== exceptId; })) { s = base + "-" + i; i++; }
    return s;
  }

  function categories() {
    var set = {};
    published().forEach(function (a) { if (a.category) set[a.category] = (set[a.category] || 0) + 1; });
    return set;
  }

  function readingMinutes(body) {
    var chars = (body || "").replace(/\s+/g, "").length;
    return Math.max(1, Math.round(chars / 500)); // ~500 JP chars/min
  }

  // Create (used by admin AND the AI pipeline). Returns the saved article.
  function createDraft(data) {
    var items = ensureSeed();
    var title = data.title || "無題の記事";
    var art = {
      id: uid(),
      slug: uniqueSlug(data.slug || slugify(title)),
      title: title,
      excerpt: data.excerpt || "",
      body: data.body || "",
      coverImage: data.coverImage || "",
      category: data.category || "ガイド",
      tags: data.tags || [],
      author: data.author || "CLIPYIELD編集部",
      status: data.status || "draft",
      source: data.source || "manual",
      seoTitle: data.seoTitle || "",
      seoDescription: data.seoDescription || "",
      keywords: data.keywords || [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
      publishedAt: data.status === "published" ? nowISO() : null
    };
    items.push(art);
    write(K.articles, items);
    return art;
  }

  // Update an existing article (partial).
  function save(article) {
    var items = ensureSeed();
    var idx = items.findIndex(function (x) { return x.id === article.id; });
    if (idx < 0) return createDraft(article);
    var prev = items[idx];
    var merged = Object.assign({}, prev, article);
    merged.slug = uniqueSlug(article.slug || prev.slug || slugify(merged.title), merged.id);
    merged.tags = article.tags || prev.tags || [];
    merged.keywords = article.keywords || prev.keywords || [];
    merged.updatedAt = nowISO();
    if (merged.status === "published" && !merged.publishedAt) merged.publishedAt = nowISO();
    if (merged.status !== "published") merged.publishedAt = merged.publishedAt || null;
    items[idx] = merged;
    write(K.articles, items);
    return merged;
  }
  function publish(id) {
    var a = getById(id); if (!a) return null;
    a.status = "published"; a.publishedAt = a.publishedAt || nowISO(); a.updatedAt = nowISO();
    return save(a);
  }
  function unpublish(id) {
    var a = getById(id); if (!a) return null;
    a.status = "draft"; a.updatedAt = nowISO();
    return save(a);
  }
  function remove(id) {
    var items = ensureSeed().filter(function (x) { return x.id !== id; });
    write(K.articles, items);
  }

  /* ---------- AI generation seam ----------
     Currently returns a locally-templated SEO draft. To go live, replace the
     body with a call to your AI service and map the response fields. The rest of
     the flow (createDraft -> review -> publish) is unchanged. */
  function aiGenerate(topic, opts) {
    opts = opts || {};
    var keywords = opts.keywords || defaultKeywords(topic);
    // ---- INTEGRATION POINT (future) ----
    // if (AI_CONFIG.endpoint) {
    //   return fetch(AI_CONFIG.endpoint, { method:"POST",
    //     headers:{'content-type':'application/json'},
    //     body: JSON.stringify({ topic: topic, keywords: keywords, model: AI_CONFIG.model })
    //   }).then(function(r){ return r.json(); });
    // }
    var title = topic + "｜クリッパー向け完全ガイド";
    var body = aiTemplate(topic, keywords);
    return {
      title: title,
      slug: slugify(topic),
      excerpt: topic + "について、CLIPYIELDで切り抜き投稿を始めるクリッパー向けに要点をまとめました。",
      body: body,
      category: "ガイド",
      tags: keywords,
      author: AI_CONFIG.defaultAuthor,
      status: AI_CONFIG.autoPublish ? "published" : "draft",
      source: "ai",
      seoTitle: title + " | CLIPYIELD",
      seoDescription: topic + "の始め方・コツ・注意点をクリッパー目線で解説。CLIPYIELDなら公式ライセンス素材で著作権を気にせず投稿できます。",
      keywords: keywords
    };
  }
  // Create an AI draft and persist it in one step (what an automated flow calls).
  function aiCreateDraft(topic, opts) {
    var draft = aiGenerate(topic, opts);
    // (draft could be a Promise once endpoint is wired; keep sync for the stub)
    return createDraft(draft);
  }
  function defaultKeywords(topic) {
    return [topic, "切り抜き", "クリッパー", "副業", "CLIPYIELD"].filter(Boolean);
  }
  function aiTemplate(topic, keywords) {
    var kw = (keywords || []).join("・");
    return [
      "## " + topic + "とは",
      "",
      topic + "は、切り抜き（クリップ）動画で収益を得たいクリッパーにとって重要なテーマです。この記事では、CLIPYIELDでの実践を前提に、始め方から伸ばし方までを解説します。",
      "",
      "> ポイント：CLIPYIELDが配布するのは権利者から**公式に許諾された素材**のみ。著作権を理由とした削除・アカウント停止の心配なく投稿できます。",
      "",
      "## はじめに押さえたい3つの基本",
      "",
      "1. 公式ライセンス素材だけを使う（グレーゾーンで戦わない）",
      "2. 対象SNSの仕様に合わせて縦型・短尺で編集する",
      "3. 紹介リンクを設置し、再生報酬（TIER1）＋グッズ成果報酬（TIER2）の二階建てで稼ぐ",
      "",
      "## 具体的な進め方",
      "",
      "無料登録のあと案件ボードから素材をダウンロードし、編集して各SNSへ投稿します。再生数は自動集計され、ダッシュボードに反映されます。",
      "",
      "### よくある質問",
      "",
      "フォロワーが少なくても参加できます。審査・最低再生数の要件はありません。第1再生から報酬が加算されます。",
      "",
      "---",
      "",
      "関連キーワード：" + kw,
      "",
      "CLIPYIELDに無料登録して、今日から" + topic + "を実践しましょう。"
    ].join("\n");
  }

  /* ---------- minimal Markdown -> HTML (safe) ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function inline(s) {
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, src) {
      return '<img src="' + src.replace(/"/g, "&quot;") + '" alt="' + alt + '" loading="lazy"/>';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, t, href) {
      var safe = /^(https?:|\/|#|mailto:)/i.test(href) ? href : "#";
      var ext = /^https?:/i.test(safe);
      return '<a href="' + safe.replace(/"/g, "&quot;") + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + t + "</a>";
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }
  function mdToHtml(md) {
    var lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0;
    function flushList(type, items) {
      out.push("<" + type + ">" + items.map(function (t) { return "<li>" + inline(t) + "</li>"; }).join("") + "</" + type + ">");
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      var h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) { var lvl = h[1].length + 1; out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">"); i++; continue; }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
      if (/^\s*>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        out.push("<blockquote>" + inline(q.join(" ")) + "</blockquote>"); continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { ul.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
        flushList("ul", ul); continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { ol.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
        flushList("ol", ol); continue;
      }
      // paragraph (gather until blank)
      var p = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|\s*>\s?|\s*(---|\*\*\*|___)\s*$)/.test(lines[i])) {
        p.push(lines[i]); i++;
      }
      out.push("<p>" + inline(p.join(" ")) + "</p>");
    }
    return out.join("\n");
  }

  /* ---------- demo seed articles (SEO clipper recruitment) ---------- */
  function SEED_ARTICLES() {
    var base = Date.now();
    function daysAgo(n) { return new Date(base - n * 86400000).toISOString(); }
    var A = [
      {
        title: "切り抜き動画で稼ぐには？初心者クリッパー完全ガイド【2026年版】",
        category: "ガイド", author: "CLIPYIELD編集部",
        keywords: ["切り抜き 稼ぐ", "クリッパー 始め方", "副業", "動画編集"],
        excerpt: "切り抜き動画で収益化する仕組みと、初心者が最短で始める手順を解説。フォロワー0・審査なしで第1再生から報酬が発生します。",
        body: [
          "## 切り抜き動画で稼ぐ仕組み",
          "",
          "「切り抜き」とは、公式に許諾された映像・音声素材を短尺に編集してSNSへ投稿する活動です。CLIPYIELDでは、**再生報酬（TIER1）**と**グッズ成果報酬（TIER2）**の二階建てで収益が得られます。",
          "",
          "1. 無料登録（審査・フォロワー要件なし）",
          "2. 案件ボードから公式ライセンス素材をダウンロード",
          "3. 縦型・短尺に編集し、TikTok / Reels / Shorts / X へ投稿",
          "4. 再生数は自動集計、ダッシュボードで報酬を確認",
          "",
          "> 最低再生数のしきい値はありません。**第1再生から**報酬が加算されます。",
          "",
          "## 初心者がまずやるべきこと",
          "",
          "はじめは1つのSNSに絞り、投稿本数を積むことが近道です。素材は公式許諾済みなので、著作権を理由とした削除・アカウント停止の心配はありません。",
          "",
          "今日から始めるなら、まずは無料登録から。"
        ].join("\n"),
        days: 2
      },
      {
        title: "公式ライセンス素材なら著作権を気にせず投稿できる理由",
        category: "著作権", author: "CLIPYIELD編集部",
        keywords: ["著作権", "公式ライセンス", "アカウント停止", "ホワイトリスト"],
        excerpt: "クリッパー最大の不安「著作権による削除・BAN」。CLIPYIELDが公式ホワイトリスト方式でそのリスクを取り除く仕組みを解説します。",
        body: [
          "## クリッパーの一番の不安は「単価」ではなく「BAN」",
          "",
          "苦労して育てたアカウントが、著作権クレームで一瞬で停止される——これがクリッパー最大のリスクです。",
          "",
          "CLIPYIELDは権利者から**二次利用・再許諾の権利**を受け、その範囲をクリッパーへ正式に許諾します。だから著作権を理由とした申立て・削除・アカウント停止の対象になりません。",
          "",
          "## 効果の範囲と限界",
          "",
          "この効果は著作権に関するものに限られます。AI生成コンテンツの表示義務や各SNSの品質・真正性ポリシーは別基準です。必要な表記は案件ごとに案内します。",
          "",
          "詳しくは[クリッパー規約](clipper-terms.html)をご確認ください。"
        ].join("\n"),
        days: 6
      },
      {
        title: "TikTok・Reels・Shortsで再生数を伸ばす編集のコツ7選",
        category: "ノウハウ", author: "CLIPYIELD編集部",
        keywords: ["TikTok 伸ばす", "Reels 編集", "Shorts 再生数", "バズる"],
        excerpt: "同じ素材でも編集次第で再生数は大きく変わります。冒頭2秒・字幕・テンポなど、今日から使える実践テクニックをまとめました。",
        body: [
          "## 冒頭2秒がすべて",
          "",
          "視聴維持率は冒頭で決まります。結論やハイライトを最初に持ってくる構成が有効です。",
          "",
          "1. 冒頭2秒に一番の見せ場を置く",
          "2. 字幕は大きく、音なしでも伝わるように",
          "3. テンポよくカット（間延びは離脱の原因）",
          "4. 縦型フルサイズで没入感を出す",
          "5. ループする終わり方で再生数を稼ぐ",
          "6. トレンド音源・ハッシュタグを研究する",
          "7. 投稿時間を視聴者の活動時間に合わせる",
          "",
          "> 素材は案件ごとに許諾範囲が決まっています。指定の範囲内で自由に編集しましょう。",
          "",
          "編集に慣れたら複数SNSへ横展開し、再生報酬を最大化しましょう。"
        ].join("\n"),
        days: 11
      }
    ];
    return A.map(function (x) {
      return {
        id: uid(),
        slug: uniqueSlugSeed(slugify(x.title), A, x.title),
        title: x.title, excerpt: x.excerpt, body: x.body,
        coverImage: "", category: x.category, tags: x.keywords.slice(0, 3),
        author: x.author, status: "published", source: "manual",
        seoTitle: x.title + " | CLIPYIELD", seoDescription: x.excerpt,
        keywords: x.keywords,
        createdAt: daysAgo(x.days), updatedAt: daysAgo(x.days), publishedAt: daysAgo(x.days)
      };
    });
    function uniqueSlugSeed(s) { return s; } // seeds have distinct titles
  }

  global.CYColumn = {
    K: K, AI_CONFIG: AI_CONFIG,
    // admin
    seedAdmin: seedAdmin, adminLogin: adminLogin, adminLogout: adminLogout,
    adminCurrent: adminCurrent, requireAdmin: requireAdmin,
    // articles
    all: all, list: list, published: published, getById: getById, getBySlug: getBySlug,
    categories: categories, createDraft: createDraft, save: save,
    publish: publish, unpublish: unpublish, remove: remove,
    slugify: slugify, readingMinutes: readingMinutes,
    // rendering
    mdToHtml: mdToHtml, esc: esc,
    // AI seam
    ai: { generate: aiGenerate, createDraft: aiCreateDraft, config: AI_CONFIG }
  };
})(window);
