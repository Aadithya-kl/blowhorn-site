/* The /demo/ simulation, Major-led. Client-side only: the queue lives in
   this page, nothing is posted, and nothing leaves the browser. The General
   briefs the launch, reacts when the visitor picks a formation or loads the
   queue, and calls each post out as it goes. The tabs component
   (assets/js/tabs.js, bundled with this file) owns the formation picker;
   this file watches which tab it selects. */
(function () {
  "use strict";

  var SENDERS = {
    "muster": ["Desk rig", "Laptop", "Studio box"],
    "battalion-map": ["Desk rig (HQ)", "Laptop (Unit 02)", "Studio box (Unit 03)"],
    "one-thunder": ["You", "Designer", "Engineer"],
    "call-to-arms": ["Enlist", "Muster", "Rally", "Thunder"]
  };
  var FORMATION_LINES = {
    "muster": "Every recruit in line. Each post goes out from the next in the roll call.",
    "battalion-map": "Squad on the map, every unit reporting in turn.",
    "one-thunder": "Many voices, one thunder. The crew speaks as one.",
    "call-to-arms": "One recruit to a full squad. Four beats: Enlist, Muster, Rally, Thunder."
  };
  var LAUNCH_WAITING = "No rounds yet. Load the queue, then I sound the call.";
  var LAUNCH_READY = "Queue is loaded. Say the word and I sound the call.";
  var LAUNCH_START = "Sounding the call. Stand by.";
  var LAUNCH_EMPTY = "No rounds in the queue, recruit. Load a post first.";
  var LAUNCH_DONE = "All posts out. That is how you launch. Dismissed.";
  var QUEUE_EMPTY = "Queue is empty, recruit. Load a round.";
  var QUEUE_PULLED = "Round pulled. The queue adjusts.";
  var SLOT_MINUTES = 90;
  var STEP_MS = 1100;
  var MIN_SLOTS = 3;

  var tabsRoot = document.querySelector('[data-tabs-id="demo-machine"]');
  var board = document.querySelector("[data-demo-board]");
  var emptyNote = document.querySelector("[data-demo-empty]");
  var runButton = document.querySelector("[data-demo-run]");
  var resetButton = document.querySelector("[data-demo-reset]");
  var summary = document.querySelector("[data-demo-summary]");
  var form = document.querySelector("[data-demo-form]");
  var pickName = document.querySelector("[data-demo-pick-name]");
  var pickLine = document.querySelector("[data-demo-pick-line]");
  var pickBubble = document.getElementById("demo-major-pick");
  var queueBubble = document.getElementById("demo-major-queue");
  var launchBubble = document.getElementById("demo-major-launch");
  if (!tabsRoot || !board || !runButton || !resetButton) return;

  var queue = [];
  var timers = [];
  var running = false;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function setMajor(bubble, text) {
    if (!bubble) return;
    var span = bubble.querySelector(".bubble-text");
    if (span) span.textContent = text;
    else bubble.textContent = text;
  }

  function selectedFormation() {
    var on = tabsRoot.querySelector("[data-tab].is-on");
    if (on) return on.getAttribute("data-tab");
    var first = tabsRoot.querySelector("[data-tab]");
    return first ? first.getAttribute("data-tab") : "muster";
  }

  function formationName(id) {
    var pane = document.getElementById("demo-machine-" + id);
    if (!pane) return id;
    var h = pane.querySelector("h3");
    return h ? h.textContent : id;
  }

  function formationHeadline(id) {
    var pane = document.getElementById("demo-machine-" + id);
    if (!pane) return "";
    var p = pane.querySelector("p");
    return p ? p.textContent : "";
  }

  function senders() {
    return SENDERS[selectedFormation()] || SENDERS.muster;
  }

  function slotTime(index) {
    var start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    var at = new Date(start.getTime() + index * SLOT_MINUTES * 60000);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short", hour: "numeric", minute: "2-digit"
    }).format(at);
  }

  function keyOf(platform, text) {
    return platform + "\n" + text;
  }

  function queueLine(n) {
    if (n === 0) return QUEUE_EMPTY;
    if (n === 1) return "First round in the chamber. Good. Load more or sound the call.";
    if (n === 2) return "Second round loaded. The queue is forming up.";
    if (n === 3) return "Third round loaded. That is a launch worth sounding.";
    return "Round " + n + " loaded. The queue holds " + n + ".";
  }

  function launchLine(index) {
    if (index === 0) return "First post away. Clean launch.";
    if (index === 1) return "Second front reporting. Keep it moving.";
    if (index === 2) return "Third post out. The line holds.";
    return "Post " + (index + 1) + " away. Still clean.";
  }

  function sampleButton(key) {
    var buttons = document.querySelectorAll("[data-demo-add]");
    for (var i = 0; i < buttons.length; i++) {
      if (keyOf(buttons[i].getAttribute("data-demo-platform"), buttons[i].getAttribute("data-demo-text")) === key) {
        return buttons[i];
      }
    }
    return null;
  }

  function renderBoard() {
    board.innerHTML = "";
    var rows = Math.max(queue.length, MIN_SLOTS);
    var from = senders();
    for (var i = 0; i < rows; i++) {
      var li = document.createElement("li");
      var time = document.createElement("b");
      time.textContent = slotTime(i);
      li.appendChild(time);
      li.appendChild(document.createTextNode(" · "));
      if (i < queue.length) {
        var item = queue[i];
        li.appendChild(document.createTextNode(item.platform + " · " + item.text + " · "));
        var sender = document.createElement("span");
        sender.className = "muted";
        sender.textContent = "from " + from[i % from.length];
        li.appendChild(sender);
        li.appendChild(document.createTextNode(" · "));
        var status = document.createElement("b");
        status.textContent = "Queued";
        status.setAttribute("data-demo-status", String(i));
        li.appendChild(status);
        li.appendChild(document.createTextNode(" "));
        var remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("data-demo-remove", keyOf(item.platform, item.text));
        li.appendChild(remove);
      } else {
        li.appendChild(document.createTextNode("Empty slot"));
      }
      board.appendChild(li);
    }
    if (emptyNote) emptyNote.hidden = queue.length > 0;
  }

  function setStatus(index, text) {
    var cell = board.querySelector('[data-demo-status="' + index + '"]');
    if (cell) cell.textContent = text;
  }

  function setAddingDisabled(disabled) {
    document.querySelectorAll("[data-demo-add]").forEach(function (button) {
      if (queue.some(function (q) {
        return keyOf(q.platform, q.text) === keyOf(button.getAttribute("data-demo-platform"), button.getAttribute("data-demo-text"));
      })) return;
      button.disabled = disabled;
    });
    if (form) {
      var controls = form.querySelectorAll("textarea, select, button");
      controls.forEach(function (control) { control.disabled = disabled; });
    }
  }

  function addToQueue(platform, text) {
    if (running) return;
    var item = { platform: platform, text: text };
    var key = keyOf(platform, text);
    if (queue.some(function (q) { return keyOf(q.platform, q.text) === key; })) return;
    queue.push(item);
    var button = sampleButton(key);
    if (button) {
      button.disabled = true;
      button.textContent = "Added to queue";
    }
    setMajor(queueBubble, queueLine(queue.length));
    setMajor(launchBubble, LAUNCH_READY);
    renderBoard();
  }

  function removeFromQueue(key) {
    if (running) return;
    queue = queue.filter(function (q) { return keyOf(q.platform, q.text) !== key; });
    var button = sampleButton(key);
    if (button) {
      button.disabled = false;
      button.textContent = "Add to queue";
    }
    setMajor(queueBubble, queue.length ? QUEUE_PULLED : QUEUE_EMPTY);
    setMajor(launchBubble, queue.length ? LAUNCH_READY : LAUNCH_WAITING);
    renderBoard();
  }

  function clearTimers() {
    timers.forEach(function (t) { window.clearTimeout(t); });
    timers = [];
  }

  function runSimulation() {
    if (running) return;
    if (!queue.length) {
      setMajor(launchBubble, LAUNCH_EMPTY);
      if (summary) summary.textContent = "Add at least one post to your queue first.";
      return;
    }
    running = true;
    runButton.disabled = true;
    setAddingDisabled(true);
    setMajor(launchBubble, LAUNCH_START);
    if (summary) summary.textContent = "";
    var step = reducedMotion() ? 200 : STEP_MS;
    var rows = queue.length;
    for (var i = 0; i < rows; i++) {
      (function (index) {
        timers.push(window.setTimeout(function () {
          setStatus(index, "Posting…");
        }, index * step));
        timers.push(window.setTimeout(function () {
          setStatus(index, "Posted ✓");
          setMajor(launchBubble, launchLine(index));
        }, index * step + Math.floor(step / 2)));
      })(i);
    }
    timers.push(window.setTimeout(function () {
      running = false;
      runButton.disabled = false;
      setAddingDisabled(false);
      setMajor(launchBubble, LAUNCH_DONE);
      var platforms = {};
      queue.forEach(function (q) { platforms[q.platform] = true; });
      var nPlatforms = Object.keys(platforms).length;
      if (summary) {
        summary.textContent = "Posted " + queue.length + (queue.length === 1 ? " post" : " posts") +
          " across " + nPlatforms + (nPlatforms === 1 ? " platform" : " platforms") +
          " as " + formationName(selectedFormation()) +
          ". This was a simulation: nothing was sent, and nothing left your browser.";
      }
    }, rows * step));
  }

  function resetDemo() {
    clearTimers();
    running = false;
    runButton.disabled = false;
    queue = [];
    document.querySelectorAll("[data-demo-add]").forEach(function (button) {
      button.disabled = false;
      button.textContent = "Add to queue";
    });
    if (form) {
      form.reset();
      var controls = form.querySelectorAll("textarea, select, button");
      controls.forEach(function (control) { control.disabled = false; });
    }
    if (summary) summary.textContent = "";
    setMajor(queueBubble, QUEUE_EMPTY);
    setMajor(launchBubble, LAUNCH_WAITING);
    syncFormation();
    renderBoard();
  }

  function syncFormation() {
    var id = selectedFormation();
    if (pickName) pickName.textContent = formationName(id);
    if (pickLine) pickLine.textContent = formationHeadline(id);
    setMajor(pickBubble, FORMATION_LINES[id] || FORMATION_LINES.muster);
    if (queue.length && !running) renderBoard();
  }

  document.querySelectorAll("[data-demo-add]").forEach(function (button) {
    button.addEventListener("click", function () {
      addToQueue(button.getAttribute("data-demo-platform"), button.getAttribute("data-demo-text"));
    });
  });

  board.addEventListener("click", function (event) {
    var key = event.target && event.target.getAttribute ? event.target.getAttribute("data-demo-remove") : null;
    if (key) removeFromQueue(key);
  });

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = document.getElementById("demo-custom-text");
      var platform = document.getElementById("demo-custom-platform");
      if (!text || !platform) return;
      var value = text.value.trim();
      if (!value) {
        if (summary) summary.textContent = "Write the post first, then add it to the queue.";
        return;
      }
      addToQueue(platform.value, value);
      text.value = "";
      text.focus();
    });
  }

  runButton.addEventListener("click", runSimulation);
  resetButton.addEventListener("click", resetDemo);

  if (window.MutationObserver) {
    var observer = new MutationObserver(function () { syncFormation(); });
    observer.observe(tabsRoot, { attributes: true, subtree: true, attributeFilter: ["class", "aria-selected"] });
  }
  tabsRoot.addEventListener("click", function () {
    window.setTimeout(syncFormation, 0);
  });

  syncFormation();
  renderBoard();
})();
