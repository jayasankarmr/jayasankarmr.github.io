/* ==========================================================================
   gallery.js — layered parallax, reveal-on-scroll and lightbox for the
   showcase. The parallax engine (every [data-speed] element drifting at its
   own depth) and the reveal-on-scroll observer both live in js/main.js and are
   shared across sections; this file wires them up and owns the lightbox.
   ========================================================================== */

(function () {
  "use strict";

  var section = document.getElementById("gallery");
  if (!section || !window.Portfolio) return;

  /* ---------- parallax + reveal (shared helpers in js/main.js) ---------- */
  Portfolio.parallaxSection(section);
  Portfolio.observeReveals(section);

  /* ---------- lightbox ---------- */
  var dialog = document.getElementById("lightbox");
  var triggers = section.querySelectorAll("[data-lightbox]");

  if (dialog && triggers.length) {
    var img = dialog.querySelector(".lightbox__img");
    var countEl = dialog.querySelector("[data-lightbox-count]");
    var titleEl = dialog.querySelector("[data-lightbox-title]");
    var metaEl = dialog.querySelector("[data-lightbox-meta]");
    var slides = [];
    var current = 0;

    var captionText = function (fig, sel) {
      var el = fig ? fig.querySelector(sel) : null;
      return el ? el.textContent : "";
    };

    var pad = function (n) { return (n < 10 ? "0" : "") + n; };

    function render(i) {
      current = i;
      var s = slides[i];
      img.classList.remove("is-ready");
      img.src = s.full;
      img.alt = s.title;
      countEl.textContent = pad(i + 1) + " / " + pad(slides.length);
      titleEl.textContent = s.title;
      metaEl.textContent = s.meta;
    }

    function openAt(i) {
      /* engines without <dialog>: at least show the full image */
      if (typeof dialog.showModal !== "function") {
        window.open(slides[i].full, "_blank", "noopener");
        return;
      }
      render(i);
      dialog.showModal();
      document.documentElement.classList.add("has-lightbox");
    }

    function step(dir) {
      render((current + dir + slides.length) % slides.length);
    }

    /* clear the scroll lock here rather than only in the close event —
       the event is a backstop for native Esc, not the primary path */
    function closeLightbox() {
      document.documentElement.classList.remove("has-lightbox");
      if (dialog.open) dialog.close();
    }

    for (var t = 0; t < triggers.length; t++) {
      (function (idx) {
        var btn = triggers[idx];
        var fig = btn.closest("figure");
        slides.push({
          full: btn.getAttribute("data-full"),
          title: captionText(fig, ".gallery__caption-title"),
          meta: captionText(fig, ".gallery__caption-meta")
        });
        btn.addEventListener("click", function () { openAt(idx); });
      })(t);
    }

    img.addEventListener("load", function () { img.classList.add("is-ready"); });

    dialog.querySelector("[data-lightbox-close]").addEventListener("click", closeLightbox);
    dialog.querySelector("[data-lightbox-prev]").addEventListener("click", function () {
      step(-1);
    });
    dialog.querySelector("[data-lightbox-next]").addEventListener("click", function () {
      step(1);
    });

    /* a click that lands on the dialog element itself is a backdrop click */
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) closeLightbox();
    });

    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Escape") closeLightbox();
    });

    /* native Esc (cancel → close) bypasses closeLightbox, so mop up here */
    dialog.addEventListener("close", function () {
      document.documentElement.classList.remove("has-lightbox");
    });
  }
})();
