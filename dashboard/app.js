/* Token Radar dashboard, model radar-2.
 * Reads window.RADAR (written by main.ts from the sealed snapshot), renders a
 * sortable, filterable board, a detail view per protocol, a live-token view,
 * and a model sandbox that re-ranks the board when a constant moves.
 * No network: all data is local, no fetch, no external resource. */
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.getElementById('app').textContent = 'No radar data.'; return; }
  var rows = R.rows.slice();
  var live = R.live.slice();
  var M = R.model;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { if (n == null) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function pctCls(n) { return n == null ? 'flat' : n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; }
  function ageText(d) { if (d == null) return 'unknown'; if (d < 30) return d + 'd'; if (d < 365) return Math.floor(d / 30) + 'mo'; return (d / 365).toFixed(1) + 'y'; }
  function $(s, el) { return (el || document).querySelector(s); }

  /* ---------- model, mirrored from lib/model.ts ---------- */
  function catMult(cat) {
    var c = (cat || '').toLowerCase();
    if (/dex|lend|yield|deriv|perpetual|cdp|stablecoin/.test(c)) return M.category_up;
    if (/bridge|staking|restak/.test(c)) return M.category_down;
    return 1;
  }
  function ageFactor(age) {
    if (age == null) return 1;
    if (age < M.young_days) return M.young_factor;
    if (age > M.old_days) return M.old_factor;
    return 1;
  }
  function implied(r, m) {
    var g = Math.min(M.growth_cap, Math.max(M.growth_floor, r.change_7d == null ? 0 : r.change_7d));
    var gm = 1 + (g / 100) * m.growth_weight;
    var a = r.age_days == null ? M.unknown_age_days : r.age_days;
    var mm = M.maturity_floor + (Math.min(Math.max(a, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var cm = 1 + m.chain_step * Math.min(Math.max(r.chains.length - 1, 0), M.chain_max_steps);
    var cat = catMult(r.category);
    var af = ageFactor(r.age_days);
    return Math.max(1, Math.round(r.tvl_usd * m.base_multiple * gm * mm * cm * cat * af));
  }
  function breakdown(r, m) {
    var g = Math.min(M.growth_cap, Math.max(M.growth_floor, r.change_7d == null ? 0 : r.change_7d));
    var a = r.age_days == null ? M.unknown_age_days : r.age_days;
    return [
      ['TVL base', 'x' + m.base_multiple, m.base_multiple, 1],
      ['7-day growth ' + pct(g), 'x' + (1 + (g / 100) * m.growth_weight).toFixed(3), 1 + (g / 100) * m.growth_weight, 1.6],
      ['Maturity (' + ageText(r.age_days) + ')', 'x' + (M.maturity_floor + (Math.min(Math.max(a, 0), M.maturity_days) / M.maturity_days) * M.maturity_range).toFixed(3), M.maturity_floor + (Math.min(Math.max(a, 0), M.maturity_days) / M.maturity_days) * M.maturity_range, 1],
      ['Chains (' + r.chains.length + ')', 'x' + (1 + m.chain_step * Math.min(Math.max(r.chains.length - 1, 0), M.chain_max_steps)).toFixed(3), 1 + m.chain_step * Math.min(Math.max(r.chains.length - 1, 0), M.chain_max_steps), 1.1],
      ['Category', 'x' + catMult(r.category).toFixed(2), catMult(r.category), 1.1],
      ['Age factor', 'x' + ageFactor(r.age_days).toFixed(2), ageFactor(r.age_days), 1]
    ];
  }

  /* ---------- farm steps, mirrored from lib/model.ts ---------- */
  function capitalFor(tvl) { if (tvl >= 5e9) return 250; if (tvl >= 1e9) return 150; if (tvl >= 1e8) return 100; return 50; }
  function holdFor(age) { if (age == null) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function chainOf(r) { return r.chains.length ? r.chains[0] : 'its main chain'; }
  function actionFor(r, cap, chain) {
    var c = (r.category || '').toLowerCase(), n = r.name;
    if (/lend|cdp|collateral/.test(c)) return 'Supply $' + cap + ' of USDC to ' + n + ' on ' + chain + ' and keep the position open.';
    if (/dex|yield|leveraged farm/.test(c)) return 'Provide $' + cap + ' of liquidity to ' + n + '\u2019s main pool on ' + chain + ' and keep the position open.';
    if (/bridge/.test(c)) return 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in its app.';
    if (/staking|restak/.test(c)) return 'Stake $' + cap + ' of the chain\u2019s staking asset through ' + n + ' and keep the receipt.';
    if (/perpetual|derivative/.test(c)) return 'Deposit $' + cap + ' of USDC as margin on ' + n + ' and open one small hedge.';
    if (/prediction/.test(c)) return 'Fund $' + cap + ' and place one market position on ' + n + '.';
    if (/curator|allocator/.test(c)) return 'Deposit $' + cap + ' into a ' + n + ' vault on ' + chain + ' and keep the shares.';
    if (/stable/.test(c)) return 'Mint or deposit $' + cap + ' of the stable asset through ' + n + ' on ' + chain + '.';
    if (/rwa/.test(c)) return 'Mint $' + cap + ' of the protocol\u2019s yield asset on ' + chain + ' and hold it.';
    if (/insurance/.test(c)) return 'Buy $' + cap + ' of cover from ' + n + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + cap + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(r) {
    var chain = chainOf(r), cap = capitalFor(r.tvl_usd), hold = holdFor(r.age_days);
    var extra = r.chains.length > 1 ? ' It also runs on ' + r.chains.slice(1, 3).join(', ') + (r.chains.length > 3 ? ' and more' : '') + ', so repeat the position there only if the app counts it.' : '';
    return [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [actionFor(r, cap, chain) + extra, '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + cap + ' stays in the position', hold + ' days'],
      ['Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes']
    ];
  }

  /* ---------- state ---------- */
  var state = {
    view: 'board', q: '', cat: '', chain: '', mom: '', watch: false, minTvl: 0,
    sort: 'rank', dir: 1, page: 0, per: 50,
    sandbox: { base_multiple: M.base_multiple, growth_weight: M.growth_weight, chain_step: M.chain_step },
    detail: null
  };
  var watchSet = {};
  R.rows.forEach(function (r) { if (R.watchlist && R.watchlist.indexOf(r.slug) >= 0) watchSet[r.slug] = true; });
  // The snapshot's watchlist is not in data.js; rebuild it from the board flag instead.
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();

  function ranked() {
    var m = state.sandbox;
    var list = rows.map(function (r) { return { r: r, v: implied(r, m) }; });
    list.sort(function (a, b) { return b.v - a.v || (a.r.slug < b.r.slug ? -1 : 1); });
    return list.map(function (x, i) { x.rank = i + 1; return x; });
  }
  function filtered(list) {
    var q = state.q.toLowerCase();
    return list.filter(function (x) {
      var r = x.r;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.mom === 'rising' && !(r.change_7d != null && r.change_7d >= 10)) return false;
      if (state.mom === 'falling' && !(r.change_7d != null && r.change_7d <= -10)) return false;
      if (state.watch && !watchSet[r.slug]) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      return true;
    });
  }
  function sorted(list) {
    var k = state.sort, d = state.dir;
    var val = function (x) {
      var r = x.r;
      if (k === 'rank') return x.rank; if (k === 'name') return r.name.toLowerCase();
      if (k === 'tvl') return r.tvl_usd; if (k === 'chg') return r.change_7d == null ? -9999 : r.change_7d;
      if (k === 'value') return x.v; return x.rank;
    };
    return list.slice().sort(function (a, b) { var x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * d; });
  }

  /* ---------- render ---------- */
  var app = document.getElementById('app');
  function header() {
    return '<header class="top"><h1>Token <b>Radar</b></h1><p>Pre-token protocols ranked by implied value: what a token would be worth if the protocol\u2019s record stayed as it is, and how to farm it. Data: sealed snapshot of ' + R.protocols_size + ' protocols as of ' + esc(R.as_of) + ' (DefiLlama). Model ' + esc(R.model_version) + '.</p>' +
      '<div class="stats"><div class="stat"><b>' + R.board_size + '</b><span>protocols ranked</span></div><div class="stat"><b>' + R.watchlist_size + '</b><span>on the watchlist</span></div><div class="stat"><b>' + R.early_size + '</b><span>early finds below the floor</span></div><div class="stat"><b>' + money(R.rows[0].implied_value_usd) + '</b><span>top implied value</span></div><div class="stat"><b>' + R.live_size + '</b><span>live tokens set aside</span></div></div></header>';
  }
  function modelBox() {
    var s = state.sandbox;
    return '<section class="model"><h2>How the value is scored (model ' + esc(R.model_version) + ')</h2>' +
      '<p class="formula"><code>implied = TVL x base x growth x maturity x chains x category x age</code></p>' +
      '<p>Base is TVL x <code>' + M.base_multiple + '</code>. Growth is the 7-day TVL change clamped to ' + M.growth_floor + '%..' + M.growth_cap + '%, weighted x' + M.growth_weight + '. Maturity rises from ' + M.maturity_floor + ' to 1.0 over ' + M.maturity_days + ' days with no token. Each extra chain adds ' + (M.chain_step * 100) + '% (max ' + M.chain_max_steps + '). Launch-heavy categories score x' + M.category_up + ', wrapper products x' + M.category_down + '. Under ' + M.young_days + ' days old scores x' + M.young_factor + '; past ' + M.old_days + ' days with no token scores x' + M.old_factor + '. Nothing is hardcoded by name.</p>' +
      '<div class="sliders">' +
      '<label>Base multiple <output>' + s.base_multiple.toFixed(2) + '</output><input type="range" min="0.1" max="0.5" step="0.05" value="' + s.base_multiple + '" data-k="base_multiple"></label>' +
      '<label>Growth weight <output>' + s.growth_weight.toFixed(2) + '</output><input type="range" min="0" max="1" step="0.1" value="' + s.growth_weight + '" data-k="growth_weight"></label>' +
      '<label>Chain step <output>' + (s.chain_step * 100).toFixed(1) + '%</output><input type="range" min="0" max="0.05" step="0.005" value="' + s.chain_step + '" data-k="chain_step"></label>' +
      '</div><p>Move a slider to re-rank the board live. The submitted board uses the constants above.</p></section>';
  }
  function tabs() {
    return '<div class="tabs" role="tablist"><button data-view="board" aria-pressed="' + (state.view === 'board') + '">Ranked board</button><button data-view="live" aria-pressed="' + (state.view === 'live') + '">Live tokens</button></div>';
  }
  function filters() {
    var o = function (v, l) { return '<option value="' + esc(v) + '">' + esc(l) + '</option>'; };
    return '<div class="filters"><input type="search" id="fq" placeholder="Search name or slug\u2026" value="' + esc(state.q) + '" aria-label="Search">' +
      '<select id="fcat" aria-label="Category"><option value="">All categories</option>' + cats.map(function (c) { return o(c, c); }).join('') + '</select>' +
      '<select id="fchain" aria-label="Chain"><option value="">All chains</option>' + chains.map(function (c) { return o(c, c); }).join('') + '</select>' +
      '<select id="fmom" aria-label="Momentum"><option value="">Any momentum</option><option value="rising">Rising (+10% 7d)</option><option value="falling">Falling (-10% 7d)</option></select>' +
      '<select id="ftvl" aria-label="Minimum TVL"><option value="0">Any TVL</option><option value="1000000000">&ge; $1B TVL</option><option value="100000000">&ge; $100M TVL</option><option value="50000000">&ge; $50M TVL</option></select>' +
      '<label><input type="checkbox" id="fwatch"> Watchlist only</label></div>';
  }
  function sortBtn(k, label) {
    var arrow = state.sort === k ? (state.dir === 1 ? ' \u25B2' : ' \u25BC') : '';
    return '<button data-sort="' + k + '">' + label + arrow + '</button>';
  }
  function boardTable(list) {
    var pages = Math.max(1, Math.ceil(list.length / state.per));
    if (state.page >= pages) state.page = pages - 1;
    var slice = list.slice(state.page * state.per, state.page * state.per + state.per);
    var h = '<p class="count">' + list.length + ' of ' + R.board_size + ' protocols &middot; page ' + (state.page + 1) + ' of ' + pages + '</p>';
    h += '<table><thead><tr><th class="num">' + sortBtn('rank', 'Rank') + '</th><th>' + sortBtn('name', 'Protocol') + '</th><th>' + sortBtn('tvl', 'TVL') + '</th><th class="num">' + sortBtn('chg', '7d') + '</th><th class="num">' + sortBtn('value', 'Implied value') + '</th><th>Why it ranks here</th></tr></thead><tbody>';
    slice.forEach(function (x) {
      var r = x.r;
      h += '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + x.rank + '</td><td><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'uncategorised') + ' &middot; ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span>' + (watchSet[r.slug] ? ' <span class="tag watch">watchlist</span>' : '') + '</td><td class="num">' + money(r.tvl_usd) + '</td><td class="num ' + pctCls(r.change_7d) + '">' + pct(r.change_7d) + '</td><td class="num"><b>' + money(x.v) + '</b></td><td>' + esc(r.why) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="pager"><button id="prev" ' + (state.page === 0 ? 'disabled' : '') + '>&larr; Previous</button><span>Page ' + (state.page + 1) + ' / ' + pages + '</span><button id="next" ' + (state.page >= pages - 1 ? 'disabled' : '') + '>Next &rarr;</button></div>';
    return h;
  }
  function liveTable() {
    var h = '<p class="live-note">These protocols already have a token trading, so the board shows the market\u2019s own value, not a model\u2019s. They are set aside from the ranking, top ' + live.length + ' by market cap.</p><table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>';
    live.forEach(function (r) {
      h += '<tr><td><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'uncategorised') + '</span></td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + (r.mcap_usd == null ? 'n/a' : money(r.mcap_usd)) + '</td><td class="num ' + pctCls(r.change_7d) + '">' + pct(r.change_7d) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }
  function detail(slug) {
    var found = null, v = 0, rankNo = 0;
    ranked().forEach(function (x) { if (x.r.slug === slug) { found = x.r; v = x.v; rankNo = x.rank; } });
    if (!found) return '<p>Protocol not found. <button class="back" data-back="1">&larr; Back to the board</button></p>';
    var r = found, b = breakdown(r, state.sandbox), steps = farmSteps(r);
    var h = '<button class="back" data-back="1">&larr; Back to the board</button><section class="detail"><h2>' + esc(r.name) + '</h2>' +
      '<p class="meta">Rank #' + rankNo + ' &middot; ' + esc(r.slug) + ' &middot; ' + esc(r.category || 'uncategorised') + ' &middot; ' + esc(r.chains.join(', ')) + ' &middot; TVL ' + money(r.tvl_usd) + ' &middot; 7d ' + pct(r.change_7d) + ' &middot; age ' + ageText(r.age_days) + (watchSet[r.slug] ? ' &middot; <span class="tag watch">watchlist</span>' : '') + '</p>' +
      '<p><b>Implied value: ' + money(v) + '</b></p><p class="why">' + esc(r.why) + '</p><h3>How the value is built</h3><div class="bars">';
    b.forEach(function (row) {
      var w = Math.max(4, Math.min(100, row[2] * 70));
      h += '<div class="bar"><span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b><span class="track"><span class="fill" style="width:' + w + '%"></span></span></div>';
    });
    h += '</div><h3>How to farm it</h3><ol class="steps">';
    steps.forEach(function (s) { h += '<li>' + esc(s[0]) + ' <span class="cost">Cost: ' + esc(s[1]) + '. Time: ' + esc(s[2]) + '.</span></li>'; });
    h += '</ol><p class="live-note">This is a model\u2019s estimate from a frozen snapshot, not a prediction that a token will launch, or what it will be worth. Never pay to claim an airdrop.</p></section>';
    return h;
  }
  function render() {
    var h = header() + modelBox() + tabs();
    if (state.view === 'live') { h += liveTable(); }
    else if (state.detail) { h += detail(state.detail); }
    else {
      var list = sorted(filtered(ranked()));
      h += filters() + boardTable(list);
    }
    h += '<footer>Token Radar, model ' + esc(R.model_version) + ' &middot; snapshot ' + esc(R.as_of) + ' &middot; source: ' + esc(R.source) + ' &middot; Implied values are this radar\u2019s own estimates from the snapshot, not a prediction of a launch.</footer>';
    app.innerHTML = h;
    app.setAttribute('aria-busy', 'false');
    bind();
  }
  function bind() {
    var t;
    function on(sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); }
    app.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); state.detail = null; state.page = 0; render(); }); });
    app.querySelectorAll('[data-sort]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-sort'); if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; } render(); }); });
    app.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) { tr.addEventListener('click', function () { state.detail = tr.getAttribute('data-slug'); location.hash = 'detail-' + state.detail; render(); window.scrollTo(0, 0); }); });
    app.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { state.detail = null; location.hash = ''; render(); }); });
    on('#prev', 'click', function () { state.page--; render(); });
    on('#next', 'click', function () { state.page++; render(); });
    on('#fq', 'input', function (e) { state.q = e.target.value; state.page = 0; clearTimeout(t); t = setTimeout(render, 200); });
    on('#fcat', 'change', function (e) { state.cat = e.target.value; state.page = 0; render(); });
    on('#fchain', 'change', function (e) { state.chain = e.target.value; state.page = 0; render(); });
    on('#fmom', 'change', function (e) { state.mom = e.target.value; state.page = 0; render(); });
    on('#ftvl', 'change', function (e) { state.minTvl = parseInt(e.target.value, 10) || 0; state.page = 0; render(); });
    on('#fwatch', 'change', function (e) { state.watch = e.target.checked; state.page = 0; render(); });
    app.querySelectorAll('.sliders input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        state.sandbox[inp.getAttribute('data-k')] = parseFloat(inp.value);
        var out = inp.parentElement.querySelector('output');
        if (out) out.textContent = inp.getAttribute('data-k') === 'chain_step' ? (parseFloat(inp.value) * 100).toFixed(1) + '%' : parseFloat(inp.value).toFixed(2);
        clearTimeout(t); t = setTimeout(render, 250);
      });
    });
    // Restore filter/select values after re-render.
    var fq = $('#fq'); if (fq) fq.value = state.q;
    var fc = $('#fcat'); if (fc) fc.value = state.cat;
    var fh = $('#fchain'); if (fh) fh.value = state.chain;
    var fm = $('#fmom'); if (fm) fm.value = state.mom;
    var ft = $('#ftvl'); if (ft) ft.value = String(state.minTvl);
    var fw = $('#fwatch'); if (fw) fw.checked = state.watch;
  }
  /* Hash routes for the three screenshots: #detail-<slug>, #filter-<category>. */
  var hash = location.hash || '';
  if (hash.indexOf('#detail-') === 0) state.detail = hash.slice(8);
  else if (hash.indexOf('#filter-') === 0) state.cat = decodeURIComponent(hash.slice(8));
  render();
})();
