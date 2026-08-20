/* ==========================================================================
   contact.js — front-end-only contact form for the contact section, wired to
   the shared parallax engine + reveal observer (both in js/main.js). Depth
   layers use the same [data-speed] convention: .contact__word (−0.18) and
   .contact__wash (−0.07) read deep; the grid/form stay on the page plane so
   the form sits still under the cursor while it's filled.

   The form never issues a request — the site has no backend by design.
   Submit is intercepted, validated inline, then composed into a mailto:
   draft addressed to the form's [data-mailto] and handed to the visitor's
   own mail app; they review and send it themselves, from their own account.
   Without JS the form falls back to native validation and the plain mailto:
   link printed above it.
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

  /* ---------- mailto: draft ----------
     Every interpolated value goes through encodeURIComponent, which escapes
     "&", "?" and newlines — so nothing a visitor types can close the body and
     graft on extra mailto headers (a stray "&bcc=" and the like). */
  function draftUrl() {
    var to = form.getAttribute("data-mailto");
    var name = form.querySelector("#c-name").value.trim();
    var subject = form.querySelector("#c-subject").value;
    var message = form.querySelector("#c-message").value.trim();
    var body = message + "\n\n— " + name;

    return "mailto:" + to +
           "?subject=" + encodeURIComponent("Portfolio — " + subject) +
           "&body=" + encodeURIComponent(body);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault(); /* the draft is handed off, never posted */

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

    /* hand the draft to the mail app first, then swap the panel: the browser
       may steal focus while the handler opens, and the "over to you" copy
       should already be behind it when the visitor comes back. */
    window.location.href = draftUrl();

    submitBtn.disabled = true;
    submitLabel.textContent = "Opening…";
    window.setTimeout(function () {
      form.hidden = true;
      success.hidden = false;
      submitBtn.disabled = false;
      submitLabel.textContent = "Open in your mail app";
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
