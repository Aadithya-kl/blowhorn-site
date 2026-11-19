#!/usr/bin/env node
/* Run assets/js/machines.js against a tiny fake DOM built from the real
   layouts/_partials/home/machines/*.html partials (Hugo actions stripped,
   `seq N` ranges and the recruits.html partial expanded), click "Enlist a
   computer" and report what each click did. Used by test_machines_enlist.py,
   so the test checks what the script does, not what its source says.

   Usage: node machines_harness.js SCRIPT PARTIALS_DIR '<json scenario>'
   Scenario: { "variant": "muster" | "battalion-map" | "one-thunder" |
               "call-to-arms", "reduce": bool, "clicks": n }
   All four panels are on the page; only `variant` is visible. The first
   click lands while Muster's count-up is still running; the queued
   animation frames run right after it.
   Prints: { "button": {...}, "steps": [{ "recruits", "strip", "count",
   "disabled", "isNew" }], "location", "others", "strip": {...} } */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source", "line", "path", "circle"]);

class Text {
  constructor(data) { this.nodeType = 3; this.data = data; this.parentNode = null; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  cloneNode() { return new Text(this.data); }
}

class ClassList {
  constructor(el) { this.el = el; }
  get list() { return (this.el.attrs.class || "").split(/\s+/).filter(Boolean); }
  write(l) { this.el.attrs.class = l.join(" "); }
  add(c) { const l = this.list; if (!l.includes(c)) { l.push(c); this.write(l); } }
  remove(c) { this.write(this.list.filter((x) => x !== c)); }
  contains(c) { return this.list.includes(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.contains(c) : !!force;
    if (on) this.add(c); else this.remove(c);
    return on;
  }
}

// Compound selectors (tag, .class, [attr], [attr="v"], :not(...)) joined by
// descendant or child combinators: what machines.js uses.
function parseCompound(s) {
  const parts = [];
  const re = /([a-z][a-z0-9]*)|\.([a-zA-Z0-9_-]+)|\[([a-z-]+)(?:="([^"]*)")?\]|:not\(([^)]*)\)/gy;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1]) parts.push({ tag: m[1] });
    else if (m[2]) parts.push({ cls: m[2] });
    else if (m[3]) parts.push({ attr: m[3], value: m[4] });
    else parts.push({ not: parseCompound(m[5]) });
  }
  if (re.lastIndex !== s.length) throw new Error("harness: unsupported selector " + s);
  return parts;
}
function parseSelector(sel) {
  const steps = [];
  let comb = " ";
  sel.trim().split(/\s+/).forEach((tok) => {
    if (tok === ">") { comb = ">"; return; }
    steps.push({ comb, parts: parseCompound(tok) });
    comb = " ";
  });
  return steps;
}
function matchCompound(el, parts) {
  return el.nodeType === 1 && parts.every((p) => {
    if (p.tag) return el.tagName === p.tag;
    if (p.cls) return el.classList.contains(p.cls);
    if (p.not) return !matchCompound(el, p.not);
    if (!el.hasAttribute(p.attr)) return false;
    return p.value === undefined || el.attrs[p.attr] === p.value;
  });
}
function matchSteps(el, steps, i) {
  if (!matchCompound(el, steps[i].parts)) return false;
  if (i === 0) return true;
  if (steps[i].comb === ">") return !!el.parentNode && matchSteps(el.parentNode, steps, i - 1);
  for (let a = el.parentNode; a; a = a.parentNode) if (matchSteps(a, steps, i - 1)) return true;
  return false;
}

function parseHTML(html) {
  const root = [];
  const stack = [{ childNodes: root }];
  // Top-level nodes get no parent; whoever adopts them sets it.
  const add = (top, n) => { top.childNodes.push(n); if (top instanceof El) n.parentNode = top; };
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) { stack.pop(); continue; }
    if (m[5] !== undefined) { if (m[5].trim()) add(top, new Text(m[5])); continue; }
    if (!m[2]) continue;
    const attrs = {};
    (m[3] || "").replace(/([^\s=/>]+)(?:="([^"]*)")?/g, (_, k, v) => { attrs[k] = v === undefined ? "" : v; });
    const el = new El(m[2].toLowerCase(), attrs);
    add(top, el);
    if (!m[4] && !VOID.has(el.tagName)) stack.push(el);
  }
  return root;
}

