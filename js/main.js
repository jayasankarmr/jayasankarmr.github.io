/* ==========================================================================
   main.js — shared site behavior: header scroll state + parallax engine.
   Classic scripts (no ES modules) so the site also works over file:// —
   everything shared hangs off a single `Portfolio` global.
   Load order matters: main.js first, then per-section scripts.
   ========================================================================== */

window.Portfolio = (function () {
  "use strict";

  /* lets CSS distinguish "JS running" (entrance reveals) from no-JS */
  document.documentElement.classList.replace("no-js", "js");

  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mqNarrow = window.matchMedia("(max-width: 767px)");

  /* Parallax runs only when the user allows motion and the viewport is
     desktop-sized; on mobile the sections render as static compositions. */
  function motionAllowed() {
    return !mqReduce.matches && !mqNarrow.matches;
  }

  /* ---------- header scroll state ---------- */
  var header = document.querySelector("[data-header]");

  function updateHeader() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  /* ---------- parallax engine ----------
     Sections register a callback via Portfolio.addParallax(fn); the engine
     batches all callbacks into one requestAnimationFrame per scroll event.
     Callbacks receive scrollY clamped to >= 0 so macOS rubber-band
     overscroll can't drag layers past their bleed. When motion becomes
     disallowed, every callback is called once with 0 to reset transforms. */
  var callbacks = [];
  var ticking = false;

  function runCallbacks() {
    ticking = false;
    var y = Math.max(0, window.scrollY);
    for (var i = 0; i < callbacks.length; i++) callbacks[i](y);
  }

  function requestTick() {
    if (!ticking && motionAllowed()) {
      ticking = true;
      window.requestAnimationFrame(runCallbacks);
    }
  }

  function resetCallbacks() {
    for (var i = 0; i < callbacks.length; i++) callbacks[i](0);
  }

  function onMotionPrefChange() {
    if (motionAllowed()) requestTick();
    else resetCallbacks();
  }

  window.addEventListener("scroll", function () {
    updateHeader();
    requestTick();
  }, { passive: true });

  mqReduce.addEventListener("change", onMotionPrefChange);
  mqNarrow.addEventListener("change", onMotionPrefChange);

  updateHeader();

  return {
    motionAllowed: motionAllowed,

    /* register fn(clampedScrollY) — runs once immediately if motion is on */
    addParallax: function (fn) {
      callbacks.push(fn);
      if (motionAllowed()) fn(Math.max(0, window.scrollY));
    },

    /* ---------- shared layered-parallax engine ----------
       Drives every [data-speed] element inside `section`: each layer drifts by
       (elementCenter − viewportCenter) × speed — positive reads nearer than the
       page plane, negative reads deeper. Geometry is measured up front (offsetTop
       is layout-based and ignores the transforms we apply), so the per-frame
       callback performs no layout reads. When motion is disallowed the engine's
       reset (fn called with 0) clears transforms rather than rendering a literal
       y=0, which would freeze far-down layers mid-drift.

       Returns { remeasure } so callers that change a section's height at runtime
       (e.g. the contact form → success swap) can re-derive the layer geometry.
       This was three identical copies across gallery/about/contact — hoisted
       here during the integration pass. */
    parallaxSection: function (section) {
      var layers = [];

      function docTop(el) {
        var top = 0;
        while (el) {
          top += el.offsetTop;
          el = el.offsetParent;
        }
        return top;
      }

      function measure() {
        var nodes = section.querySelectorAll("[data-speed]");
        layers = [];
        for (var i = 0; i < nodes.length; i++) {
          layers.push({
            el: nodes[i],
            speed: parseFloat(nodes[i].getAttribute("data-speed")) || 0,
            center: docTop(nodes[i]) + nodes[i].offsetHeight / 2
          });
        }
      }

      function apply(y) {
        if (!motionAllowed()) {
          for (var i = 0; i < layers.length; i++) layers[i].el.style.transform = "";
          return;
        }
        var viewCenter = y + window.innerHeight / 2;
        for (var j = 0; j < layers.length; j++) {
          var shift = (layers[j].center - viewCenter) * layers[j].speed;
          layers[j].el.style.transform = "translate3d(0, " + shift.toFixed(2) + "px, 0)";
        }
      }

      function remeasure() {
        measure();
        apply(Math.max(0, window.scrollY));
      }

      measure();
      /* same registration as addParallax (which isn't in local scope here):
         batch into the shared rAF loop + run once now if motion is on */
      callbacks.push(apply);
      if (motionAllowed()) apply(Math.max(0, window.scrollY));

      /* static geometry shifts on resize and once webfonts/images settle */
      var resizeTimer;
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(remeasure, 150);
      });
      window.addEventListener("load", remeasure);

      return { remeasure: remeasure };
    },

    /* reveal-on-scroll: adds .is-inview (once) to every [data-reveal] inside
       root as it enters the viewport. Pairs with the shared reveal styles in
       css/main.css; hidden states are CSS-gated on html.js + motion pref, so
       adding the class is always safe. */
    observeReveals: function (root) {
      var nodes = (root || document).querySelectorAll("[data-reveal]");
      var i;
      if (!("IntersectionObserver" in window)) {
        for (i = 0; i < nodes.length; i++) nodes[i].classList.add("is-inview");
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].isIntersecting) {
            entries[j].target.classList.add("is-inview");
            io.unobserve(entries[j].target);
          }
        }
      }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
      for (i = 0; i < nodes.length; i++) io.observe(nodes[i]);
    }
  };
})();
