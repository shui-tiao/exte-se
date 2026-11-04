// A1 kenar çubuğu — kaydırırken görünür bölümün simgesini işaretler.
"use strict";

(() => {
  const links = [...document.querySelectorAll(".sidenav__item")];
  const basliklar = links.map((a) => document.querySelector(a.hash)).filter(Boolean);
  const isaretle = (id) => links.forEach((l) => l.classList.toggle("active", l.hash === `#${id}`));
  const gozlemci = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) isaretle(e.target.id);
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  basliklar.forEach((b) => gozlemci.observe(b));
  if (basliklar[0]) isaretle(basliklar[0].id);
})();
