/**
 * HYDRATION-TRACE-01: runs BEFORE any React code (loaded via <head>).
 *
 * Captures every DOM mutation between page load and the #418 error, so
 * the exact element inserted during hydration is visible in the report
 * instead of inferred from binary search.
 *
 * Overhead: a MutationObserver writing to an in-memory array. The
 * observer disconnects itself 15s after load — after the hydration
 * window is definitely closed.
 */
(function () {
  if (typeof window === 'undefined' || window.__hydrationTraceInstalled) return;
  window.__hydrationTraceInstalled = true;

  var startedAt = performance.now();
  var events = [];
  var MAX = 500;
  var stopped = false;

  function describe(node) {
    if (!node || node.nodeType === 3) {
      var txt = (node && node.textContent || '').slice(0, 60).replace(/\s+/g, ' ');
      return '#text("' + txt + '")';
    }
    if (node.nodeType !== 1) return '<node-' + node.nodeType + '>';
    var tag = node.tagName.toLowerCase();
    var id = node.id ? '#' + node.id : '';
    var cls = '';
    if (typeof node.className === 'string' && node.className) {
      cls = '.' + node.className.trim().split(/\s+/).slice(0, 3).join('.');
    }
    var parentPath = '';
    var p = node.parentElement;
    if (p) {
      var pt = p.tagName.toLowerCase();
      var pi = p.id ? '#' + p.id : '';
      var pc = '';
      if (typeof p.className === 'string' && p.className) {
        pc = '.' + p.className.trim().split(/\s+/).slice(0, 2).join('.');
      }
      parentPath = '@' + pt + pi + pc;
    }
    return tag + id + cls + parentPath;
  }

  function push(ev) {
    if (stopped) return;
    ev.t = Math.round(performance.now() - startedAt);
    events.push(ev);
    while (events.length > MAX) events.shift();
  }

  var observer = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'childList') {
        var added = m.addedNodes, removed = m.removedNodes, k;
        for (k = 0; k < added.length; k++) push({ type: 'ADD', target: describe(m.target), node: describe(added[k]) });
        for (k = 0; k < removed.length; k++) push({ type: 'REMOVE', target: describe(m.target), node: describe(removed[k]) });
      } else if (m.type === 'attributes') {
        var val = m.target.getAttribute && m.target.getAttribute(m.attributeName);
        push({ type: 'ATTR', target: describe(m.target), attr: m.attributeName, value: String(val == null ? '' : val).slice(0, 120) });
      } else if (m.type === 'characterData') {
        push({ type: 'TEXT', target: describe(m.target) });
      }
    }
  });

  try {
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeOldValue: false, characterData: true,
    });
  } catch (e) { return; }

  // Expose for the error monitor to read on demand.
  window.__hydrationTrace = {
    events: events,
    startedAt: startedAt,
    stop: function () { stopped = true; try { observer.disconnect(); } catch (e) {} },
    snapshot: function () { return events.slice(-100); },
  };

  // Auto-stop after the hydration window has definitely closed.
  window.setTimeout(function () {
    stopped = true;
    try { observer.disconnect(); } catch (e) {}
    events.push({ type: 'STOP', t: Math.round(performance.now() - startedAt), note: 'tracker stopped' });
  }, 15000);

  // On any error that mentions hydration / React error, dump the last
  // 100 events to console so the existing console.error interceptor
  // picks them up and stores them in the device error journal.
  window.addEventListener('error', function (e) {
    var msg = (e && e.message) || '';
    if (/hydration|hydrated|react error #?(418|423|425)/i.test(msg)) {
      try {
        console.error('[HYDRATION-TRACE-DUMP]', JSON.stringify(events.slice(-100)));
      } catch (x) { /* ignore */ }
    }
  }, true);
})();
