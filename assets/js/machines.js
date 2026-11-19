// Home #how, the computers designs (data/machines.json). Animates whichever
// design the rotation in machines-rotation-head.html picked, in the spirit
// of the Reveille army board (assets/js/army.js): recruits fall in with the
// army-enlist pop, packets travel wires to the Major, rings use wave-pulse.
// The panel gets .is-armed (start state) and, once in view, .is-live (play).
// Looping motion pauses out of view (.is-paused). On every design "Enlist a
// computer" stays on the page (#143): each click adds another computer to
// that design's fleet, up to 23, then the panel says the ranks are full and
// the button is aria-disabled. Under prefers-reduced-motion nothing is armed:
// the designs rest in their final, fully drawn state, and the Enlist buttons
// still add, without motion. No JavaScript: the static designs from #139,
// with the Download button in place of Enlist and no dead buttons.
(function () {
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var panel = null;
  document.querySelectorAll('.machines-panel').forEach(function (p) {
    if (!panel && p.offsetParent !== null) panel = p;
  });
  if (!panel) return;
  var id = panel.getAttribute('data-machines-only');
  var onFirst = [], onResume = [], onPause = [];

  function stagger(els, start, step) {
    Array.prototype.forEach.call(els, function (el, i) { el.style.setProperty('--d', (start + i * step) + 'ms'); });
  }
  // Unit sizes: one combined count of computers plus amplifying profiles.
  function unit(v) {
    return v <= 1 ? 'Recruit' : v <= 4 ? 'Fireteam' : v <= 12 ? 'Squad' : v <= 40 ? 'Platoon' : v <= 150 ? 'Company' : v <= 1000 ? 'Battalion' : 'Brigade';
  }
  function pad(v) { return (v < 10 ? '0' : '') + v; }
  // Every panel's "Enlist a computer" adds a computer on the page, up to max
  // (#143); it never navigates. With JavaScript it shows and the Download
  // fallback hides. At the cap full() marks it aria-disabled and clicks stop.
  var max = 23;
  var enlistBtns = panel.querySelectorAll('[data-enlist]');
  panel.querySelectorAll('[data-machines-static]').forEach(function (el) { el.hidden = true; });
  enlistBtns.forEach(function (b) { b.hidden = false; });
  function onEnlist(f) {
    enlistBtns.forEach(function (b) {
      b.addEventListener('click', function () { if (b.getAttribute('aria-disabled') !== 'true') f(); });
    });
  }
  function full() { enlistBtns.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); }); }
  // Replays the army-enlist pop on el (.is-new). Clearing the animation
  // first restarts it even when el already ran army-enlist. No motion: skip.
  function pop(el) {
    if (reduce) return;
    el.classList.remove('is-new');
    el.style.removeProperty('--d');
    el.style.animation = 'none'; void el.offsetWidth; el.style.removeProperty('animation');
    el.classList.add('is-new');
  }
  // The recruit strip (home/machines/recruits.html) on Battalion Map, One
  // Thunder and Call to Arms: each Enlist click shows it and adds one more
  // computer picture, up to max, so the fleet visibly grows. Muster grows
  // its own formation instead.
  var recruits = panel.querySelector('[data-recruits]');
  var recruitRow = recruits && recruits.querySelector('[data-enlisted-computers]');
  var recruitTpl = recruits && recruits.querySelector('[data-recruit-template]');
  function addRecruit() {
    if (!recruitRow || !recruitTpl || recruitRow.children.length >= max) return;
    recruits.hidden = false;
    var img = recruitTpl.cloneNode(true);
    img.removeAttribute('data-recruit-template');
    img.hidden = false;
    recruitRow.appendChild(img);
    pop(img);
  }

  // Muster: the formation falls in, the roll call fills, the count runs up.
  // Enlist (the + tile, + Enlist and "Enlist a computer") adds a recruit to
  // the formation and a row to the roll call.
  function muster() {
    var grid = panel.querySelector('.machines-formation-grid');
    var roll = panel.querySelector('.machines-roll');
    var next = roll.querySelector('.is-next');
    var counts = panel.querySelectorAll('[data-muster="count"]');
    var unitEls = panel.querySelectorAll('[data-muster="unit"]');
    var troops = (grid.getAttribute('data-troops') || '').split(' ').filter(Boolean);
    var say = panel.querySelector('.machines-say');
    var sayText = say && (say.querySelector('.bubble-text') || say);
    var tpl = grid.querySelector('img');
    var major = panel.querySelector('.machines-major');
    var n = grid.querySelectorAll('img').length, made = 0;
    var names = ['Spare laptop', 'Office tower', 'Lab box', 'Kitchen nook', 'Backup rig', 'Travel laptop', 'Garage server', 'Living room box'];
    var quips = [
      'Recruit, fall in. One order, one computer per job.',
      'Another one? Good. Coordinated so the same post isn\'t sent from two computers.',
      'Fall in at the back. Your first order comes from the queue.',
      'Welcome to the unit. You answer to the queue, and the queue answers to the Commander.'
    ];
    panel.querySelectorAll('[data-muster="enlist"]').forEach(function (b) {
      b.hidden = false;
      b.addEventListener('click', enlist);
    });
    onEnlist(enlist);
    stagger(grid.querySelectorAll('img'), 0, 70);
    stagger(roll.querySelectorAll('li'), 150, 140);
    function setCount(v) {
      counts.forEach(function (c) { c.textContent = v; });
      unitEls.forEach(function (u) { u.textContent = unit(v); });
    }
    // The count-up stops for good once a click has set the real count, so
    // an in-flight step never writes a smaller number over it.
    var clicked = false;
    onFirst.push(function () {
      var target = n, t0 = performance.now(), dur = 70 * target;
      (function step(t) {
        if (clicked) return;
        var k = Math.min(1, (t - t0) / dur);
        setCount(Math.max(1, Math.round(target * k)));
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
    function enlist() {
      clicked = true;
      if (n >= max) {
        shout('Twenty-three computers. That\'s a platoon, not a hobby. Carry on.');
        return;
      }
      var was = unit(n);
      n++;
      var img = tpl.cloneNode(true);
      if (troops.length) img.src = troops[(n - 1) % troops.length];
      img.style.removeProperty('--d');
      if (!reduce) img.classList.add('is-new');
      grid.insertBefore(img, grid.querySelector('.machines-add:not([hidden])') || null);
      var rows = roll.querySelectorAll('li:not(.is-next)');
      var li = rows[0].cloneNode(true);
      li.style.removeProperty('--d');
      if (!reduce) li.classList.add('is-new');
      li.querySelector('.machines-roll-n').textContent = (n < 10 ? '0' : '') + n;
      li.querySelector('.machines-roll-name').textContent = names[made % names.length];
      roll.insertBefore(li, next);
      if (rows.length >= 4) roll.removeChild(rows[0]);
      next.querySelector('.machines-roll-n').textContent = (n + 1 < 10 ? '0' : '') + (n + 1);
      setCount(n);
      shout(unit(n) !== was ? n + ' computers. That\'s a ' + unit(n).toLowerCase() + ' now. Fall in.' : quips[made % quips.length]);
      made++;
      if (n >= max) full();
    }
    function shout(line) {
      if (!say) return;
      sayText.textContent = line;
      say.classList.add('is-on');
      if (reduce) return;
      say.classList.remove('is-shout'); void say.offsetWidth; say.classList.add('is-shout');
      if (major) { major.classList.remove('is-bark'); void major.offsetWidth; major.classList.add('is-bark'); }
    }
  }

  // Battalion Map: units ping in, packets run the dashed lines to HQ, and
  // the reports feed ticks: a new report on top, the oldest drops off.
  // Enlist turns "+ New unit" into a computer (first click), then raises the
  // count in the card head, reports the newcomer in the feed and adds a
  // computer to the recruit strip.
  function battalion() {
    var stage = panel.querySelector('.machines-map-stage');
    stagger(stage.querySelectorAll('.machines-node'), 0, 160);
    stagger(stage.querySelectorAll('.machines-packets i'), 1100, 650);
    var feed = panel.querySelector('[data-battalion="feed"]');
    stagger(feed.querySelectorAll('li'), 300, 220);
    var units = [['Desk rig', 'Posted to Bluesky'], ['Laptop', 'Reporting for duty'], ['Ana\'s laptop', 'Quoted on LinkedIn', 1], ['Studio box', 'Commented on Reddit'], ['Night-shift server', 'Posted to X'], ['Desk rig', 'Standing by'], ['Laptop', 'Shared to Slack'], ['Studio box', 'Queued for 16:00']];
    var tick = 0, minute = 4, timer = null;
    var head = panel.querySelector('[data-battalion="count"]');
    var slot = stage.querySelector('.machines-node.is-add');
    var chick = stage.querySelector('.machines-node:not(.is-mate):not(.is-add) img');
    var n = stage.querySelectorAll('.machines-node:not(.is-add)').length;
    function post(name, text, mate) {
      var m = minute++;
      var hh = '09:' + (m < 10 ? '0' : '') + (m % 60);
      var li = document.createElement('li');
      if (mate) li.className = 'is-mate';
      li.innerHTML = '<time></time><span><b></b></span>';
      li.querySelector('time').textContent = hh;
      li.querySelector('time').setAttribute('datetime', hh);
      li.querySelector('b').textContent = name;
      li.querySelector('span').appendChild(document.createTextNode(text));
      if (!reduce) li.classList.add('is-new');
      feed.insertBefore(li, feed.firstChild);
      var all = feed.querySelectorAll('li');
      if (all.length > 5) feed.removeChild(all[all.length - 1]);
    }
    function report() {
      var u = units[tick++ % units.length];
      post(u[0], u[1], u[2]);
    }
    onEnlist(function () {
      if (n >= max) return;
      n++;
      if (slot && chick) {
        slot.classList.remove('is-add');
        slot.innerHTML = '<span class="machines-unit-label"><span class="machines-dot" aria-hidden="true"></span></span>';
        slot.insertBefore(chick.cloneNode(true), slot.firstChild);
        slot.querySelector('.machines-unit-label').appendChild(document.createTextNode(pad(n) + ' New computer'));
        pop(slot);
        slot = null;
      }
      if (head) head.textContent = 'A ' + unit(n).toLowerCase() + ' of ' + n + (n >= max ? ', all live. Ranks full.' : ', all live');
      post('New computer ' + pad(n), 'Reporting for duty');
      addRecruit();
      if (n >= max) full();
    });
    onResume.push(function () { if (!timer) timer = setInterval(report, 2600); });
    onPause.push(function () { clearInterval(timer); timer = null; });
  }

  // One Thunder: curved voice lines from every teammate and computer into the
  // Major (drawn from the layout, like army.js wire()), packets flowing along
  // them, rings out of the bullhorn, and each platform tile lighting in turn.
  function thunder() {
    var card = panel.querySelector('.machines-thunder');
    var wires = card.querySelector('.machines-voice-wires');
    var major = card.querySelector('.machines-thunder-major > img');
    var voices = card.querySelectorAll('.machines-voice > img');
    stagger(card.querySelectorAll('.machines-thunder-plats li'), 0, 120);
    stagger(card.querySelectorAll('.machines-voice-plat'), 0, 120);
    function center(el, side) {
      var b = card.getBoundingClientRect(), r = el.getBoundingClientRect();
      return [r.left - b.left + r.width * side, r.top - b.top + r.height / 2];
    }
    var people = card.querySelector('.machines-thunder-people');
    function draw() {
      // Every line leaves the edge of the voices block nearest the Major (its
      // right edge side by side, its bottom edge when stacked), level with
      // its voice, so no line runs behind another soldier.
      var b = card.getBoundingClientRect(), pb = people.getBoundingClientRect();
      wires.setAttribute('viewBox', '0 0 ' + b.width + ' ' + b.height);
      var m = center(major, 0.3), stacked = window.innerWidth < 900, h = '';
      voices.forEach(function (v, i) {
        var c = center(v, 0.5), off = (i % 2 ? 5 : -5), a, d;
        if (stacked) {
          a = [c[0], pb.bottom - b.top];
          d = 'M' + a[0] + ',' + a[1] + ' C' + a[0] + ',' + (a[1] + m[1]) / 2 + ' ' + m[0] + ',' + (a[1] + m[1]) / 2 + ' ' + m[0] + ',' + m[1];
        } else {
          a = [pb.right - b.left + 8, c[1] + off];
          d = 'M' + a[0] + ',' + a[1] + ' C' + (a[0] + m[0]) / 2 + ',' + a[1] + ' ' + (a[0] + m[0]) / 2 + ',' + m[1] + ' ' + m[0] + ',' + m[1];
        }
        h += '<path class="machines-voice-wire' + (v.parentNode.classList.contains('is-mate') ? ' is-mate' : '') + '" d="' + d + '" style="--d:' + (i * 180) + 'ms"/>';
        // Two packets share each line: the voice reporting in, then the
        // Major's signal running back out (the same path, reversed in CSS).
        h += '<circle class="machines-voice-packet' + (v.parentNode.classList.contains('is-mate') ? ' is-mate' : '') + '" r="4" style="offset-path:path(\'' + d + '\');--d:' + (i * 120) + 'ms"/>';
        h += '<circle class="machines-voice-signal" r="5" style="offset-path:path(\'' + d + '\');--d:' + (i * 60) + 'ms"/>';
      });
      wires.innerHTML = h;
    }
    draw();
    // The Major's picture loads lazily, so watch it as well as the card:
    // drawn before it loads, every line would end at the middle of the panel.
    if ('ResizeObserver' in window) { var ro = new ResizeObserver(draw); ro.observe(card); ro.observe(major); } else { window.addEventListener('resize', draw); major.addEventListener('load', draw); }
    // Enlist raises the computers chip and adds a computer to the recruit
    // strip; the voices and their wires stay as drawn.
    var chip = card.querySelector('[data-thunder="computers"]');
    var chipText = card.querySelector('[data-thunder="count"]');
    var n = parseInt(chipText.textContent, 10) || 4;
    onEnlist(function () {
      if (n >= max) return;
      n++;
      chipText.textContent = n + ' computers' + (n >= max ? ', ranks full' : '');
      pop(chip);
      addRecruit();
      if (n >= max) full();
    });
  }

  // Call to Arms: the four beats play once on the timeline; Replay replays.
  // Enlist raises beat 01's count, replays its recruit's pop and adds a
  // computer to the recruit strip.
  function arms() {
    var count = panel.querySelector('[data-arms="count"]');
    var pic = panel.querySelector('.machines-beat img');
    var n = 1;
    onEnlist(function () {
      if (n >= max) return;
      n++;
      count.textContent = 'Computer ' + n + ' enlisted' + (n >= max ? ', ranks full' : '');
      pop(pic);
      addRecruit();
      if (n >= max) full();
    });
    var btn = panel.querySelector('[data-arms="replay"]');
    if (reduce || !btn) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      panel.classList.remove('is-live'); void panel.offsetWidth; panel.classList.add('is-live');
    });
  }

  ({ 'muster': muster, 'battalion-map': battalion, 'one-thunder': thunder, 'call-to-arms': arms }[id] || function () {})();
  if (reduce) return;
  panel.classList.add('is-armed');
  function run(fs) { fs.forEach(function (f) { f(); }); }
  function live() {
    if (!panel.classList.contains('is-live')) { panel.classList.add('is-live'); run(onFirst); }
    panel.classList.remove('is-paused');
    run(onResume);
  }
  function pause() { panel.classList.add('is-paused'); run(onPause); }
  if (!('IntersectionObserver' in window)) { live(); return; }
  // Play once a good part of the panel is on screen (a quarter of it, or
  // 40% of the viewport for panels taller than the screen, as on phones);
  // pause only when it has left the screen entirely.
  new IntersectionObserver(function (es) {
    var e = es[0];
    if (!e.isIntersecting) { if (panel.classList.contains('is-live')) pause(); return; }
    if (e.intersectionRatio >= 0.25 || e.intersectionRect.height >= window.innerHeight * 0.4) live();
  }, { threshold: [0, 0.1, 0.25, 0.5, 0.75] }).observe(panel);
})();
