"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SELECTOR = ".on-scroll, .steps";

/**
 * Adds `.in-view` to `.on-scroll` elements when they enter the viewport
 * (one IntersectionObserver for the whole page, no scroll listeners).
 * Content stays visible without JavaScript: the hidden state only applies
 * under `html.js`, which is set by an inline script in the root layout.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    const observe = (root: ParentNode) =>
      root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => !el.classList.contains("in-view") && io.observe(el));

    observe(document);
    // Pages render data asynchronously: watch for newly added sections too.
    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => n instanceof HTMLElement && observe(n.parentNode ?? n));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
