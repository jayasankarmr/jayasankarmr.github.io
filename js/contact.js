/* ==========================================================================
   contact.js — front-end-only contact form for the contact section, wired to
   the shared parallax engine + reveal observer (both in js/main.js). Depth
   layers use the same [data-speed] convention: .contact__word (−0.18) and
   .contact__wash (−0.07) read deep; the grid/form stay on the page plane so
   the form sits still under the cursor while it's filled.

   The form never issues a request — the site has no backend by design.
   Submit is intercepted, validated inline, and answered with a local
   success state. Without JS the form falls back to native validation.
   ========================================================================== */

(function () {
  "use strict";

  var section = document.getElementById("contact");
  if (!section || !window.Portfolio) return;

  /* ---------- parallax + reveal (shared helpers in js/main.js) ----------
     Keep the handle: the form → success swap changes the section height, so
     the %-positioned depth layers must be re-measured after it. */
  var parallax = Portfolio.parallaxSection(section);
  Portfolio.observeReveals(section);

  /* ---------- contact form (front-end only) ---------- */
  var form = section.querySelector("[data-contact-form]");
  var success = section.querySelector("[data-contact-success]");
  if (!form || !success) return;

  /* JS validation takes over; native validation remains the no-JS fallback */
  form.noValidate = true;

  var controls = form.querySelectorAll("input, select, textarea");
  var submitBtn = form.querySelector("[data-submit]");
  var submitLabel = form.querySelector("[data-submit-label]");
  var successTitle = success.querySelector("[data-success-title]");
  var againBtn = success.querySelector("[data-contact-again]");
  var i;

  function errorEl(control) {
    return document.getElementById(control.id + "-error");
  }

  /* copy lives on the controls (data-err-*) so markup owns the words */
  function messageFor(control) {
    if (control.validity.typeMismatch && control.getAttribute("data-err-type")) {
      return control.getAttribute("data-err-type");
    }
    return control.getAttribute("data-err-required");
  }

  function setError(control) {
    var err = errorEl(control);
    control.closest(".contact__field").classList.add("has-error");
    control.setAttribute("aria-invalid", "true");
    if (err) {
      err.textContent = messageFor(control);
      err.hidden = false;
    }
  }

  function clearError(control) {
    var err = errorEl(control);
    control.closest(".contact__field").classList.remove("has-error");
    control.removeAttribute("aria-invalid");
    if (err) {
      err.textContent = "";
      err.hidden = true;
    }
  }

  function clearOwnError() { clearError(this); }

  for (i = 0; i < controls.length; i++) {
    controls[i].addEventListener("input", clearOwnError);
    controls[i].addEventListener("change", clearOwnError);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault(); /* front-end only — nothing leaves the page */

    var firstInvalid = null;
    for (var k = 0; k < controls.length; k++) {
      if (controls[k].checkValidity()) {
        clearError(controls[k]);
      } else {
        setError(controls[k]);
        if (!firstInvalid) firstInvalid = controls[k];
      }
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    /* a brief "sending" beat so the swap reads as intentional, not a glitch */
    submitBtn.disabled = true;
    submitLabel.textContent = "Sending…";
    window.setTimeout(function () {
      form.hidden = true;
      success.hidden = false;
      submitBtn.disabled = false;
      submitLabel.textContent = "Send message";
      successTitle.focus();
      parallax.remeasure(); /* panel swap changes section height — %-positioned layers move */
    }, 700);
  });

  againBtn.addEventListener("click", function () {
    form.reset();
    success.hidden = true;
    form.hidden = false;
    form.querySelector("input").focus();
    parallax.remeasure();
  });
})();
