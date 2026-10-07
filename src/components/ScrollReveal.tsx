import { useEffect } from "react";

/**
 * Fades `[data-reveal]` elements in as they scroll into view. Set
 * `style={{ "--reveal-index": n }}` on siblings to stagger them.
 *
 * Content is only hidden after this runs (html.reveal-ready), and anything
 * already on screen at that moment is revealed immediately, so nothing
 * flashes and nothing stays hidden if scripts fail.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;

    const reveal = (element: Element) => element.setAttribute("data-revealed", "");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const track = (element: Element) => {
      if (element.hasAttribute("data-revealed")) return;
      observer.observe(element);
    };

    // Reveal what is already visible before hiding anything.
    for (const element of document.querySelectorAll("[data-reveal]")) {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) reveal(element);
      else track(element);
    }
    root.classList.add("reveal-ready");

    // Pages rendered later by client-side navigation.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[data-reveal]")) track(node);
          node.querySelectorAll("[data-reveal]").forEach(track);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}
