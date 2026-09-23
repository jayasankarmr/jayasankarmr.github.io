/* chrome.js — behaviour for the shared header (public/shared/chrome.css):
   frosted background once the page scrolls, and the live Kerala clock.
   Plain script so the no-build photography page can load it too. */
(function () {
  "use strict";

  var nav = document.querySelector("[data-site-nav]");
  if (nav) {
    var update = function () { nav.classList.toggle("is-scrolled", window.scrollY > 24); };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  var clocks = document.querySelectorAll("[data-site-clock]");
  if (clocks.length) {
    var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
    var tick = function () {
      var t = fmt.format(new Date());
      for (var i = 0; i < clocks.length; i++) clocks[i].textContent = t;
    };
    tick();
    setInterval(tick, 10000);
  }
})();
