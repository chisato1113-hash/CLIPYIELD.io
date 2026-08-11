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
    subs: "cy_submissions",    // [ {..submission..} ]
    billing: "cy_client_billing" // { clientId: {..billing profile..} }
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

  /* ---- goods affiliate link auto-generation ----
     Turns a merch product/store URL into a CLIPYIELD affiliate base link. When a
     clipper joins the campaign, cy.js appends their handle (&clip=...) so every
     purchase through the link is attributed to that clipper's TIER2 reward. */
  function shortCode() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
  }
  function makeAffiliateBase(productUrl) {
    var base = "https://go.clipyield.io/a/" + shortCode();
    var u = (productUrl || "").trim();
    if (u) base += "?to=" + encodeURIComponent(u);
    return base;
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

  /* ======================================================================
     Campaign progress analytics (demo)
     No real ad/SNS APIs are available in this prototype, so per-platform and
     per-clipper metrics are generated deterministically from the campaign id +
     platform + date. The same campaign always yields the same numbers, so the
     dashboard is stable across reloads. Structure mirrors a META-style report:
     views → engagements → link clicks (CTR) → conversions (CVR).
     ====================================================================== */
  var PLATFORM_ALIASES = {
    "TikTok": "TikTok", "Instagram Reels": "Instagram", "Instagram": "Instagram",
    "Reels": "Instagram", "YouTube Shorts": "YouTube", "YouTube": "YouTube",
    "Shorts": "YouTube", "X": "X"
  };
  var PLATFORM_ICON = { "TikTok": "🎵", "Instagram": "📸", "YouTube": "▶️", "X": "✖️" };
  var CLIPPER_POOL = [
    { name: "みお", handle: "@mio_clips" }, { name: "Kenta", handle: "@kenta.edit" },
    { name: "らむ", handle: "@ramu_now" }, { name: "Sora", handle: "@sora.vfx" },
    { name: "ちー", handle: "@chii_cut" }, { name: "Leo", handle: "@leo_motion" },
    { name: "なぎ", handle: "@nagi_clip" }, { name: "Yuki", handle: "@yuki.reel" },
    { name: "はる", handle: "@haru_edits" }, { name: "Mina", handle: "@mina_short" },
    { name: "とわ", handle: "@towa.clip" }, { name: "Rin", handle: "@rin_frames" }
  ];

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(seedStr) { return mulberry32(hashStr(seedStr)); }

  // resolve which platforms a campaign runs on
  function campaignPlatforms(campaign) {
    var raw = campaign.plats || campaign.sns || ["TikTok", "Instagram", "YouTube", "X"];
    var seen = {}, out = [];
    raw.forEach(function (p) {
      var name = PLATFORM_ALIASES[p] || p;
      if (!seen[name]) { seen[name] = 1; out.push(name); }
    });
    return out.length ? out : ["TikTok", "Instagram", "YouTube"];
  }

  // number of clippers participating in a campaign (stable)
  function campaignClipperCount(campaign) {
    var r = rngFor("clippers:" + campaign.id);
    return 5 + Math.floor(r() * 8); // 5–12
  }

  // one day of metrics for one platform of one campaign
  function dayMetrics(campaign, platform, dayIndex) {
    var r = rngFor(campaign.id + "|" + platform + "|" + dayIndex);
    // platform character: base reach + engagement/click/cvr tendencies
    var profile = {
      "TikTok":    { reach: 1.0, engR: 0.09, clickR: 0.020, cvr: 0.035 },
      "Instagram": { reach: 0.7, engR: 0.075, clickR: 0.017, cvr: 0.030 },
      "YouTube":   { reach: 0.85, engR: 0.06, clickR: 0.024, cvr: 0.045 },
      "X":         { reach: 0.45, engR: 0.045, clickR: 0.013, cvr: 0.022 }
    }[platform] || { reach: 0.6, engR: 0.06, clickR: 0.016, cvr: 0.03 };
    // gentle upward trend over time + daily noise
    var trend = 0.6 + dayIndex * 0.012;
    var views = Math.round((2600 + r() * 5200) * profile.reach * trend);
    var eng = Math.round(views * profile.engR * (0.8 + r() * 0.5));
    var clicks = Math.round(views * profile.clickR * (0.8 + r() * 0.5));
    var cv = Math.round(clicks * profile.cvr * (0.7 + r() * 0.8));
    return { views: views, eng: eng, clicks: clicks, cv: cv };
  }

  function pct(n, d) { return d > 0 ? (n / d) * 100 : 0; }

  /* Build a full analytics report for a campaign over a granularity.
     granularity: "day" | "week" | "month" */
  function analytics(campaign, granularity) {
    var platforms = campaignPlatforms(campaign);
    var buckets, daysPerBucket, bucketCount;
    if (granularity === "month") { bucketCount = 6; daysPerBucket = 30; }
    else if (granularity === "week") { bucketCount = 12; daysPerBucket = 7; }
    else { bucketCount = 30; daysPerBucket = 1; }
    var totalDays = bucketCount * daysPerBucket;

    // per-platform running totals
    var byPlat = {};
    platforms.forEach(function (p) { byPlat[p] = { platform: p, icon: PLATFORM_ICON[p] || "🔗", views: 0, eng: 0, clicks: 0, cv: 0 }; });

    // time series buckets (summed across platforms)
    var series = [];
    var now = new Date();
    for (var b = 0; b < bucketCount; b++) {
      var agg = { views: 0, eng: 0, clicks: 0, cv: 0 };
      for (var d = 0; d < daysPerBucket; d++) {
        var dayIndex = b * daysPerBucket + d;            // 0 = oldest
        var absDay = totalDays - 1 - dayIndex;           // days ago
        platforms.forEach(function (p) {
          var m = dayMetrics(campaign, p, dayIndex);
          agg.views += m.views; agg.eng += m.eng; agg.clicks += m.clicks; agg.cv += m.cv;
          byPlat[p].views += m.views; byPlat[p].eng += m.eng; byPlat[p].clicks += m.clicks; byPlat[p].cv += m.cv;
        });
      }
      // bucket label
      var dref = new Date(now.getTime() - (bucketCount - 1 - b) * daysPerBucket * 86400000);
      var label;
      if (granularity === "month") label = (dref.getMonth() + 1) + "月";
      else if (granularity === "week") label = "W" + (b + 1);
      else label = (dref.getMonth() + 1) + "/" + dref.getDate();
      agg.label = label;
      series.push(agg);
    }

    // finalize per-platform with CTR / CVR
    var platRows = platforms.map(function (p) {
      var x = byPlat[p];
      x.ctr = pct(x.clicks, x.views);
      x.cvr = pct(x.cv, x.clicks);
      return x;
    }).sort(function (a, b2) { return b2.views - a.views; });

    // totals
    var T = { views: 0, eng: 0, clicks: 0, cv: 0 };
    platRows.forEach(function (x) { T.views += x.views; T.eng += x.eng; T.clicks += x.clicks; T.cv += x.cv; });
    T.ctr = pct(T.clicks, T.views);
    T.cvr = pct(T.cv, T.clicks);
    T.clippers = campaignClipperCount(campaign);
    T.engRate = pct(T.eng, T.views);

    // clipper ranking (shares of total views/cv, stable per campaign)
    var rr = rngFor("rank:" + campaign.id);
    var picks = [];
    var poolIdx = Math.floor(rr() * CLIPPER_POOL.length);
    for (var i = 0; i < T.clippers; i++) {
      picks.push(CLIPPER_POOL[(poolIdx + i) % CLIPPER_POOL.length]);
    }
    var weights = picks.map(function () { return 0.3 + rr(); });
    var wsum = weights.reduce(function (a, c) { return a + c; }, 0);
    var clippers = picks.map(function (c, i) {
      var share = weights[i] / wsum;
      return {
        name: c.name, handle: c.handle,
        views: Math.round(T.views * share),
        cv: Math.round(T.cv * share),
        posts: 1 + Math.floor(rr() * 6)
      };
    }).sort(function (a, b2) { return b2.views - a.views; });

    return { platforms: platRows, series: series, totals: T, clippers: clippers, granularity: granularity };
  }

  /* ======================================================================
     Payment method registration (demo)
     The client (advertiser / rights holder) registers how they pay CLIPYIELD
     for campaign budgets. This is a prototype: card numbers and account numbers
     are NEVER stored — only the brand + last 4 digits (card) or the invoice
     billing profile are kept in localStorage. In production this must be handled
     by a PCI-DSS compliant processor (Stripe / GMO 等) via tokenization.
     ====================================================================== */
  function detectBrand(number) {
    var n = (number || "").replace(/\D/g, "");
    if (/^4/.test(n)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
    if (/^3[47]/.test(n)) return "Amex";
    if (/^(352[89]|35[3-8])/.test(n)) return "JCB";
    if (/^3(0[0-5]|[68])/.test(n)) return "Diners";
    if (/^6(011|5)/.test(n)) return "Discover";
    return "カード";
  }
  function luhnValid(number) {
    var n = (number || "").replace(/\D/g, "");
    if (n.length < 13 || n.length > 19) return false;
    var sum = 0, alt = false;
    for (var i = n.length - 1; i >= 0; i--) {
      var d = parseInt(n.charAt(i), 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function getBilling() {
    var c = current(); if (!c) return null;
    var all = read(K.billing, {});
    return all[c.id] || null;
  }
  // profile: { method:"card"|"bank", card:{brand,last4,expMonth,expYear,holder}, bank:{...} }
  function saveBilling(profile) {
    var c = current(); if (!c) return null;
    var all = read(K.billing, {});
    profile.clientId = c.id;
    profile.updatedAt = new Date().toISOString();
    all[c.id] = profile;
    write(K.billing, all);
    return profile;
  }
  function clearBilling() {
    var c = current(); if (!c) return;
    var all = read(K.billing, {});
    delete all[c.id];
    write(K.billing, all);
  }

  global.CYClient = {
    K: K, seed: seed, login: login, logout: logout, current: current,
    requireAuth: requireAuth, listSubs: listSubs, saveSub: saveSub,
    makeAffiliateBase: makeAffiliateBase,
    analytics: analytics, campaignPlatforms: campaignPlatforms,
    detectBrand: detectBrand, luhnValid: luhnValid,
    getBilling: getBilling, saveBilling: saveBilling, clearBilling: clearBilling
  };
})(window);
