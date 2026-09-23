// Minimal SplitText: wraps words (and optionally chars) in spans for staggered reveals.
// The original string moves to aria-label so screen readers read it once, unbroken.
export function split(el: HTMLElement, mode: "words" | "chars" = "words") {
  if (el.dataset.splitDone) return el.querySelectorAll<HTMLElement>(mode === "chars" ? ".split-char" : ".split-inner");
  const text = el.textContent ?? "";
  el.setAttribute("aria-label", text.replace(/\s+/g, " ").trim());
  const frag = document.createDocumentFragment();
  const walk = (node: Node, into: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        (child.textContent ?? "").split(/(\s+)/).forEach((word) => {
          if (!word) return;
          if (/^\s+$/.test(word)) return into.appendChild(document.createTextNode(" "));
          const w = document.createElement("span");
          w.className = "split-word";
          w.setAttribute("aria-hidden", "true");
          if (mode === "chars") {
            for (const ch of word) {
              const m = document.createElement("span");
              m.className = "split-mask";
              const c = document.createElement("span");
              c.className = "split-char";
              c.textContent = ch;
              m.appendChild(c);
              w.appendChild(m);
            }
          } else {
            const m = document.createElement("span");
            m.className = "split-mask";
            const i = document.createElement("span");
            i.className = "split-inner";
            i.textContent = word;
            m.appendChild(i);
            w.appendChild(m);
          }
          into.appendChild(w);
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // keep inline markup (em, strong, br) while splitting its text
        const clone = (child as Element).cloneNode(false);
        (clone as Element).setAttribute("aria-hidden", "true");
        walk(child, clone);
        into.appendChild(clone);
      }
    });
  };
  walk(el, frag);
  el.replaceChildren(frag);
  el.dataset.splitDone = "1";
  return el.querySelectorAll<HTMLElement>(mode === "chars" ? ".split-char" : ".split-inner");
}
