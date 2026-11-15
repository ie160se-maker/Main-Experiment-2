/* carousel_instrumented.js — 第2期（外部委託）版
   2026-11-16 変更：閲覧時間の下限を options で指定できるようにした（minSlideMs / minSlide4Ms）。
   既定値は第1期と同じ（各2秒・4枚目5秒）。第2期は app_p2.js から 0 を渡し、
   「5枚すべてに到達すること」だけを「質問へ進む」の条件にする。閲覧時間の記録は第1期と同じ。 */
(function (global) {
  'use strict';
  const DEFAULT_MIN_SLIDE_MS = 2000;
  const DEFAULT_MIN_SLIDE4_MS = 5000;
  const IV_SLIDE_INDEX = 3;
  function init(post, options) {
    options = options || {};
    const onGate = options.onGate || function () {};
    const MIN_SLIDE_MS = (typeof options.minSlideMs === 'number') ? options.minSlideMs : DEFAULT_MIN_SLIDE_MS;
    const MIN_SLIDE4_MS = (typeof options.minSlide4Ms === 'number') ? options.minSlide4Ms : DEFAULT_MIN_SLIDE4_MS;
    const industry = options.industry || '';
    const disclosure = options.disclosure || '';
    const track = post.querySelector('.carousel-track');
    const slides = post.querySelectorAll('.carousel-slide');
    const prevBtn = post.querySelector('.carousel-btn.prev');
    const nextBtn = post.querySelector('.carousel-btn.next');
    const dots = post.querySelectorAll('.dot');
    const counter = post.querySelector('.slide-counter');
    const wrapper = post.querySelector('.carousel-wrapper');
    const total = slides.length;
    const dwell = new Array(total).fill(0);
    const viewed = new Set();
    let current = 0, nNav = 0, captionExpanded = false, gatePassed = false;
    let slide4FirstArrival = null;
    const t0 = performance.now();
    let slideEnter = t0;
    let visible = (document.visibilityState === 'visible');
    function accrue() {
      if (visible) { const now = performance.now(); dwell[current] += now - slideEnter; slideEnter = now; }
    }
    function markViewed(i) {
      viewed.add(i);
      if (i === IV_SLIDE_INDEX && slide4FirstArrival === null) slide4FirstArrival = Math.round(performance.now() - t0);
    }
    function updateUI() {
      track.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
      if (counter) counter.textContent = `${current + 1}/${total}`;
      if (prevBtn) prevBtn.disabled = current === 0;
      if (nextBtn) nextBtn.disabled = current === total - 1;
    }
    function goTo(i) {
      if (i < 0 || i >= total || i === current) return;
      accrue(); current = i; slideEnter = performance.now(); nNav++; markViewed(i); updateUI(); checkGate();
    }
    function checkGate() {
      accrue();
      const allViewed = viewed.size >= total;
      let eachOK = true;
      for (let i = 0; i < total; i++) {
        const need = (i === IV_SLIDE_INDEX) ? MIN_SLIDE4_MS : MIN_SLIDE_MS;
        if (dwell[i] < need) { eachOK = false; break; }
      }
      const pass = allViewed && eachOK;
      if (pass && !gatePassed) { gatePassed = true; onGate(true); }
      return pass;
    }
    const gateTimer = setInterval(function () { if (!gatePassed) checkGate(); }, 500);
    function onPrev() { goTo(current - 1); }
    function onNext() { goTo(current + 1); }
    if (prevBtn) prevBtn.addEventListener('click', onPrev);
    if (nextBtn) nextBtn.addEventListener('click', onNext);
    const dotHandlers = [];
    dots.forEach((dot, i) => { const h = () => goTo(i); dotHandlers.push([dot, h]); dot.addEventListener('click', h); });
    const onKey = (e) => { if (e.key === 'ArrowLeft') goTo(current - 1); if (e.key === 'ArrowRight') goTo(current + 1); };
    document.addEventListener('keydown', onKey);
    const onVis = () => {
      if (document.visibilityState === 'hidden') { accrue(); visible = false; }
      else { visible = true; slideEnter = performance.now(); }
    };
    document.addEventListener('visibilitychange', onVis);
    post.querySelectorAll('.action-icon.like, .action-icon.bookmark').forEach((el) => { el.style.pointerEvents = 'none'; });
    markViewed(0); updateUI(); checkGate();
    function getTimingData() {
      accrue();
      return { industry, disclosure, dwell: dwell.map((x) => Math.round(x)), dwellTotal: Math.round(dwell.reduce((a, b) => a + b, 0)),
        slide4FirstArrival, nNav, captionExpanded, viewedAll: viewed.size >= total, forcedPass: gatePassed };
    }
    function destroy() {
      clearInterval(gateTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      if (prevBtn) prevBtn.removeEventListener('click', onPrev);
      if (nextBtn) nextBtn.removeEventListener('click', onNext);
      dotHandlers.forEach(([dot, h]) => dot.removeEventListener('click', h));
    }
    return { getTimingData, destroy, isGateSatisfied: () => gatePassed };
  }
  global.InstrumentedCarousel = { init: init };
})(window);
