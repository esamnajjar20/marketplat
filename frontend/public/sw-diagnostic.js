(function() {
  'use strict';

  var marker = document.getElementById('js-marker');
  if (marker) { marker.textContent = 'JS: محمّل ✓'; marker.classList.add('loaded'); }

  var report = { ts: new Date().toISOString(), sections: {} };
  var errorCount = 0;

  function setHTML(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function withTimeout(promise, ms, fallback) {
    return Promise.race([
      promise,
      new Promise(function(resolve) { setTimeout(function() { resolve(fallback); }, ms); })
    ]);
  }

  // ══════ Section 1: General ══════
  function scanGeneral() {
    var out = [];
    out.push('<div class="row"><span class="label">URL</span><span class="value">' + escapeHtml(location.href) + '</span></div>');
    out.push('<div class="row"><span class="label">Origin</span><span class="value">' + escapeHtml(location.origin) + '</span></div>');
    out.push('<div class="row"><span class="label">onLine</span><span class="value">' + (navigator.onLine ? '<span class="badge ok">أونلاين</span>' : '<span class="badge warn">أوفلاين</span>') + '</span></div>');

    if ('serviceWorker' in navigator) {
      out.push('<div class="row"><span class="label">SW controller</span><span class="value">' + (navigator.serviceWorker.controller ? 'نعم' : 'لا') + '</span></div>');
    } else {
      out.push('<div class="row"><span class="label">SW</span><span class="value"><span class="badge err">غير مدعوم</span></span></div>');
    }

    if (navigator.storage && navigator.storage.estimate) {
      withTimeout(navigator.storage.estimate(), 2000, null).then(function(est) {
        if (est && est.usage != null && est.quota != null) {
          var usedMB = (est.usage / 1048576).toFixed(1);
          var quotaMB = (est.quota / 1048576).toFixed(0);
          out.push('<div class="row"><span class="label">Storage</span><span class="value">' + usedMB + ' MB / ' + quotaMB + ' MB</span></div>');
        }
        setHTML('general', out.join(''));
        report.sections.general = out.map(function(h){ return h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }).join('\n');
      });
    } else {
      setHTML('general', out.join(''));
      report.sections.general = out.map(function(h){ return h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }).join('\n');
    }
  }

  // ══════ Section 3: Caches ══════
  function scanCaches() {
    caches.keys().then(function(names) {
      var out = [];
      out.push('<div class="row"><span class="label">عدد الكاشات</span><span class="value">' + names.length + '</span></div>');
      var promises = names.sort().map(function(name) {
        return caches.open(name).then(function(c) { return c.keys(); }).then(function(keys) {
          var isV52 = /-v52(\b|$)/.test(name) || name.slice(-4) === '-v52';
          var isV51 = /-v51(\b|$)/.test(name) || name.slice(-4) === '-v51';
          var isV50 = /-v50(\b|$)/.test(name) || name.slice(-4) === '-v50';
          var badge = isV52 ? '<span class="badge ok">v52</span>' :
                      isV51 ? '<span class="badge warn">v51</span>' :
                      isV50 ? '<span class="badge err">v50</span>' : '';
          return '<div class="row"><span class="label">' + badge + '</span><span class="value">' + escapeHtml(name) + ' — <strong>' + keys.length + '</strong> مدخل</span></div>';
        }).catch(function() {
          return '<div class="row"><span class="value"><span class="badge err">خطأ في ' + escapeHtml(name) + '</span></span></div>';
        });
      });
      return Promise.all(promises).then(function(rows) {
        setHTML('caches', out.join('') + rows.join(''));
        report.sections.caches = (out.join('') + rows.join('')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      });
    }).catch(function(e) {
      setHTML('caches', '<div class="row"><span class="value"><span class="badge err">خطأ: ' + escapeHtml(e.message) + '</span></span></div>');
      errorCount++;
    });
  }

  // ══════ Section 4: Static keys ══════
  function scanStaticKeys() {
    caches.keys().then(function(names) {
      var name = names.find(function(n) { return n.indexOf('market-static-') === 0; });
      if (!name) {
        setHTML('static-keys', '<span class="badge err">لا يوجد كاش market-static-*</span>');
        return;
      }
      caches.open(name).then(function(c) { return c.keys(); }).then(function(keys) {
        var htmlKeys = keys.filter(function(k) {
          var u;
          try { u = new URL(k.url); } catch (e) { return false; }
          if (u.origin !== location.origin) return false;
          if (u.pathname.indexOf('/_next/') === 0) return false;
          if (u.pathname.indexOf('/api/') === 0) return false;
          if (/\.[a-z0-9]{2,8}$/i.test(u.pathname)) return false;
          return true;
        });
        if (htmlKeys.length === 0) {
          setHTML('static-keys', '<span class="badge err">لا HTML (فقط JS/CSS)</span>');
          report.sections.staticKeys = 'NO HTML';
          return;
        }
        var lines = htmlKeys.slice(0, 60).map(function(k) {
          var u = new URL(k.url);
          return '<code>' + escapeHtml(u.pathname + u.search) + '</code>';
        });
        var extra = htmlKeys.length > 60 ? '<div class="sub" style="margin-top:8px">… و ' + (htmlKeys.length - 60) + ' أخرى</div>' : '';
        setHTML('static-keys', lines.join('') + extra);
        report.sections.staticKeys = htmlKeys.map(function(k) {
          var u = new URL(k.url); return u.pathname + u.search;
        }).join('\n');
      });
    }).catch(function(e) {
      setHTML('static-keys', '<span class="badge err">خطأ: ' + escapeHtml(e.message) + '</span>');
      errorCount++;
    });
  }

  // ══════ Section 5: Personal keys ══════
  function scanPersonalKeys() {
    caches.keys().then(function(names) {
      var name = names.find(function(n) { return n.indexOf('market-personal-shell-') === 0; });
      if (!name) {
        setHTML('personal-keys', '<span class="badge muted">لا يوجد (لم تسجّل دخول؟)</span>');
        return;
      }
      caches.open(name).then(function(c) { return c.keys(); }).then(function(keys) {
        var htmlKeys = keys.filter(function(k) { return !/\.[a-z0-9]{2,8}$/i.test(new URL(k.url).pathname); });
        var lines = htmlKeys.slice(0, 40).map(function(k) {
          var u = new URL(k.url);
          return '<code>' + escapeHtml(u.pathname + u.search) + '</code>';
        });
        setHTML('personal-keys', '<div class="sub">' + htmlKeys.length + ' مدخل HTML</div>' + (lines.join('') || '<span class="badge muted">فارغ</span>'));
        report.sections.personalKeys = htmlKeys.map(function(k) {
          var u = new URL(k.url); return u.pathname + u.search;
        }).join('\n');
      });
    }).catch(function() {
      setHTML('personal-keys', '<span class="badge err">خطأ في القراءة</span>');
      errorCount++;
    });
  }

  // ══════ Section 6: Snapshot ══════
  function scanSnapshot() {
    var req = indexedDB.open('marketplat-warming', 1);
    req.onerror = function() {
      setHTML('snapshot', '<span class="badge err">تعذّر فتح IndexedDB</span>');
      errorCount++;
    };
    req.onsuccess = function() {
      var db = req.result;
      var tx = db.transaction('state', 'readonly');
      var get = tx.objectStore('state').get('current');
      get.onerror = function() {
        setHTML('snapshot', '<span class="badge err">خطأ في القراءة</span>');
      };
      get.onsuccess = function() {
        var snap = get.result;
        if (!snap) {
          setHTML('snapshot', '<span class="badge muted">لا snapshot بعد</span>');
          report.sections.snapshot = 'NO SNAPSHOT';
          return;
        }
        var routes = Object.keys(snap.routes || {});
        var complete = 0, failed = 0;
        for (var i = 0; i < routes.length; i++) {
          var st = snap.routes[routes[i]].status;
          if (st === 'complete') complete++;
          else if (st === 'failed') failed++;
        }
        var ageMs = Date.now() - (snap.updatedAt || 0);
        var ageStr = ageMs < 60000 ? Math.round(ageMs/1000) + 'ث'
                   : ageMs < 3600000 ? Math.round(ageMs/60000) + 'د'
                   : ageMs < 86400000 ? Math.round(ageMs/3600000) + 'س'
                   : Math.round(ageMs/86400000) + 'ي';
        var html = '';
        html += '<div class="row"><span class="label">cacheVersion</span><span class="value">' + escapeHtml(snap.cacheVersion || '?') + '</span></div>';
        html += '<div class="row"><span class="label">آخر تحديث</span><span class="value">' + ageStr + '</span></div>';
        html += '<div class="row"><span class="label">liveUrls</span><span class="value">' + (snap.liveUrls || []).length + '</span></div>';
        html += '<div class="row"><span class="label">routes</span><span class="value">' + routes.length + ' — <span class="badge ok">مكتمل ' + complete + '</span> <span class="badge err">فشل ' + failed + '</span></span></div>';
        setHTML('snapshot', html);
        report.sections.snapshot = 'cacheVersion=' + snap.cacheVersion + ' updatedAt=' + snap.updatedAt + ' liveUrls=' + (snap.liveUrls || []).length + ' routes=' + routes.length + ' complete=' + complete + ' failed=' + failed;
      };
    };
  }

  // ══════ Section 7: SW status ══════
  function scanSwStatus() {
    if (!('serviceWorker' in navigator)) {
      setHTML('sw-status', '<span class="badge err">Service Worker غير مدعوم</span>');
      return;
    }
    navigator.serviceWorker.getRegistration().then(function(reg) {
      var html = '';
      if (!reg) {
        setHTML('sw-status', '<span class="badge warn">لا registration</span>');
        return;
      }
      var active = reg.active;
      html += '<div class="row"><span class="label">active</span><span class="value">' + (active ? '<span class="badge ok">نعم</span>' : '<span class="badge warn">لا</span>') + '</span></div>';
      if (active) {
        html += '<div class="row"><span class="label">scriptURL</span><span class="value">' + escapeHtml(active.scriptURL) + '</span></div>';
      }
      html += '<div class="row"><span class="label">waiting</span><span class="value">' + (reg.waiting ? '<span class="badge warn">نعم (ينتظر)</span>' : 'لا') + '</span></div>';
      html += '<div class="row"><span class="label">installing</span><span class="value">' + (reg.installing ? 'نعم' : 'لا') + '</span></div>';
      setHTML('sw-status', html);
      report.sections.swStatus = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    }).catch(function(e) {
      setHTML('sw-status', '<span class="badge err">خطأ: ' + escapeHtml(e.message) + '</span>');
      errorCount++;
    });
  }

  // ══════ Section 2: Test path (on demand) ══════
  window.setPath = function(p) {
    document.getElementById('test-path').value = p;
    window.testPath();
  };

  window.testPath = function() {
    var path = document.getElementById('test-path').value.trim();
    if (!path) return;
    setHTML('test-output', '<div style="padding:10px;color:#8a919c">جارٍ الاختبار…</div>');

    caches.keys().then(function(names) {
      var staticName = names.find(function(n) { return n.indexOf('market-static-') === 0; });
      var personalName = names.find(function(n) { return n.indexOf('market-personal-shell-') === 0; });
      var staticP = staticName ? caches.open(staticName) : Promise.resolve(null);
      var personalP = personalName ? caches.open(personalName) : Promise.resolve(null);
      Promise.all([staticP, personalP]).then(function(arr) {
        var sc = arr[0], pc = arr[1];
        var url = new URL(path, location.origin);
        var variants = [
          { label: 'exact', key: url.href },
          { label: 'bare path', key: url.origin + url.pathname },
          { label: 'slash alt', key: url.origin + (url.pathname.slice(-1) === '/' ? url.pathname.slice(0,-1) || '/' : url.pathname + '/') }
        ];
        var promises = variants.map(function(v) {
          var s = sc ? sc.match(v.key).then(function(r) { return !!r; }) : Promise.resolve(false);
          var p = pc ? pc.match(v.key).then(function(r) { return !!r; }) : Promise.resolve(false);
          return Promise.all([s, p]).then(function(res) {
            var inS = res[0], inP = res[1];
            var badge = inS ? '<span class="badge ok">static ✓</span>' :
                        inP ? '<span class="badge ok">personal ✓</span>' :
                        '<span class="badge err">✗</span>';
            return '<div class="row"><span class="label">' + v.label + '</span><span class="value">' + badge + ' ' + escapeHtml(v.key) + '</span></div>';
          });
        });
        Promise.all(promises).then(function(rows) {
          setHTML('test-output', '<div style="padding:10px;background:#0a0c10;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;direction:ltr;text-align:left">' + rows.join('') + '</div>');
        });
      });
    }).catch(function(e) {
      setHTML('test-output', '<div class="badge err">خطأ: ' + escapeHtml(e.message) + '</div>');
    });
  };

  // ══════ Copy report ══════
  window.copyReport = function() {
    var lines = ['# تقرير تشخيص الأوفلاين', 'التاريخ: ' + report.ts, ''];
    for (var k in report.sections) {
      if (Object.prototype.hasOwnProperty.call(report.sections, k)) {
        lines.push('## ' + k, String(report.sections[k]), '');
      }
    }
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        var m = document.getElementById('js-marker');
        var old = m.textContent;
        m.textContent = 'تم النسخ ✓';
        m.classList.add('loaded');
        setTimeout(function() { m.textContent = old; }, 1500);
      }).catch(function() { alert('انسخ يدوياً'); });
    } else {
      alert('المتصفح لا يدعم النسخ التلقائي');
    }
  };

  // ══════ Master — run all in parallel ══════
  function runAll() {
    setText('last-scan', 'جارٍ…');
    scanGeneral();
    scanCaches();
    scanStaticKeys();
    scanPersonalKeys();
    scanSnapshot();
    scanSwStatus();
    setTimeout(function() {
      setText('last-scan', new Date().toLocaleTimeString('ar-EG'));
      if (errorCount > 0) {
        var m = document.getElementById('js-marker');
        m.textContent = 'JS: خطأ × ' + errorCount;
        m.classList.add('partial');
      }
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else {
    runAll();
  }
})();
