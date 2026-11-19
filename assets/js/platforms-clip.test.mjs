import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// platforms-clip.js is a classic script, so it runs in a fake page: the
// clip figure with its two theme videos, the Pause motion button, and the
// seven highlight rows the server renders (plat-highlight.html, #652).
const source = readFileSync(new URL("./platforms-clip.js", import.meta.url), "utf8");

// Film order, verified from the clip's frames: one 1.5-second segment per
// platform over the 10.5-second loop.
const CLIP_ORDER = ["linkedin", "x", "reddit", "hacker-news", "slack", "bluesky", "github"];

function row(key) {
  const attrs = {};
  return {
    key,
    setAttribute(name, value) { attrs[name] = value; },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return attrs[name] === undefined ? null : attrs[name]; },
  };
}

function video() {
  const listeners = {};
  return {
    controls: true,
    muted: false,
    currentTime: 0,
    paused: true,
    listeners,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    play() { this.paused = false; return undefined; },
    pause() { this.paused = true; },
  };
}

function loadPage({ reduce = false } = {}) {
  const rows = CLIP_ORDER.map(row);
  const videos = [video(), video()];
  const btn = {
    hidden: true,
    textContent: "Pause motion",
    listeners: {},
    setAttribute() {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
  };
  let observerCallback = null;
  const fig = {
    querySelector(sel) { return sel === "[data-plat-clip-pause]" ? btn : null; },
    querySelectorAll(sel) {
      if (sel === "video") return videos;
      if (sel === "[data-plat-index]") return rows;
      return [];
    },
  };
  const document = { querySelector(sel) { return sel === "[data-plat-clip]" ? fig : null; } };
  const context = {
    document,
    matchMedia() { return { matches: reduce }; },
    IntersectionObserver: function (cb) { observerCallback = cb; this.observe = function () {}; },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return {
    rows,
    videos,
    btn,
    context,
    observe(entries) { observerCallback(entries); },
  };
}

// Drive a video into view (so it plays) and to a time, the way the browser
// does: the IntersectionObserver entry, then a timeupdate.
function playAt(page, v, t) {
  page.observe([{ target: v, isIntersecting: true, intersectionRatio: 0.6 }]);
  v.currentTime = t;
  for (const fn of v.listeners.timeupdate || []) fn();
}

function currentRow(page) {
  return page.rows.findIndex((r) => r.getAttribute("aria-current") === "true");
}

test("segmentIndexForTime maps each 1.5-second segment, and the wrap", () => {
  const page = loadPage();
  const seg = page.context.BlowhornPlatformsClip.segmentIndexForTime;
  assert.equal(seg(0), 0);
  assert.equal(seg(1.49), 0);
  assert.equal(seg(1.5), 1);
  assert.equal(seg(2.99), 1);
  assert.equal(seg(3), 2);
  assert.equal(seg(4.5), 3);
  assert.equal(seg(6), 4);
  assert.equal(seg(7.5), 5);
  assert.equal(seg(9), 6);
  assert.equal(seg(9.99), 6);
  assert.equal(seg(10), 0);
  assert.equal(seg(10.5), 0);
  assert.equal(seg(-1), 0);
  assert.equal(seg(NaN), 0);
});

test("the highlight follows the film through the loop", () => {
  const page = loadPage();
  const v = page.videos[0];
  playAt(page, v, 0.2);
  assert.equal(currentRow(page), 0);
  assert.equal(page.rows[0].key, "linkedin");
  playAt(page, v, 1.6);
  assert.equal(currentRow(page), 1);
  playAt(page, v, 4.6);
  assert.equal(currentRow(page), 3);
  assert.equal(page.rows[3].key, "hacker-news");
  playAt(page, v, 9.2);
  assert.equal(currentRow(page), 6);
  assert.equal(page.rows[6].key, "github");
  playAt(page, v, 10.2);
  assert.equal(currentRow(page), 0);
  // Only one row is current at a time.
  assert.equal(page.rows.filter((r) => r.getAttribute("aria-current") === "true").length, 1);
});

test("a paused video does not move the highlight", () => {
  const page = loadPage();
  const v = page.videos[0];
  playAt(page, v, 3.2);
  assert.equal(currentRow(page), 2);
  v.pause();
  v.currentTime = 7.6;
  for (const fn of v.listeners.timeupdate || []) fn();
  assert.equal(currentRow(page), 2);
});

test("under prefers-reduced-motion the script does not sync", () => {
  const page = loadPage({ reduce: true });
  assert.equal(page.context.BlowhornPlatformsClip, undefined);
  assert.equal(page.rows.filter((r) => r.getAttribute("aria-current") === "true").length, 0);
});
