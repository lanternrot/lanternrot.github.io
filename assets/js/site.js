// Lantern Rot site scripts. Each feature looks for its own elements and quietly
// skips itself on pages that don't have them (the news pages have no hero).
// The testable logic lives in ./logic.js.
import { submitBeta, parseVersion, chipSegments, errorMessage } from "./logic.js";

const VERSION_URL = "https://raw.githubusercontent.com/Deltran/dorf/main/version.txt";
const VERSION_TIMEOUT_MS = 6000;

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Nav gets its rule once the page scrolls.
function initNav() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });
}

// ROT glitch: a full one on hover and shortly after load, and a short twitch on its own
// every 6-14 seconds so the logo stays a little alive.
function initWordmark() {
  const word = document.querySelector(".word");
  if (!word || still) return;
  let timer;
  const glitch = (flips = 6) => {
    if (timer) return;
    let n = 0;
    timer = setInterval(() => {
      word.classList.toggle("glitch", n % 2 === 0);
      if (++n >= flips) { clearInterval(timer); timer = null; word.classList.remove("glitch"); }
    }, 55);
  };
  word.addEventListener("pointerenter", () => glitch());
  setTimeout(glitch, 1400);
  const twitch = () => {
    if (!document.hidden) glitch(2);
    setTimeout(twitch, 6000 + Math.random() * 8000);
  };
  setTimeout(twitch, 6000);
}

// Lantern rot pixels: now and then one falls off the corner and grows back.
function initLantern() {
  const pixels = [...document.querySelectorAll(".mark .rp")];
  if (!pixels.length || still) return;
  const dropOne = () => {
    const p = pixels[Math.floor(Math.random() * pixels.length)];
    p.animate([
      { transform: "translate(0,0)", opacity: 1 },
      { transform: "translate(8px,110px)", opacity: 0, offset: 0.4 },
      { transform: "translate(0,0)", opacity: 0, offset: 0.75 },
      { transform: "translate(0,0)", opacity: 1 }
    ], { duration: 3200, easing: "steps(7, end)" });
  };
  setInterval(() => document.hidden || dropOne(), 2600);
}

// Pointer-tracked border light on the game tiles (shown on hover-capable screens only, via CSS).
function initSpotlight() {
  document.querySelectorAll(".spot").forEach(el => {
    el.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--x", `${e.clientX - r.left}px`);
      el.style.setProperty("--y", `${e.clientY - r.top}px`);
    });
  });
}

// Beta form: a real submission. The success block shows only when Web3Forms
// said success; every other outcome shows the error block, keeps the answers,
// and logs the reason to the console.
function initBetaForm() {
  const form = document.getElementById("beta-form");
  if (!form) return;
  const ok = document.getElementById("b-ok");
  const bad = document.getElementById("b-bad");
  const badMessage = document.getElementById("b-bad-msg");
  const send = document.getElementById("b-send");
  const fields = form.elements;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    bad.hidden = true;
    if (!form.reportValidity()) return;
    send.disabled = true;
    send.textContent = "Sending…";
    let result;
    try {
      result = await submitBeta({
        fetchImpl: (...args) => fetch(...args),
        accessKey: form.dataset.accessKey,
        email: fields.email.value,
        phone: fields.phone.value,
        where: fields.where.value,
        news: fields.news.checked,
        botcheck: fields.botcheck.checked,
        now: new Date()
      });
    } finally {
      send.disabled = false;
      send.textContent = "Send request";
    }
    if (result.ok) {
      document.getElementById("b-addr").textContent = fields.email.value;
      form.hidden = true;
      ok.hidden = false;
      return;
    }
    console.error(`Beta request not sent (${result.kind}): ${result.reason}`);
    badMessage.textContent = errorMessage(result.kind);
    bad.hidden = false;
  });
}

