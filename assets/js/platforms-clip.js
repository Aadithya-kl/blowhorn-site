// The platforms clip (layouts/_partials/home/platforms-clip.html, data/
// integrations.json clip). Two copies, one per OS theme; only the visible one
// ever intersects. Once about half of it is in view it plays from the start;
// when it drops below that it pauses, so a visitor never arrives mid-loop.
// Pause motion stops it until pressed again. Under prefers-reduced-motion, or
// without IntersectionObserver, nothing autoplays: the poster and native
// controls stay.
(function () {
  var fig = document.querySelector('[data-plat-clip]');
  if (!fig) return;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce || !('IntersectionObserver' in window)) return;
  var videos = fig.querySelectorAll('video');
  var btn = fig.querySelector('[data-plat-clip-pause]');
  var held = false;
  var inView = [];

  function start(v) {
    v.currentTime = 0;
    var p = v.play();
    if (p && p.catch) p.catch(function () { v.controls = true; });
  }

  Array.prototype.forEach.call(videos, function (v) {
    v.controls = false;
    v.muted = true;
  });
  btn.hidden = false;
  btn.addEventListener('click', function () {
    held = !held;
    btn.setAttribute('aria-pressed', held ? 'true' : 'false');
    btn.textContent = held ? 'Play motion' : 'Pause motion';
    Array.prototype.forEach.call(videos, function (v) {
      if (held) v.pause();
      else if (inView.indexOf(v) !== -1) v.play();
    });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target, i = inView.indexOf(v);
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (i === -1) {
          inView.push(v);
          if (!held) start(v);
        }
      } else if (i !== -1) {
        inView.splice(i, 1);
        v.pause();
      }
    });
  }, { threshold: [0, 0.5] });
  Array.prototype.forEach.call(videos, function (v) { io.observe(v); });

  // The per-platform highlight (home/plat-highlight.html, #652): one row
  // per platform the film features, in film order, one 1.5-second segment
  // each over the 10.5-second loop (verified from the film's frames: the
  // cards run LinkedIn, X, Reddit, Hacker News, Slack, Bluesky, GitHub).
  // The last half second crossfades back to the first platform, so it
  // counts as segment 0. Marks the row the film is on with aria-current;
  // the strip is server-rendered, so it reads alike with JavaScript off
  // or under prefers-reduced-motion (this whole script returns early
  // there). Only the playing video drives it: the hidden theme copy is
  // paused, so its timeupdate never fires.
  var SEGMENT_SECONDS = 1.5;
  var SEGMENT_COUNT = 7;
  var WRAP_AT = 10;
  var rows = fig.querySelectorAll('[data-plat-index]');
  var current = -1;
  function segmentIndexForTime(t) {
    if (!isFinite(t) || t < 0) return 0;
    if (t >= WRAP_AT) return 0;
    var i = Math.floor(t / SEGMENT_SECONDS);
    return i >= SEGMENT_COUNT ? SEGMENT_COUNT - 1 : i;
  }
  function highlight(i) {
    if (i === current) return;
    current = i;
    Array.prototype.forEach.call(rows, function (r, j) {
      if (j === i) r.setAttribute('aria-current', 'true');
      else r.removeAttribute('aria-current');
    });
  }
  Array.prototype.forEach.call(videos, function (v) {
    v.addEventListener('timeupdate', function () {
      if (v.paused) return;
      highlight(segmentIndexForTime(v.currentTime));
    });
  });
  if (typeof globalThis !== 'undefined') {
    globalThis.BlowhornPlatformsClip = { segmentIndexForTime: segmentIndexForTime };
  }
})();
