/* ==========================================================================
   about.js — wires the bio section to the shared parallax engine and
   reveal-on-scroll observer (both in js/main.js). Depth layers use the same
   [data-speed] convention as the other sections: .about__wash (−0.12) and the
   portrait's .ghost-frame (−0.05 on the page) read deep, .about__portrait
   (+0.06) reads nearest; the body text stays on the page plane for readability.
   ========================================================================== */

(function () {
  "use strict";

  var section = document.getElementById("about");
  if (!section || !window.Portfolio) return;

  Portfolio.parallaxSection(section);
  Portfolio.observeReveals(section);
})();
