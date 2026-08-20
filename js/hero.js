/* ==========================================================================
   hero.js — hero parallax: the media layer rises slower than the page while
   the foreground text drifts gently and fades as the hero scrolls away.
   ========================================================================== */

(function () {
  "use strict";

  var hero = document.getElementById("hero");
  if (!hero || !window.Portfolio) return;

  var media = hero.querySelector("[data-hero-media]");
  var content = hero.querySelector("[data-hero-content]");

  /* Layer speeds as a fraction of scroll distance. Translating a layer DOWN
     by k·scrollY makes it rise through the viewport at (1 − k)× page speed,
     so a higher k reads as a deeper layer:
       media   k = 0.40  → rises at 0.60× (far background)
       content k = 0.12  → rises at 0.88× (just behind the page plane) */
  var MEDIA_SPEED = 0.4;
  var CONTENT_SPEED = 0.12;

  Portfolio.addParallax(function (y) {
    var h = hero.offsetHeight || 1;

    /* hero is well offscreen — nothing visible to update */
    if (y > h * 1.5) return;

    /* progress: 0 = hero fully in view, 1 = hero scrolled past */
    var p = Math.min(y / h, 1);

    media.style.transform = "translate3d(0, " + y * MEDIA_SPEED + "px, 0)";
    content.style.transform = "translate3d(0, " + y * CONTENT_SPEED + "px, 0)";
    /* text fades out over the first ~80% of the hero's height */
    content.style.opacity = String(Math.max(0, 1 - p / 0.8));
  });

  /* entrance reveal — hero.css transitions .hero__content children in;
     skipped automatically under prefers-reduced-motion */
  window.requestAnimationFrame(function () {
    hero.classList.add("is-loaded");
  });
})();
