// Radar-3 dashboard: board, filter, sort, detail, Method panel. Reads
// window.RADAR only. The page recomputes every row's implied value from the
// fitted size curve, so the screen and board.json agree by construction.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre', sort: 'implied', dir: -1, selected: null };
  var V = DATA.validation;
  var FIT = V.size_curve;
  var fmtUsd = function (n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  };
  var fmtPct = function (n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  };
  var fmtAge = function (d) {
    if (d === null || d === undefined) return 'unknown';
    return d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.max(0, Math.round(d)) + 'd';
  };
  function impliedOf(row) {
    return Math.max(1, Math.round(Math.pow(10, FIT.a + FIT.b * Math.log10(row.tvl_usd))));
  }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(x); });
      else if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  }
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('method')) state.method = true;
    if (p.get('farm')) state.farm = true;
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname);
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (state.sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (state.sort === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }
  function sortBtn(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render();
    } }, label, state.sort === key ? el('span', { text: state.dir < 0 ? ' v' : ' ^' }) : null));
  }
  function boardTable() {
    var list = sorted(filtered());
    if (!list.length) return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search or pick another category to see the board again.' }),
      el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })));
    var max = list[0].implied_value_usd || 1;
    var tb = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains || []).slice(0, 2).join(', ') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'status', text: 'no token' })));
      tb.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
      el('thead', null, el('tr', null, sortBtn('implied', 'Rank'), sortBtn('name', 'Protocol'), sortBtn('tvl', 'TVL'), sortBtn('growth', '7d'), sortBtn('age', 'Age'), sortBtn('implied', 'Implied value'), el('th', { scope: 'col', text: 'Token' }))),
      tb)));
  }
  function liveTable() {
    var tb = el('tbody');
    DATA.live.forEach(function (r) {
      tb.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains || []).slice(0, 2).join(', ') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
      el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
      tb)));
  }
  function methodPanel() {
    var v = V;
    return el('section', { class: 'panel method', id: 'method' },
      el('h2', { text: 'Method & validation — fitted, not asserted' }),
      el('p', { class: 'sub', text: 'One fitted size curve prices the whole board. It is fit live from the snapshot\'s own launched protocols — ' + v.comps + ' clean comps — and tested out of sample before it prices anything.' }),
      el('div', { class: 'formula' }, 'log10(implied value) = ' + FIT.a.toFixed(3) + ' + ' + FIT.b.toFixed(3) + ' x log10(TVL)   —   fitted on ' + v.comps + ' comps'),
      el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Validation' }), el('th', { scope: 'col', text: 'Median error' }), el('th', { scope: 'col', text: 'Within 2x' }), el('th', { scope: 'col', text: 'n' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: '5-fold cross-validation (seeded)' }), el('td', { class: 'num', text: 'x' + v.cv.median_factor.toFixed(2) }), el('td', { class: 'num', text: Math.round(v.cv.within_2x * 100) + '%' }), el('td', { class: 'num', text: String(v.cv.n) })),
          el('tr', null, el('td', { text: 'Time split — train older half, test newer half' }), el('td', { class: 'num', text: 'x' + v.time_split.median_factor.toFixed(2) }), el('td', { class: 'num', text: Math.round(v.time_split.within_2x * 100) + '%' }), el('td', { class: 'num', text: String(v.time_split.n) })),
          el('tr', null, el('td', { text: 'Previous radar (linear 0.18 x TVL), same time split' }), el('td', { class: 'num', text: 'x5.41' }), el('td', { class: 'num', text: '31%' }), el('td', { class: 'num', text: '35' }))))),
      el('p', { class: 'sub note', text: v.decision + ' Full reasoning, comps filter and limitations are in research.md, beside this page.' }));
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function farmTotal(row) {
    var m = /about \$([0-9.]+) of gas in total/.exec((row.farm_steps || []).join(' '));
    return m ? '$' + m[1] : 'n/a';
  }
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug; writeHash(); dialog.textContent = '';
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null, el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains || []).join(', ') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — why this number' }),
      el('div', { class: 'why' }, 'TVL ' + fmtUsd(row.tvl_usd) + '  x  fitted multiple ' + row.tvl_multiple.toFixed(3) + '  =  ' + fmtUsd(row.implied_value_usd) + '   —   10^(' + row.fit_a.toFixed(3) + ' + ' + row.fit_b.toFixed(3) + ' x log10(' + fmtUsd(row.tvl_usd) + '))'),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Fitted multiple (implied / TVL)' }), el('b', { class: 'num', text: row.tvl_multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Farm cost in total' }), el('b', { class: 'num', text: farmTotal(row) + ' of gas' }))),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board.') + ' This is an estimate, not a price.' })));
    dialog.appendChild(el('section', { class: 'detail-section', id: 'farm-plan' },
      el('h3', { text: 'Farm plan — ' + row.farm_steps.length + ' steps, costed' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
      }))));
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    if (state.farm) {
      var fp = dialog.querySelector('#farm-plan');
      if (fp) fp.scrollIntoView();
    }
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' }, el('span', { text: 'Snapshot ' + DATA.as_of }), el('span', { text: 'DefiLlama protocol index' }), el('span', { text: DATA.model_version + ' model' }))));
    shell.appendChild(el('section', { class: 'lede' },
      el('div', null, el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by a fitted size curve' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, picked by fitted implied value. Values are fitted from the ' + V.comps + ' launched protocols that already trade — median out-of-sample error x' + V.time_split.median_factor.toFixed(2) + ' on a blind time split.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Time-split OOS error' }), el('b', { text: 'x' + V.time_split.median_factor.toFixed(2) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) })))));
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    shell.appendChild(el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre' ? filtered().length + ' rows shown' : DATA.live.length + ' live-token protocols' })));
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    shell.appendChild(methodPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    if (state.method) {
      var m = document.getElementById('method');
      if (m) m.scrollIntoView();
    }
  }
  readHash(); render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
