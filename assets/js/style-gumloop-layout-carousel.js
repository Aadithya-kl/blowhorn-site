/* Gumloop-layout helpers: count-up metrics and the metric-row arrows.
   No dependencies. Numbers keep their final value in the markup, so
   they read correctly with scripts off; under prefers-reduced-motion
   the script does nothing and the final values stay put. */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll("[data-gum-count]").forEach(function (el) {
    if (reduce) return;
    var final = parseInt(el.textContent, 10);
    if (isNaN(final) || final <= 0) return;
    var start = null;
    var duration = 900;
    function tick(now) {
      if (start === null) start = now;
      var p = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(final * p);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  document.querySelectorAll("[data-gum-metrics]").forEach(function (wrap) {
    var row = wrap.querySelector("[data-gum-row]");
    if (!row) return;
    var step = function () {
      var card = row.querySelector(".gum-metric");
      return card ? card.offsetWidth + 24 : 320;
    };
    var scroll = function (dir) {
      row.scrollBy({ left: dir * step(), behavior: reduce ? "auto" : "smooth" });
    };
    var prev = wrap.querySelector("[data-gum-prev]");
    var next = wrap.querySelector("[data-gum-next]");
    if (prev) prev.addEventListener("click", function () { scroll(-1); });
    if (next) next.addEventListener("click", function () { scroll(1); });
  });
})();
