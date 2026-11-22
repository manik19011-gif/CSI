/* ===== CSI Bennett — Retro Interactive JS ===== */

const $ = (id) => document.getElementById(id);
const make = (tag, className = '', value = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
};

/* ---- Helpers ---- */
function safeLink(href) {
  try { const url = new URL(href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function externalLink(href, text) {
  const url = safeLink(href);
  if (!url) return null;
  const a = make('a', 'text-link', text);
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}

/* ========== CUSTOM CURSOR ========== */
(function initCursor() {
  const dot = $('cursor-dot');
  const ring = $('cursor-ring');
  if (!dot || !ring) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
  });

  // Smooth ring follow
  function animateRing() {
    rx += (mx - rx) * 0.15;
    ry += (my - ry) * 0.15;
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    requestAnimationFrame(animateRing);
  }
  animateRing();

  // Hover effect on interactive elements
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('a, button, .sticker, .event-card, .team-card, .os-window, .social-card, .domain-card, .gallery-tile')) {
      document.body.classList.add('cursor-hover');
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('a, button, .sticker, .event-card, .team-card, .os-window, .social-card, .domain-card, .gallery-tile')) {
      document.body.classList.remove('cursor-hover');
    }
  });
})();

/* ========== DRAGGABLE STICKERS ========== */
(function initDraggable() {
  const stickers = document.querySelectorAll('.draggable');
  stickers.forEach((el) => {
    let isDragging = false;
    let startX, startY, origX, origY;
    const rotate = el.dataset.rotate || '0';

    function onPointerDown(e) {
      isDragging = true;
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      el.style.position = 'fixed';
      el.style.left = origX + 'px';
      el.style.top = origY + 'px';
      el.style.transform = `rotate(${rotate}deg) scale(1.08)`;
      el.style.zIndex = '100';
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = (origX + dx) + 'px';
      el.style.top = (origY + dy) + 'px';
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      el.style.transform = `rotate(${rotate}deg) scale(1)`;
      el.style.zIndex = '10';
    }

    el.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });
})();

/* ========== SCROLL ANIMATIONS ========== */
(function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.animate-in').forEach((el) => observer.observe(el));
})();

/* ========== TERMINAL TYPING EFFECT ========== */
(function initTerminal() {
  const terminal = $('tv-terminal');
  if (!terminal) return;

  const lines = terminal.querySelectorAll('p');
  lines.forEach((line, i) => {
    line.style.opacity = '0';
    line.style.transform = 'translateY(8px)';
    line.style.transition = 'opacity .4s ease-out, transform .4s ease-out';
    setTimeout(() => {
      line.style.opacity = '1';
      line.style.transform = 'translateY(0)';
    }, 300 + i * 350);
  });
})();

/* ========== DATA RENDERING ========== */
async function fetchList(endpoint, render, containerId) {
  const container = $(containerId);
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Unable to load information.');
    render(await response.json(), container);
  } catch {
    container.replaceChildren(make('p', 'muted', 'Content is temporarily unavailable. Please refresh.'));
  }
}

function renderEvents(items, root) {
  root.replaceChildren();
  if (!items.length) return root.append(make('p', 'muted', 'No events published yet. Follow our socials for news.'));
  items.forEach((event, i) => {
    const card = make('article', 'event-card');
    const art = make('div', `event-art gradient-${i % 4}`);
    art.append(make('small', '', event.type.toUpperCase()), make('strong', '', event.title));
    const body = make('div', 'event-body');
    body.append(make('span', 'eyebrow', event.date ? (event.date < new Date().toISOString().slice(0, 10) ? 'PAST EVENT' : event.date) : 'FEATURED EVENT'));
    body.append(make('h3', '', event.title), make('p', 'muted', event.description));
    body.append(make('p', 'event-location', `⌖ ${event.location}`));
    const link = externalLink(event.link, 'Learn more →');
    if (link) body.append(link);
    card.append(art, body);
    root.append(card);
  });
}

function renderTeam(items, root) {
  root.replaceChildren();
  if (!items.length) return root.append(make('p', 'muted', 'Meet the CSI core: verified member profiles will appear here as the team publishes them.'));
  items.forEach((member, i) => {
    const card = make('article', 'team-card');
    const visual = make('div', `team-visual gradient-${i % 4}`);
    if (safeLink(member.photo_url)) {
      const img = make('img');
      img.src = safeLink(member.photo_url);
      img.alt = `Photo of ${member.name}`;
      img.loading = 'lazy';
      visual.append(img);
    } else {
      visual.append(make('strong', '', member.name.split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase()));
    }
    const body = make('div', 'team-body');
    body.append(make('small', 'eyebrow', member.department), make('h3', '', member.name), make('p', 'muted', member.role));
    card.append(visual, body);
    root.append(card);
  });
}

function renderGallery(items, root) {
  root.replaceChildren();
  if (!items.length) return root.append(make('p', 'muted', 'More CSI moments are on their way.'));
  items.forEach((item, i) => {
    const tile = make('article', `gallery-tile gradient-${i % 4}`);
    const imageUrl = safeLink(item.image_url);
    if (imageUrl) {
      const img = make('img');
      img.loading = 'lazy';
      img.src = imageUrl;
      img.alt = item.alt_text || item.title;
      tile.append(img);
    }
    const label = make('div', 'gallery-label');
    label.append(make('small', '', item.category), make('h3', '', item.title));
    tile.append(label);
    root.append(tile);
  });
}

/* ========== FORMS ========== */
function wireForm(id, kind) {
  const form = $(id), status = form.querySelector('.form-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.kind = kind;
    button.disabled = true;
    status.textContent = 'Submitting…';
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSI-Request': 'website' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Submission failed.');
      status.textContent = 'Thanks! Your details were received by the CSI team.';
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

/* ========== NAV TOGGLE ========== */
const toggle = $('nav-toggle');
toggle.addEventListener('click', () => {
  const open = $('nav-links').classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  const hamburger = toggle.querySelector('.hamburger');
  if (hamburger) {
    hamburger.style.background = open ? 'transparent' : '';
    hamburger.style.transform = open ? 'rotate(45deg)' : '';
  }
});
document.querySelectorAll('#nav-links a').forEach(a =>
  a.addEventListener('click', () => {
    $('nav-links').classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    const hamburger = toggle.querySelector('.hamburger');
    if (hamburger) {
      hamburger.style.background = '';
      hamburger.style.transform = '';
    }
  })
);

/* ========== NAV ACTIVE HIGHLIGHT ========== */
(function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links > a:not(.nav-join)');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach((link) => {
          link.style.color = link.getAttribute('href') === `#${id}` ? 'var(--accent)' : '';
        });
      }
    });
  }, { threshold: 0.3 });

  sections.forEach((s) => observer.observe(s));
})();

/* ========== PARALLAX STICKERS ========== */
(function initParallax() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const stickers = document.querySelectorAll('.sticker');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    stickers.forEach((s, i) => {
      const speed = 0.03 + (i * 0.015);
      s.style.marginTop = -(y * speed) + 'px';
    });
  }, { passive: true });
})();

/* ========== INIT ========== */
$('year').textContent = new Date().getFullYear();
fetchList('/api/events', renderEvents, 'events-list');
fetchList('/api/team', renderTeam, 'team-list');
fetchList('/api/gallery', renderGallery, 'gallery-list');