// Hero chip: "Dorf {version} · Latest: {post}". The post title is in the page
// already; the version comes from Dorf's public version.txt. If that can't be
// fetched or isn't a version, the chip stays as "Latest: {post}".
async function initChip() {
  const label = document.querySelector(".chip-text");
  if (!label) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS);
  try {
    const response = await fetch(VERSION_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const version = parseVersion(text);
    if (!version) throw new Error(`not a version: ${JSON.stringify(text.slice(0, 40))}`);
    label.replaceChildren(...chipSegments(version, label.dataset.title).map(segment => {
      if (!segment.version) return document.createTextNode(segment.text);
      const span = document.createElement("span");
      span.className = "ver";
      span.textContent = segment.text;
      return span;
    }));
  } catch (error) {
    console.warn(`Hiding the Dorf version in the hero chip: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// Hero background: a faint pixel grid that rots in from the lower right.
function initRotGrid() {
  const cv = document.getElementById("rot");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const CELL = 22;
  let cols = 0, rows = 0, w = 0, h = 0, running = true;
  const cells = new Map();

  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / CELL); rows = Math.ceil(h / CELL);
  };
  // Seeds favour the lower-right corner, where the logo crumbles.
  const seed = () => {
    const c = cols - 1 - Math.floor(Math.random() ** 2.2 * cols * 0.7);
    const r = rows - 1 - Math.floor(Math.random() ** 1.6 * rows);
    return [c, r];
  };
  const spawn = () => {
    let c, r;
    const keys = [...cells.keys()];
    if (keys.length && Math.random() < 0.7) {
      [c, r] = keys[Math.floor(Math.random() * keys.length)].split(",").map(Number);
      c += Math.floor(Math.random() * 3) - 1; r += Math.floor(Math.random() * 3) - 1;
    } else [c, r] = seed();
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const life = 5000 + Math.random() * 7000;
    cells.set(`${c},${r}`, { born: performance.now(), life, amber: Math.random() < 0.07 });
  };
  const draw = now => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(243,239,230,0.035)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= cols; x++) { ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, h); }
    for (let y = 0; y <= rows; y++) { ctx.moveTo(0, y * CELL + .5); ctx.lineTo(w, y * CELL + .5); }
    ctx.stroke();
    for (const [k, v] of cells) {
      const t = (now - v.born) / v.life;
      if (t >= 1) { cells.delete(k); continue; }
      const [c, r] = k.split(",").map(Number);
      // Fade toward the upper left so the words sit on a clean grid.
      const reach = Math.min(1, (c / cols) * 0.8 + (r / rows) * 0.6);
      const a = (t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92) * 0.32 * reach;
      ctx.fillStyle = v.amber ? `rgba(255,184,77,${a})` : `rgba(126,224,160,${a})`;
      ctx.fillRect(c * CELL + 2, r * CELL + 2, CELL - 3, CELL - 3);
    }
  };

  // Reduced motion: one settled frame, a small static cluster in the corner.
  const drawStill = () => {
    cells.clear();
    const now = performance.now();
    for (let i = 0; i < 60; i++) spawn();
    for (const v of cells.values()) v.born = now - v.life * 0.3;
    draw(now);
  };

  let last = 0;
  const loop = now => {
    if (running && !document.hidden) {
      if (now - last > 90 && cells.size < 140) { spawn(); spawn(); last = now; }
      draw(now);
    }
    requestAnimationFrame(loop);
  };

  // The hero's height changes when the web fonts land, so follow the canvas
  // itself rather than the window.
  new ResizeObserver(() => { size(); if (still) drawStill(); }).observe(cv);
  if (!still) {
    // Paused while offscreen; the loop also idles on a hidden tab.
    new IntersectionObserver(([entry]) => { running = entry.isIntersecting; }).observe(cv);
    requestAnimationFrame(loop);
  }
}

initNav();
initWordmark();
initLantern();
initSpotlight();
initBetaForm();
initChip();
initRotGrid();