class El {
  constructor(tag, attrs) {
    this.nodeType = 1;
    this.tagName = tag;
    this.attrs = Object.assign({}, attrs || {});
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this.classList = new ClassList(this);
    this.offscreen = false;
    const props = {};
    this.style = {
      setProperty: (k, v) => { props[k] = v; },
      removeProperty: (k) => { delete props[k]; delete this.style[k]; },
    };
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get hidden() { return this.hasAttribute("hidden"); }
  set hidden(v) { if (v) this.attrs.hidden = ""; else delete this.attrs.hidden; }
  get offsetWidth() { return 0; }
  get offsetParent() {
    for (let a = this; a && a.nodeType === 1; a = a.parentNode) if (a.hidden || a.offscreen) return null;
    return {};
  }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(""); }
  set textContent(v) { this.childNodes.forEach((n) => { n.parentNode = null; }); this.childNodes = []; this.appendChild(new Text(String(v))); }
  set innerHTML(html) { this.childNodes = []; parseHTML(html).forEach((n) => this.appendChild(n)); }
  getAttribute(n) { return this.hasAttribute(n) ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) { this.childNodes = this.childNodes.filter((n) => n !== c); c.parentNode = null; return c; }
  cloneNode(deep) {
    const el = new El(this.tagName, this.attrs);
    if (deep) this.childNodes.forEach((n) => el.appendChild(n.cloneNode(true)));
    return el;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  dispatch(t) {
    const ev = { type: t, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    (this.listeners[t] || []).forEach((fn) => fn(ev));
    return ev;
  }
  matches(sel) { const s = parseSelector(sel); return matchSteps(this, s, s.length - 1); }
  descendants() {
    const out = [];
    const walk = (el) => el.children.forEach((c) => { out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelectorAll(sel) {
    const s = parseSelector(sel);
    return this.descendants().filter((el) => matchSteps(el, s, s.length - 1));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

// A partial with its Hugo actions stripped: comments dropped, `seq N`
// ranges repeated, the recruits partial inlined, every other action empty.
function render(dir, name) {
  let src = fs.readFileSync(path.join(dir, name), "utf8");
  src = src.replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
  src = src.replace(/\{\{-?\s*partial "home\/machines\/(recruits\.html)" \. \}\}/g, (_, f) => render(dir, f));
  src = src.replace(/\{\{-?\s*range \$i, \$_ := seq (\d+) -?\}\}([\s\S]*?)\{\{-?\s*end\s*-?\}\}/g, (_, n, body) => body.repeat(+n));
  return src.replace(/\{\{[\s\S]*?\}\}/g, "");
}

const PARTIALS = { "muster": "muster.html", "battalion-map": "battalion-map.html", "one-thunder": "one-thunder.html", "call-to-arms": "call-to-arms.html" };

function main() {
  const [script, dir, raw] = process.argv.slice(2);
  const scenario = JSON.parse(raw);
  const doc = new El("#document");
  Object.keys(PARTIALS).forEach((id) => parseHTML(render(dir, PARTIALS[id])).forEach((n) => doc.appendChild(n)));
  doc.querySelectorAll(".machines-panel").forEach((p) => { p.offscreen = p.getAttribute("data-machines-only") !== scenario.variant; });
  doc.createElement = (t) => new El(t.toLowerCase());
  doc.createTextNode = (t) => new Text(String(t));

  let clock = 0;
  let frames = [];
  const location = { href: "https://blowhorn.test/" };
  const window = {
    location,
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: (q) => ({ matches: !!scenario.reduce && /reduce/.test(q) }),
    addEventListener() {},
  };
  const ctx = {
    window,
    document: doc,
    performance: { now: () => clock },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    setInterval: () => 1,
    clearInterval() {},
  };
  vm.runInNewContext(fs.readFileSync(script, "utf8"), ctx, { filename: script });

  const panel = doc.querySelector('[data-machines-only="' + scenario.variant + '"]');
  const btn = panel.querySelector("[data-enlist]");
  const strip = panel.querySelector("[data-recruits]");
  const row = panel.querySelector("[data-enlisted-computers]");
  const grid = panel.querySelector(".machines-formation-grid");
  const countEl = ['[data-muster="count"]', '[data-battalion="count"]', '[data-thunder="count"]', '[data-arms="count"]']
    .map((s) => panel.querySelector(s)).find(Boolean) || null;
  const recruits = () => (grid ? grid.querySelectorAll("img").length : row.children.length);
  const isNew = () => panel.querySelectorAll(".is-new").length;

  const start = { recruits: recruits(), stripHidden: strip ? strip.hidden : null };
  const steps = [];
  for (let i = 0; i < scenario.clicks; i++) {
    btn.dispatch("click");
    if (i === 0) {
      // Let a running count-up finish its frames after the first click.
      clock = 1e6;
      const run = frames; frames = [];
      run.forEach((f) => f(clock));
    }
    steps.push({
      recruits: recruits(),
      strip: row ? row.children.length : null,
      stripHidden: strip ? strip.hidden : null,
      count: countEl ? countEl.textContent : null,
      disabled: btn.getAttribute("aria-disabled") === "true",
      isNew: isNew(),
    });
  }
  const pics = row ? row.children.map((img) => ({
    tag: img.tagName, alt: img.getAttribute("alt"), width: img.getAttribute("width"),
    height: img.getAttribute("height"), hidden: img.hidden, template: img.hasAttribute("data-recruit-template"),
  })) : [];
  const others = doc.querySelectorAll(".machines-panel").filter((p) => p !== panel).map((p) => {
    const r = p.querySelector("[data-enlisted-computers]");
    const s = p.querySelector("[data-recruits]");
    return { id: p.getAttribute("data-machines-only"), strip: r ? r.children.length : null, stripHidden: s ? s.hidden : null };
  });
  process.stdout.write(JSON.stringify({
    button: { tag: btn.tagName, type: btn.getAttribute("type"), href: btn.getAttribute("href"), hidden: btn.hidden },
    start,
    steps,
    pics: pics.slice(0, 1),
    location: location.href,
    others,
  }));
}

main();
