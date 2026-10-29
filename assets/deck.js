/* 深藍配金 sermon website — deck.js (no dependencies, works from file:// and GitHub Pages) */
(function () {
  "use strict";
  var D = window.DECK || {};
  var UI = D.ui || {};
  var qs = new URLSearchParams(location.search);
  var PREVIEW = qs.has("preview");
  var mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var REDUCE = mq.matches || qs.get("motion") === "0" || PREVIEW;
  var body = document.body;
  if (REDUCE) body.classList.add("reduce");
  if (PREVIEW) body.classList.add("preview");
  /* micro-animations: subtle idle motion on the current slide (off with reduced motion, ?micro=0 or meta.micro:false) */
  var MICRO = !REDUCE && !PREVIEW && D.micro !== false && qs.get("micro") !== "0";
  if (MICRO) body.classList.add("micro");

  var stage = document.querySelector(".stage");
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var N = slides.length;
  var navBtns = Array.prototype.slice.call(document.querySelectorAll(".nav button"));
  var pageno = document.querySelector(".pageno");
  var progress = document.querySelector(".progress");
  var help = document.querySelector(".help");
  var black = document.querySelector(".black");
  var steps = slides.map(function (s) {
    return Array.prototype.slice.call(s.querySelectorAll(".step")).sort(function (a, b) {
      return (+a.dataset.s || 0) - (+b.dataset.s || 0);
    });
  });
  var cur = -1, k = 0, flow = false, presenter = null, timers = [];

  /* ---------- counters ---------- */
  function fmt(v, el) {
    var dec = +el.dataset.dec || 0;
    return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: el.dataset.sep === "1" });
  }
  function setFinal(el) { el.textContent = fmt(+el.dataset.to, el); }
  function runCount(el, instant) {
    var to = +el.dataset.to, from = +(el.dataset.from || 0);
    if (el._raf) cancelAnimationFrame(el._raf);
    if (instant || REDUCE) { setFinal(el); return; }
    var dur = +el.dataset.dur || 1500, delay = +el.dataset.delay || 250, t0 = null;
    el.textContent = fmt(from, el);
    function tick(t) {
      if (t0 === null) t0 = t + delay;
      var p = Math.min(1, Math.max(0, (t - t0) / dur));
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e, el);
      if (p < 1) el._raf = requestAnimationFrame(tick); else setFinal(el);
    }
    el._raf = requestAnimationFrame(tick);
  }
  function play(el, instant) {
    el.classList.add("play");
    var cs = el.classList.contains("count") ? [el] : el.querySelectorAll(".count");
    for (var i = 0; i < cs.length; i++) runCount(cs[i], instant);
  }
  function unplay(el) {
    el.classList.remove("play");
    var cs = el.classList.contains("count") ? [el] : el.querySelectorAll(".count");
    for (var i = 0; i < cs.length; i++) { if (cs[i]._raf) cancelAnimationFrame(cs[i]._raf); cs[i].textContent = fmt(+(cs[i].dataset.from || 0), cs[i]); }
  }
  function topAnims(root, inStep) {
    return Array.prototype.slice.call(root.querySelectorAll(".anim")).filter(function (a) {
      if (a.parentElement.closest(".anim") && root.contains(a.parentElement.closest(".anim"))) return false;
      var st = a.closest(".step");
      return inStep ? true : !(st && root.contains(st));
    });
  }

  /* ---------- micro-animation dust (one shared layer, moved to the current slide) ---------- */
  var dust = null;
  function placeDust(s) {
    if (!dust) {
      dust = document.createElement("div"); dust.className = "dust"; dust.setAttribute("aria-hidden", "true");
      var h = "", r = Math.random;
      for (var q = 0; q < 16; q++) {
        h += '<i style="--x:' + (r() * 100).toFixed(1) + '%;--y:' + (25 + r() * 70).toFixed(1) + '%;--s:calc(var(--u) * ' + (4 + r() * 5).toFixed(1) +
          ');--t:' + (14 + r() * 14).toFixed(1) + 's;--dl:-' + (r() * 24).toFixed(1) + 's;--dx:calc(var(--u) * ' + ((r() - 0.5) * 120).toFixed(0) +
          ');--dy:calc(var(--u) * -' + (90 + r() * 200).toFixed(0) + ');--o:' + (0.16 + r() * 0.3).toFixed(2) + '"></i>';
      }
      dust.innerHTML = h;
    }
    s.insertBefore(dust, s.querySelector(".inner"));
  }

  /* ---------- reveal ---------- */
  function resetSlide(s, i) {
    s.classList.add("instant");
    steps[i].forEach(function (st) { st.classList.remove("on"); });
    topAnims(s, true).forEach(unplay);
    void s.offsetWidth;
    s.classList.remove("instant");
  }
  function revealStep(i, j, instant) {
    var st = steps[i][j]; if (!st) return;
    if (instant) st.classList.add("instant");
    st.classList.add("on");
    var as = st.classList.contains("anim") ? [st] : topAnims(st, true);
    as.forEach(function (a) { play(a, instant); });
    if (instant) { void st.offsetWidth; st.classList.remove("instant"); }
  }
  function hideStep(i, j) {
    var st = steps[i][j]; if (!st) return;
    st.classList.remove("on");
    (st.classList.contains("anim") ? [st] : topAnims(st, true)).forEach(unplay);
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function show(i, kk, opt) {
    opt = opt || {};
    i = Math.max(0, Math.min(N - 1, i));
    var max = steps[i].length;
    kk = kk === "max" ? max : Math.max(0, Math.min(max, kk || 0));
    if (flow) { cur = i; k = max; slides[i].scrollIntoView({ behavior: REDUCE ? "auto" : "smooth" }); sync(); return; }
    var instant = !!opt.instant || PREVIEW;
    if (i !== cur) {
      clearTimers();
      var dir = i > cur ? 1 : -1;
      var old = slides[cur];
      if (old) {
        old.style.setProperty("--to", dir > 0 ? "calc(-40 * var(--u))" : "calc(40 * var(--u))");
        old.classList.remove("active");
        old.classList.add("leaving");
        (function (o) { setTimeout(function () { o.classList.remove("leaving"); if (!o.classList.contains("active")) o.classList.remove("idle"); }, 900); })(old);
      }
      var s = slides[i];
      resetSlide(s, i);
      s.style.setProperty("--from", dir > 0 ? "calc(40 * var(--u))" : "calc(-40 * var(--u))");
      if (instant) s.classList.add("instant");
      void s.offsetWidth;
      s.classList.add("active");
      s.classList.remove("idle");
      cur = i;
      if (MICRO) (function (sl) { timers.push(setTimeout(function () { placeDust(sl); sl.classList.add("idle"); }, instant ? 300 : 1700)); })(s);
      for (var j = 0; j < kk; j++) revealStep(i, j, instant || opt.back);
      var free = topAnims(s, false);
      if (instant) { free.forEach(function (a) { play(a, true); }); void s.offsetWidth; s.classList.remove("instant"); }
      else free.forEach(function (a) { timers.push(setTimeout(function () { play(a, false); }, REDUCE ? 0 : 380)); });
    } else if (kk > k) {
      for (var j2 = k; j2 < kk; j2++) revealStep(i, j2, instant);
    } else if (kk < k) {
      for (var j3 = k - 1; j3 >= kk; j3--) hideStep(i, j3);
    }
    k = kk;
    sync();
  }
  function next() {
    if (flow) { show(Math.min(N - 1, cur + 1)); return; }
    if (k < steps[cur].length) show(cur, k + 1); else if (cur < N - 1) show(cur + 1, 0);
  }
  function prev() {
    if (flow) { show(Math.max(0, cur - 1)); return; }
    if (k > 0) show(cur, k - 1); else if (cur > 0) show(cur - 1, "max", { back: true });
  }

  function sync() {
    var s = slides[cur]; if (!s) return;
    var sec = s.dataset.section === "" ? -1 : +s.dataset.section;
    navBtns.forEach(function (b, bi) { b.classList.toggle("on", bi === sec); b.setAttribute("aria-current", bi === sec ? "true" : "false"); });
    stage.classList.toggle("no-nav", s.dataset.nav === "0");
    stage.classList.toggle("no-page", s.dataset.page === "0");
    if (pageno) pageno.textContent = String(cur + 1);
    if (progress) progress.style.width = (N > 1 ? (cur / (N - 1)) * 100 : 100) + "%";
    if (!PREVIEW) {
      var h = "#" + (cur + 1) + (k ? "." + k : "");
      if (location.hash !== h) history.replaceState(null, "", h);
      document.title = (D.title || "") + " · " + (cur + 1) + "/" + N;
    }
    post();
  }
  function parseHash() {
    var m = /^#\/?(\d+)(?:[.\/-](\d+))?/.exec(location.hash || "");
    if (!m) return null;
    return { i: Math.max(0, +m[1] - 1), k: m[2] ? +m[2] : 0 };
  }

  /* ---------- presenter link ---------- */
  function state() {
    return { type: "sermon-state", i: cur, k: k, n: N, steps: steps.map(function (a) { return a.length; }), title: D.title || "" };
  }
  function post() { try { if (presenter && !presenter.closed) presenter.postMessage(state(), "*"); } catch (e) {} }
  function openPresenter() {
    presenter = window.open("presenter.html", "sermon-presenter", "width=1280,height=800");
    setTimeout(post, 600);
  }
  window.addEventListener("message", function (e) {
    var m = e.data || {};
    if (m.type === "sermon-hello") { if (e.source && !presenter) presenter = e.source; post(); }
    else if (m.type === "sermon-cmd") {
      if (m.cmd === "next") next(); else if (m.cmd === "prev") prev();
      else if (m.cmd === "go") show(m.i, m.k === undefined ? 0 : m.k, { back: m.k === "max" });
      else if (m.cmd === "black") toggleBlack();
    } else if (m.type === "sermon-preview" && PREVIEW) {
      show(m.i, m.k === undefined ? "max" : m.k, { instant: true });
    }
  });

  /* ---------- misc controls ---------- */
  function fullscreen() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else if (document.exitFullscreen) document.exitFullscreen();
  }
  function toggleBlack() { if (black) black.classList.toggle("on"); }
  var typed = "";
  document.addEventListener("keydown", function (e) {
    if (PREVIEW || e.ctrlKey || e.metaKey || e.altKey) return;
    var key = e.key;
    if (black && black.classList.contains("on") && key !== "b" && key !== "B" && key !== ".") { black.classList.remove("on"); e.preventDefault(); return; }
    if (/^[0-9]$/.test(key)) { typed += key; return; }
    if (key === "Enter" && typed) { show(+typed - 1, 0); typed = ""; e.preventDefault(); return; }
    typed = "";
    switch (key) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case "Enter": next(); break;
      case " ": e.shiftKey ? prev() : next(); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace": prev(); break;
      case "Home": show(0, 0); break;
      case "End": show(N - 1, "max", { back: true }); break;
      case "f": case "F": fullscreen(); break;
      case "n": case "N": openPresenter(); break;
      case "b": case "B": case ".": toggleBlack(); break;
      case "h": case "H": case "?": if (help) help.classList.toggle("on"); break;
      case "Escape": if (help) help.classList.remove("on"); return;
      default: return;
    }
    e.preventDefault();
  });
  navBtns.forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      if (b.dataset.goto !== "") show(+b.dataset.goto, 0);
    });
  });
  stage.addEventListener("click", function (e) {
    if (flow || PREVIEW || e.button !== 0) return;
    if (e.target.closest("a,button")) return;
    if (window.getSelection && String(window.getSelection())) return;
    next();
  });
  var tx = null, ty = null;
  stage.addEventListener("touchstart", function (e) { if (e.touches.length === 1) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (flow || tx === null) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    tx = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); e.preventDefault(); }
  });
  var hideT;
  document.addEventListener("mousemove", function () {
    body.classList.remove("hide-cursor"); clearTimeout(hideT);
    hideT = setTimeout(function () { if (!flow) body.classList.add("hide-cursor"); }, 2500);
  });
  window.addEventListener("hashchange", function () {
    var h = parseHash(); if (h && (h.i !== cur || h.k !== k)) show(h.i, h.k, { back: true });
  });

  /* ---------- flow mode (portrait phones) ---------- */
  var io = null;
  function wantFlow() { return !PREVIEW && qs.get("mode") !== "stage" && (qs.get("mode") === "flow" || (innerWidth < innerHeight && innerWidth < 900)); }
  function enterFlow() {
    flow = true; body.classList.add("flow");
    slides.forEach(function (s, i) {
      s.classList.remove("leaving");
      steps[i].forEach(function (st) { st.classList.add("on"); });
    });
    if (!("IntersectionObserver" in window)) { slides.forEach(function (s) { s.classList.add("active"); topAnims(s, true).forEach(function (a) { play(a, true); }); }); return; }
    io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        var s = en.target, i = slides.indexOf(s);
        if (en.isIntersecting && !s.classList.contains("active")) {
          s.classList.add("active");
          topAnims(s, true).forEach(function (a) { setTimeout(function () { play(a, false); }, REDUCE ? 0 : 250); });
        }
        if (en.isIntersecting && en.intersectionRatio > 0.5) { cur = i; k = steps[i].length; sync(); }
      });
    }, { threshold: [0.25, 0.55] });
    slides.forEach(function (s) { io.observe(s); });
  }
  function leaveFlow() {
    flow = false; body.classList.remove("flow");
    if (io) { io.disconnect(); io = null; }
    var c = cur; slides.forEach(function (s) { s.classList.remove("active"); }); cur = -1;
    show(Math.max(0, c), 0, { instant: true });
  }
  window.addEventListener("resize", function () {
    var w = wantFlow();
    if (w && !flow) { var c = cur; slides.forEach(function (s) { s.classList.remove("active"); }); enterFlow(); if (c > 0) slides[c].scrollIntoView(); }
    else if (!w && flow) leaveFlow();
  });

  /* ---------- start ---------- */
  var h0 = parseHash();
  if (wantFlow()) {
    enterFlow();
    if (h0 && slides[h0.i]) setTimeout(function () { slides[h0.i].scrollIntoView(); }, 50);
  } else if (h0) {
    show(h0.i, h0.k, { instant: true });
  } else {
    show(0, 0);
  }
  window.SermonDeck = { next: next, prev: prev, go: function (i, kk) { show(i, kk, { back: kk === "max" }); }, state: state,
    finish: function (i) { show(i, "max", { instant: true }); } };
})();
