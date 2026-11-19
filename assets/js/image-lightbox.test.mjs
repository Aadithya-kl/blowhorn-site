import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// image-lightbox.js is a classic script, so it runs in a fake page: the
// #myModal overlay with its #modalPic, and the images each test passes in.
const source = readFileSync(new URL("./image-lightbox.js", import.meta.url), "utf8");

function link(href) {
  return { getAttribute: (name) => (name === "href" ? href : null) };
}

function image({ src = "/assets/thumb.png", alt = "A thumbnail", href, modal, inModal = false } = {}) {
  const listeners = {};
  const wrap = href === undefined ? null : link(href);
  return {
    src,
    currentSrc: src,
    alt,
    dataset: modal === undefined ? {} : { modal },
    listeners,
    inModal,
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    closest(selector) {
      if (selector === "a[href]") return wrap;
      if (selector === "#myModal") return inModal ? {} : null;
      return null;
    },
  };
}

function loadPage(images) {
  const box = { style: { display: "none" }, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
  const pic = { src: "", alt: "" };
  const document = {
    readyState: "complete",
    getElementById: (id) => (id === "myModal" ? box : id === "modalPic" ? pic : null),
    querySelectorAll: (selector) => (selector === "img" ? images : []),
    addEventListener() {},
  };
  const context = { document };
  context.window = context;
  vm.runInNewContext(source, context);
  return { box, pic, window: context.window };
}

// Click an image the way the browser does: run its listeners, then report
// whether the default (following a link) was prevented.
function click(img) {
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  for (const fn of img.listeners.click || []) fn(event);
  return prevented;
}

test("an unlinked image opens the modal on itself", () => {
  const img = image();
  const page = loadPage([img]);
  assert.equal(click(img), true);
  assert.equal(page.box.style.display, "block");
  assert.equal(page.pic.src, "/assets/thumb.png");
  assert.equal(page.pic.alt, "A thumbnail");
});

test("an image linked to an image file opens the modal on the link target", () => {
  const img = image({ href: "/assets/full.png" });
  const page = loadPage([img]);
  assert.equal(click(img), true);
  assert.equal(page.box.style.display, "block");
  assert.equal(page.pic.src, "/assets/full.png");
});

test("a query or hash on an image link still counts as an image link", () => {
  for (const href of ["/assets/full.webp?v=2", "/assets/full.JPG#top", "/assets/full.svg?v=2#top"]) {
    const img = image({ href });
    const page = loadPage([img]);
    assert.equal(click(img), true, href);
    assert.equal(page.box.style.display, "block", href);
    assert.equal(page.pic.src, href.split("#")[0], href);
  }
});

test("an image linked to a page or a download follows the link", () => {
  for (const href of ["/docs/guide/", "https://example.com/page", "/brand/blowhorn-brand-kit.zip", "#section", "/assets/png"]) {
    const img = image({ href });
    const page = loadPage([img]);
    assert.equal(click(img), false, href);
    assert.equal(page.box.style.display, "none", href);
    assert.equal(page.pic.src, "", href);
  }
});

test("the inline onclick on a Markdown image does not open the modal for a link elsewhere", () => {
  const img = image({ href: "/docs/guide/" });
  const page = loadPage([img]);
  page.window.openModal(img);
  assert.equal(page.box.style.display, "none");
  page.window.openModal(image());
  assert.equal(page.box.style.display, "block");
});

test("data-modal=false and the modal's own image are skipped", () => {
  const optedOut = image({ modal: "false" });
  const own = image({ inModal: true });
  const page = loadPage([optedOut, own]);
  assert.equal(click(optedOut), false);
  assert.equal(click(own), false);
  assert.equal(page.box.style.display, "none");
});

test("openModal and closeModal stay global for the inline handlers", () => {
  const page = loadPage([]);
  assert.equal(typeof page.window.openModal, "function");
  assert.equal(typeof page.window.closeModal, "function");
  page.window.openModal(image());
  page.window.closeModal();
  assert.equal(page.box.style.display, "none");
  assert.equal(page.pic.src, "");
});
