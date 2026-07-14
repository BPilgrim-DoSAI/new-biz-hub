/* =============================================
   MIROMA AI HUB — Main JS
   ============================================= */

/* === Toast — non-blocking notice for background failures ===
   Data writes (reactions, usage logs) fail silently on flaky
   connections; this gives the user a visible, self-dismissing cue. */
window.hubToast = (function () {
  let el = null, timer = null;
  return function (message) {
    if (!el) {
      el = document.createElement('div');
      el.className = 'hub-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(timer);
    requestAnimationFrame(() => el.classList.add('is-shown'));
    timer = setTimeout(() => el.classList.remove('is-shown'), 4000);
  };
})();

/* === Active nav link === */
(function setActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a, .mobile-menu a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('is-active');
  });
})();

/* === Mobile menu === */
(function mobileMenu() {
  const toggle = document.getElementById('navToggle');
  const menu   = document.getElementById('mobileMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('is-open');
    menu.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    toggle.setAttribute('aria-expanded', open);
  });

  // Close on link click
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      toggle.classList.remove('is-open');
      menu.classList.remove('is-open');
      document.body.style.overflow = '';
    });
  });
})();

/* === Learning page tabs === */
(function initTabs() {
  const tabBtns   = document.querySelectorAll('.tool-tile');
  const tabPanels = document.querySelectorAll('.tab-panel');
  if (!tabBtns.length) return;

  function activatePanel(panel) {
    if (!panel) return;
    panel.classList.add('active');
    panel.querySelectorAll('iframe[data-src]').forEach(iframe => {
      iframe.src = iframe.dataset.src;
      delete iframe.dataset.src;
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activatePanel(document.getElementById(target));
    });
  });
})();

/* === Click-to-play YouTube thumbnails === */
(function initVideoThumbs() {
  const WATCHED_KEY = 'miroma_hub_watched';

  function loadWatched() {
    try { return JSON.parse(localStorage.getItem(WATCHED_KEY)) || []; }
    catch { return []; }
  }

  function checkStageReady(stageEl) {
    if (!stageEl || stageEl.classList.contains('is-complete')) return;
    const watched = loadWatched();
    const thumbs  = [...stageEl.querySelectorAll('[data-video-id]')];
    if (!thumbs.length) return;
    const allWatched = thumbs.every(t => watched.includes(t.dataset.videoId));
    const btn = stageEl.querySelector('.stage-complete-btn');
    if (btn) btn.classList.toggle('is-ready', allWatched);
  }

  document.querySelectorAll('.video-card__thumb[data-video-id]').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const id = thumb.dataset.videoId;
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      iframe.title = thumb.dataset.title || 'YouTube video';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;';
      wrap.appendChild(iframe);

      const watched = loadWatched();
      if (!watched.includes(id)) {
        watched.push(id);
        localStorage.setItem(WATCHED_KEY, JSON.stringify(watched));
      }
      const stageParent = thumb.closest('.pathway-stage');
      thumb.replaceWith(wrap);
      if (stageParent) checkStageReady(stageParent);
    });
    thumb.style.cursor = 'pointer';
  });

  document.querySelectorAll('.pathway-stage[data-stage]').forEach(checkStageReady);
})();

/* === Use cases filter & search === */
(function initUseCases() {
  const catBtns     = document.querySelectorAll('.filter-btn[data-filter]');
  const typeBtns    = document.querySelectorAll('.filter-btn[data-type-filter]');
  const searchInput = document.getElementById('ucSearch');
  let cards = document.querySelectorAll('.uc-card');
  if (!cards.length) return;

  let activeCategory = 'all';
  let activeType     = 'all';
  let searchTerm     = '';

  // Annotate cards with data-type from USE_CASES (custom build cards already have it in HTML)
  function annotateTypes() {
    if (typeof USE_CASES === 'undefined') return;
    cards.forEach(card => {
      if (card.classList.contains('uc-card--submit') || card.dataset.type) return;
      const title = card.querySelector('.uc-card__title')?.textContent?.trim() || '';
      const uc = USE_CASES.find(u => u.title === title);
      if (uc) card.dataset.type = uc.type || 'prompt';
    });
  }
  annotateTypes();

  // Re-collect cards after the grid is rebuilt from Firestore content
  // (use-cases-content.js), keeping the current filter/search state applied.
  window._ucFiltersRefresh = function () {
    cards = document.querySelectorAll('.uc-card');
    annotateTypes();
    applyFilters();
  };

  function applyFilters() {
    let visibleCount = 0;
    cards.forEach(card => {
      if (card.classList.contains('uc-card--submit')) { card.hidden = false; return; }
      const cat     = card.dataset.category || '';
      const typeVal = card.dataset.type || 'prompt';
      const text    = (card.textContent || '').toLowerCase();

      const catMatch  = activeCategory === 'all' || cat === activeCategory;
      const typeMatch = activeType === 'all' || typeVal === activeType;
      const termMatch = !searchTerm || text.includes(searchTerm);

      const show = catMatch && typeMatch && termMatch;
      card.hidden = !show;
      if (show) visibleCount++;
    });
    const noResults = document.getElementById('noResults');
    if (noResults) noResults.hidden = visibleCount > 0;
    const resultCount = document.getElementById('ucResultCount');
    if (resultCount) {
      const label = visibleCount === 1 ? 'use case' : 'use cases';
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!resultCount.dataset.animated && !reduceMotion && visibleCount > 0) {
        // Count up from 0 on first render only; filter changes update instantly.
        resultCount.dataset.animated = '1';
        const dur = 900, start = performance.now();
        (function tick(now) {
          const p = Math.min(((now || performance.now()) - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          resultCount.textContent = `${Math.round(eased * visibleCount)} ${label}`;
          if (p < 1) requestAnimationFrame(tick);
        })(start);
      } else {
        resultCount.dataset.animated = '1';
        resultCount.textContent = `${visibleCount} ${label}`;
      }
    }
  }

  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      catBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.filter;
      applyFilters();
    });
  });

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.dataset.typeFilter;
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      applyFilters();
    });
  }

  applyFilters();

  // Handle URL params: ?filter=category, ?type=custom-build
  const params = new URLSearchParams(window.location.search);
  const urlFilter = params.get('filter');
  const urlType   = params.get('type');
  if (urlType) {
    const typeBtn = [...typeBtns].find(b => b.dataset.typeFilter === urlType);
    if (typeBtn) typeBtn.click();
  }
  if (urlFilter) {
    const matchBtn = [...catBtns].find(b => b.dataset.filter === urlFilter);
    if (matchBtn) matchBtn.click();
  }
})();

/* === Claude onboarding function track accordion === */
(function initFunctionTracks() {
  const toggles = document.querySelectorAll('.function-track__toggle');
  if (!toggles.length) return;
  toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const body = btn.nextElementSibling;
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      btn.classList.toggle('is-open', !isOpen);
      body.hidden = isOpen;
    });
  });
})();

/* === Onboarding pathway progress + accordion === */
(function initPathwayProgress() {
  const BASE_KEY  = 'miroma_hub_pathway';
  const STAGE_IDS = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'];

  // Scope progress to the signed-in user so different accounts don't share state.
  // M-3: uses the Firebase Auth uid rather than the user's work email, so the
  // localStorage key reveals no PII to anything that enumerates localStorage
  // entries. Email-keyed progress from before the migration becomes orphaned;
  // Firestore (pathway_progress collection) remains the authoritative source.
  function storageKey() {
    const uid = (typeof hubGetUid === 'function') ? hubGetUid() : '';
    return BASE_KEY + '_' + (uid || 'guest');
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(storageKey())) || {}; }
    catch { return {}; }
  }
  function save(p) { localStorage.setItem(storageKey(), JSON.stringify(p)); }
  function stageEl(id) { return document.querySelector(`.pathway-stage[data-stage="${id}"]`); }

  function applyState() {
    const p = load();
    let done = 0;

    STAGE_IDS.forEach((id, i) => {
      const el = stageEl(id);
      if (!el) return;
      const isComplete = !!p[id];
      const isLocked   = i > 0 && !p[STAGE_IDS[i - 1]];

      el.classList.toggle('is-complete', isComplete);
      el.classList.toggle('is-locked', isLocked);

      const btn = el.querySelector('.stage-complete-btn');
      if (btn) {
        btn.disabled = isComplete;
        btn.classList.toggle('is-done', isComplete);
        btn.textContent = isComplete ? '✓ Stage complete' : 'Mark stage complete →';
      }
      if (isComplete) done++;
    });

    const total = STAGE_IDS.filter(id => stageEl(id)).length;
    const bar   = document.querySelector('.pathway-progress__bar');
    const label = document.querySelector('.pathway-progress__label');
    const reset = document.querySelector('.pathway-reset-btn');
    if (bar) bar.style.width = (total ? (done / total) * 100 : 0) + '%';
    if (label) label.textContent = `${done} of ${total} stages complete`;
    if (reset) reset.style.display = done > 0 ? 'inline' : 'none';
  }

  // Re-apply state when auth changes (different user signs in or out)
  document.addEventListener('mirAuthReady', applyState);
  document.addEventListener('mirAuthSignedOut', applyState);

  // Accordion for all stage headers
  document.querySelectorAll('.pathway-stage__header[aria-expanded]').forEach(header => {
    header.addEventListener('click', () => {
      const stage = header.closest('.pathway-stage');
      if (stage.classList.contains('is-locked')) return;
      const body   = stage.querySelector('.pathway-stage__body');
      const isOpen = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!isOpen));
      stage.classList.toggle('is-open', !isOpen);
      if (body) body.hidden = isOpen;
    });
  });

  // Mark complete button
  document.querySelectorAll('.stage-complete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stage = btn.closest('.pathway-stage');
      const id    = stage?.dataset.stage;
      if (!id) return;

      const p = load();
      p[id] = true;
      save(p);
      applyState();

      const idx = STAGE_IDS.indexOf(id);
      const curHeader = stage.querySelector('.pathway-stage__header');
      const curBody   = stage.querySelector('.pathway-stage__body');
      stage.classList.remove('is-open');
      curHeader?.setAttribute('aria-expanded', 'false');
      if (curBody) curBody.hidden = true;

      if (idx < STAGE_IDS.length - 1) {
        const nextEl = stageEl(STAGE_IDS[idx + 1]);
        if (nextEl) {
          nextEl.classList.remove('is-locked');
          nextEl.classList.add('is-open');
          const nextHeader = nextEl.querySelector('.pathway-stage__header');
          const nextBody   = nextEl.querySelector('.pathway-stage__body');
          nextHeader?.setAttribute('aria-expanded', 'true');
          if (nextBody) nextBody.hidden = false;

          setTimeout(() => nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        }
      }
    });
  });

  // Reset progress button
  const resetBtn = document.querySelector('.pathway-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset your progress? This will unmark all completed stages.')) return;
      localStorage.removeItem(storageKey());
      // Re-open stage 1, close and lock the rest
      STAGE_IDS.forEach((id, i) => {
        const el = stageEl(id);
        if (!el) return;
        const header = el.querySelector('.pathway-stage__header');
        const body   = el.querySelector('.pathway-stage__body');
        el.classList.remove('is-open');
        header?.setAttribute('aria-expanded', 'false');
        if (body) body.hidden = true;
        if (i === 0) {
          el.classList.add('is-open');
          header?.setAttribute('aria-expanded', 'true');
          if (body) body.hidden = false;
        }
      });
      applyState();
    });
  }

  applyState();
})();

/* === Prompt copy buttons === */
(function initPromptCopy() {
  document.querySelectorAll('.prompt-copy-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const text = btn.closest('.prompt-example')?.querySelector('.prompt-text')?.textContent.trim() || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('is-copied');
        setTimeout(() => btn.classList.remove('is-copied'), 1500);
      }).catch(() => {});
    });
  });
})();

/* === Use case submission via mailto === */
(function initSubmitForm() {
  const form = document.getElementById('submitForm');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name     = form.querySelector('[name="name"]')?.value || '';
    const team     = form.querySelector('[name="team"]')?.value || '';
    const tool     = form.querySelector('[name="tool"]')?.value || '';
    const title    = form.querySelector('[name="title"]')?.value || '';
    const describe = form.querySelector('[name="description"]')?.value || '';
    const outcome  = form.querySelector('[name="outcome"]')?.value || '';

    const subject = encodeURIComponent(`AI Use Case Submission: ${title}`);
    const body = encodeURIComponent(
`AI Use Case Submission
======================

Name: ${name}
Team / Agency: ${team}
AI Tool Used: ${tool}

Use Case Title: ${title}

Description:
${describe}

Outcome / Result:
${outcome}

---
Submitted via Miroma AI Hub`
    );

    window.location.href = `mailto:aiteam@miroma.com?subject=${subject}&body=${body}`;
  });
})();

/* =============================================
   MOTION GRAPHICS
   ============================================= */


/* Respect the OS-level "reduce motion" preference: JS-driven effects
   set inline transforms that CSS media queries can't neutralise, so
   each effect below checks this flag and stands down. */
const PREFERS_REDUCED_MOTION =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* === Hero text line reveal === */
(function initHeroReveal() {
  const lines = document.querySelectorAll('.reveal-line__inner');
  if (!lines.length) return;
  if (PREFERS_REDUCED_MOTION) {
    lines.forEach(line => line.classList.add('is-revealed'));
    return;
  }
  lines.forEach((line, i) => {
    setTimeout(() => line.classList.add('is-revealed'), 120 + i * 140);
  });
})();

/* === Hero cinematics — searchlight + orb parallax ===
   Pointer-driven, so desktop only ('hover + fine pointer' guard), and
   skipped entirely under reduced motion. Values are eased towards their
   targets each frame (lerp) so the light glides rather than snaps. */
(function initHeroCinematics() {
  if (PREFERS_REDUCED_MOTION) return;
  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let tx = 0, ty = 0, cx = 0, cy = 0;          // parallax target/current (px)
  let tsx = 68, tsy = 38, sx = 68, sy = 38;     // spotlight target/current (%)
  let raf = null;

  function frame() {
    cx += (tx - cx) * 0.06;  cy += (ty - cy) * 0.06;
    sx += (tsx - sx) * 0.10; sy += (tsy - sy) * 0.10;
    hero.style.setProperty('--par-x', cx.toFixed(2) + 'px');
    hero.style.setProperty('--par-y', cy.toFixed(2) + 'px');
    hero.style.setProperty('--spot-x', sx.toFixed(2) + '%');
    hero.style.setProperty('--spot-y', sy.toFixed(2) + '%');
    const settled = Math.abs(tx - cx) < 0.05 && Math.abs(ty - cy) < 0.05
                 && Math.abs(tsx - sx) < 0.05 && Math.abs(tsy - sy) < 0.05;
    raf = settled ? null : requestAnimationFrame(frame);
  }

  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    tx = (nx - 0.5) * 26;  ty = (ny - 0.5) * 18;
    tsx = nx * 100;        tsy = ny * 100;
    hero.classList.add('is-spotlit');
    if (!raf) raf = requestAnimationFrame(frame);
  });

  hero.addEventListener('pointerleave', () => {
    tx = 0; ty = 0;
    hero.classList.remove('is-spotlit');
    if (!raf) raf = requestAnimationFrame(frame);
  });
})();

/* === Scroll-triggered motion === */
(function initScrollMotion() {
  if (!('IntersectionObserver' in window)) return;

  // Auto-assign data-motion to card grids with stagger delays
  const cardGroups = [
    { sel: '.tools-grid .tool-card-sm',  motion: 'up' },
    { sel: '.explore-grid .explore-card', motion: 'up' },
    { sel: '.doc-grid .doc-card',         motion: 'up' },
    { sel: '.video-grid .video-card',     motion: 'up' },
    { sel: '.uc-grid .uc-card',           motion: 'up' },
    { sel: '.rules-grid .rule-card',      motion: 'up' },
    { sel: '.tool-card-lg',               motion: 'up' },
  ];
  cardGroups.forEach(({ sel, motion }) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      if (!el.hasAttribute('data-motion')) {
        el.setAttribute('data-motion', motion);
        el.style.transitionDelay = (i * 0.07) + 's';
      }
    });
  });

  // Section headers
  document.querySelectorAll('.section-header__label, .page-header__label').forEach(el => {
    el.setAttribute('data-motion', 'fade');
  });
  document.querySelectorAll('.section-header__title, .page-header__title').forEach(el => {
    if (!el.hasAttribute('data-motion')) el.setAttribute('data-motion', 'up');
  });
  document.querySelectorAll('.section-header__body, .page-header__body').forEach(el => {
    if (!el.hasAttribute('data-motion')) { el.setAttribute('data-motion', 'up'); el.style.transitionDelay = '0.1s'; }
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('is-visible');
      obs.unobserve(el);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  window._motionObserver = obs;
  document.querySelectorAll('[data-motion]').forEach(el => obs.observe(el));
})();

/* === 3D card tilt on hover === */
(function initCardTilt() {
  if (PREFERS_REDUCED_MOTION) return;
  document.querySelectorAll('.tool-card-sm, .explore-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width  - 0.5;
      const y = (e.clientY - r.top)  / r.height - 0.5;
      card.style.transform = `perspective(700px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-5px)`;
      card.style.boxShadow = `${-x * 8}px ${-y * 8}px 24px rgba(0,0,0,0.08)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = ''; card.style.boxShadow = '';
    });
  });
})();

/* === Magnetic buttons === */
(function initMagneticButtons() {
  if (PREFERS_REDUCED_MOTION) return;
  document.querySelectorAll('.btn--primary, .btn--outline').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width  / 2) * 0.28;
      const y = (e.clientY - r.top  - r.height / 2) * 0.28;
      btn.style.transform = `translate(${x}px, ${y}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
})();

/* === What's New — news feed renderer === */
(function initNewsFeed() {
  const feed     = document.getElementById('newsFeed');
  const moreWrap = document.getElementById('newsLoadMore');
  const moreBtn  = document.getElementById('newsLoadBtn');
  if (!feed || typeof NEWS === 'undefined') return;

  const INITIAL_COUNT = 6;
  let   showing       = INITIAL_COUNT;

  const TYPE_LABELS = { tip: 'Quick Tip', update: 'Update', video: 'Video' };

  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function buildCard(item) {
    const typeBadge = `<span class="news-badge news-badge--${item.type}">${esc(TYPE_LABELS[item.type] || item.type)}</span>`;
    const toolBadge = item.tool ? `<span class="news-badge news-badge--tool">${esc(item.tool)}</span>` : '';
    const dateStr   = `<span class="news-card__date">${formatDate(item.date)}</span>`;

    let videoHtml = '';
    if (item.video) {
      if (item.video.embed) {
        videoHtml = `<div class="news-card__video-wrap"><iframe src="${esc(item.video.embed)}" allowfullscreen loading="lazy"></iframe></div>`;
      } else if (item.video.thumb && item.video.url) {
        videoHtml = `
          <a class="news-card__video-wrap" href="${esc(item.video.url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch video">
            <img src="${esc(item.video.thumb)}" alt="" loading="lazy">
            <div class="news-card__video-play">
              <span><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
            </div>
          </a>`;
      }
    }

    const linkHtml = item.link
      ? `<a class="news-card__link" href="${esc(item.link.url)}" target="_blank" rel="noopener noreferrer">${esc(item.link.label)}</a>`
      : '';

    return `
      <div class="news-card news-card--${item.type}">
        <div class="news-card__accent"></div>
        <div class="news-card__inner">
          <div class="news-card__header">
            <div class="news-card__badges">${typeBadge}${toolBadge}</div>
            ${dateStr}
          </div>
          <p class="news-card__title">${esc(item.title)}</p>
          <p class="news-card__body">${esc(item.body)}</p>
          ${videoHtml}
          ${linkHtml}
        </div>
      </div>`;
  }

  function render() {
    feed.innerHTML = NEWS.slice(0, showing).map(buildCard).join('');
    if (NEWS.length > showing) {
      moreWrap.hidden = false;
    } else {
      moreWrap.hidden = true;
    }
  }

  moreBtn?.addEventListener('click', () => {
    showing += 6;
    render();
    // re-observe new cards for scroll animation
    feed.querySelectorAll('.news-card:not(.is-visible)[data-motion]').forEach(el => {
      if (window._motionObserver) window._motionObserver.observe(el);
    });
  });

  render();
})();

/* === Get Involved — action tab switcher + form handlers === */
(function initActionTabs() {
  const switcher = document.querySelector('.action-switcher');
  if (!switcher) return;

  const btns   = switcher.querySelectorAll('.action-switcher__btn');
  const panels = document.querySelectorAll('.action-panel');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
      panels.forEach(p => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      const target = document.getElementById(btn.dataset.panel);
      if (target) target.classList.add('is-active');
    });
  });

  function mailtoSubmit(formEl, buildSubject, buildBody) {
    formEl.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(formEl).entries());
      window.location.href =
        `mailto:aiteam@miroma.com?subject=${encodeURIComponent(buildSubject(data))}&body=${encodeURIComponent(buildBody(data))}`;
    });
  }

  // Form 1 — Share a use case
  const ucForm = document.getElementById('hubUseCaseForm');
  if (ucForm) mailtoSubmit(ucForm,
    d => `AI Use Case Submission: ${d.title || ''}`,
    d => `AI Use Case Submission\n======================\n\nName: ${d.name}\nTeam / Agency: ${d.team}\nAI Tool Used: ${d.tool}\nCategory: ${d.category}\n\nUse Case Title: ${d.title}\n\nDescription:\n${d.description}\n\nOutcome / Result:\n${d.outcome}\n\n---\nSubmitted via Miroma AI Hub`
  );

  // Form 2 — Request a custom build
  const buildForm = document.getElementById('hubBuildForm');
  if (buildForm) mailtoSubmit(buildForm,
    d => `Custom AI Build Request — ${d.team || ''}`,
    d => `Custom AI Build Request\n=======================\n\nName: ${d.name}\nTeam / Agency: ${d.team}\nTimeline: ${d.urgency || 'Not specified'}\n\nProblem to solve:\n${d.problem}\n\nTools / workflows involved:\n${d.context || 'Not specified'}\n\nWhat success looks like:\n${d.success}\n\n---\nSubmitted via Miroma AI Hub`
  );

  // Form 3 — Request training
  const trainForm = document.getElementById('hubTrainingForm');
  if (trainForm) mailtoSubmit(trainForm,
    d => `Training Request — ${d.tool || ''} — ${d.team || ''}`,
    d => `Training Session Request\n========================\n\nName: ${d.name}\nTeam / Agency: ${d.team}\nTool: ${d.tool}\nGroup size: ${d.size || 'Not specified'}\nExperience level: ${d.level || 'Not specified'}\nPreferred dates: ${d.dates || 'Flexible'}\n\nGoal / what they want to achieve:\n${d.goal}\n\n---\nSubmitted via Miroma AI Hub`
  );

  // Form 4 — New starter tool access (routes to agency admin for approval)
  const onboardingForm = document.getElementById('hubOnboardingForm');
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(onboardingForm).entries());
      const tools = [...onboardingForm.querySelectorAll('[name="tools"]:checked')]
        .map(cb => cb.value).join(', ') || 'None selected';

      const agencyKey = (typeof agencyNameToKey !== 'undefined') ? agencyNameToKey(d.agency) : null;
      const approverEmail = (d.approverEmail || '').trim();

      // Save to Firestore as audit log
      try {
        await fsSaveRequest({
          type:          'new-starter',
          agencyKey:     agencyKey || d.agency,
          agencyName:    d.agency,
          name:          d.name || '',
          role:          d.role || '',
          email:         '',
          tools:         tools,
          startDate:     d.startDate || '',
          notes:         d.notes || '',
          approverEmail: approverEmail,
          status:        'pending',
          source:        'new-starter-form',
        });
      } catch (err) {
        console.warn('Could not save to Firestore:', err);
      }

      // Draft email to AI team, CC'ing the approver if provided
      const subject = 'New Starter Access Request — ' + d.agency;
      const body = [
        'New Starter Access Request',
        '',
        'Name: '       + (d.name      || '—'),
        'Role: '       + (d.role      || '—'),
        'Agency: '     + (d.agency    || '—'),
        'Start date: ' + (d.startDate || '—'),
        'Tools: '      + tools,
        d.notes ? ('Notes: ' + d.notes) : '',
        '',
        approverEmail ? ('Approver: ' + approverEmail) : 'Approver: Not provided',
        '',
        'Please action this request and update the licence records in the AI Hub admin dashboard.',
      ].filter(Boolean).join('\n');

      const ccParam = approverEmail ? '&cc=' + encodeURIComponent(approverEmail) : '';
      window.open(
        'mailto:aiteam@miroma.com' + ccParam +
        '?subject=' + encodeURIComponent(subject) +
        '&body='    + encodeURIComponent(body)
      );

      onboardingForm.innerHTML = `
        <div class="form-success">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <p class="form-success__title">Request submitted</p>
          <p class="form-success__body">Your email client should have opened with a draft — please send it to complete the request. If it didn't open, contact <a href="mailto:aiteam@miroma.com">aiteam@miroma.com</a> directly.</p>
        </div>`;
    });
  }
})();

/* === Use case finder dismiss === */
(function initUcFinder() {
  const finder  = document.getElementById('ucFinder');
  const dismiss = document.getElementById('ucFinderDismiss');
  if (!finder || !dismiss) return;
  if (localStorage.getItem('miroma_hub_uc_finder_dismissed')) {
    finder.classList.add('is-hidden');
    return;
  }
  dismiss.addEventListener('click', () => {
    finder.classList.add('is-hidden');
    localStorage.setItem('miroma_hub_uc_finder_dismissed', '1');
  });
})();

/* === Use case drawer === */
(function initUseCaseDrawer() {
  if (typeof USE_CASES === 'undefined') return;

  const overlay  = document.getElementById('ucOverlay');
  const drawer   = document.getElementById('ucDrawer');
  const body     = document.getElementById('ucDrawerBody');
  const btnClose = document.getElementById('ucDrawerClose');
  const btnX     = document.getElementById('ucDrawerCloseX');
  if (!overlay || !drawer || !body) return;

  let _activeUc = null;

  // ── Helpers ──────────────────────────────────────────

  function openDrawer(uc) {
    _activeUc = uc;
    body.innerHTML = buildContent(uc);
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    drawer.scrollTop = 0;
    drawer.querySelector('.uc-copy-btn')?.addEventListener('click', onCopy);
    bindVariables(uc);
    if (uc.type !== 'custom-build') bindSocial(uc);
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function findUseCase(cardTitle) {
    const t = cardTitle.trim();
    return USE_CASES.find(uc => uc.title === t) || null;
  }

  // ── Content builder ───────────────────────────────────

  const TOOL_LINKS = {
    'Claude':      'https://claude.ai/',
    'LTX Studio':  'https://app.ltx.studio/',
    'Descript':    'https://web.descript.com/',
    'Springboards':'https://springboards.ai/',
    'Fireflies':   'https://app.fireflies.ai/',
  };

  const BUILD_STATUS_LABELS = { live: 'Live', dev: 'In Development', scoping: 'In Scoping' };

  function buildContent(uc) {
    // A-L-4: use-case content is runtime-authored (admin editor) once the
    // Firestore upgrade lands, so every interpolation below is escaped.
    const descHtml = String(uc.description || '')
      .split('\n\n')
      .map(p => `<p>${escHtml(p)}</p>`)
      .join('');

    // ── Custom Build ──────────────────────────────────────────────────────
    if (uc.type === 'custom-build') {
      const statusLabel = BUILD_STATUS_LABELS[uc.status] || '';
      const statusHtml  = statusLabel
        ? `<span class="uc-build-status uc-build-status--${uc.status}">${statusLabel}</span>` : '';
      const agenciesHtml = (uc.agencies || [])
        .map(a => `<span class="tag">${escHtml(a)}</span>`).join('');
      const demoHtml = uc.demoUrl
        ? `<a href="${escAttr(uc.demoUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline" style="margin-top:8px;margin-right:8px;">Watch Demo →</a>` : '';
      return `
        <div class="uc-drawer__meta">
          <span class="tag">${escHtml(uc.category.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))}</span>
          <span class="tag tag--build">Our Build</span>
          ${statusHtml}
        </div>
        ${agenciesHtml ? `<div class="uc-build-agencies-drawer">${agenciesHtml}</div>` : ''}
        <h2 class="uc-drawer__title">${escHtml(uc.title)}</h2>
        <div class="uc-drawer__desc">${descHtml}</div>
        <div style="margin-top:16px;">
          ${demoHtml}
          <a href="${escAttr(uc.requestUrl || '#')}" class="btn btn--primary" style="margin-top:8px;">Request Access →</a>
        </div>`;
    }

    // ── Prompt / Workflow ─────────────────────────────────────────────────
    const toolUrl  = TOOL_LINKS[uc.tool] || '#';
    const tagsHtml = `
      <span class="tag">${escHtml(uc.category)}</span>
      <span class="tag tag--dark">${escHtml(uc.tool)}</span>`;

    let actionHtml = '';
    if (uc.type === 'prompt') {
      const varsHtml = uc.variables?.length ? `
        <div class="uc-vars">
          <p class="uc-vars__title">Customise your prompt</p>
          <div class="uc-vars__grid">
            ${uc.variables.map(v => `
              <div class="uc-var-field">
                <label for="uc-var-${escAttr(v.id)}">${escHtml(v.label)}</label>
                <input id="uc-var-${escAttr(v.id)}" class="uc-var-input" data-var-id="${escAttr(v.id)}" type="text" placeholder="${escAttr(v.label)}…">
              </div>`).join('')}
          </div>
        </div>` : '';

      actionHtml = `
        <div class="uc-drawer__section">
          <p class="uc-drawer__section-label">Copy-paste prompt</p>
          ${varsHtml}
          <div class="uc-prompt-box">
            <div class="uc-prompt-box__inner">
              <pre class="uc-prompt-box__text">${escHtml(uc.prompt)}</pre>
            </div>
            <div class="uc-prompt-box__footer">
              <button class="uc-copy-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy prompt
              </button>
            </div>
          </div>
        </div>`;
    } else if (uc.type === 'workflow' && uc.steps?.length) {
      const stepsHtml = uc.steps.map(s => `<li>${escHtml(s)}</li>`).join('');
      // Scheme-validate before the href lands in an attribute (A-H-1 standard
      // — runtime-authored URLs must never carry javascript: etc.).
      const safeTutorial = /^https:\/\//i.test(String(uc.tutorialUrl || '').trim()) ? String(uc.tutorialUrl).trim() : '';
      const tutorialBtn = safeTutorial ? `
        <a href="${escAttr(safeTutorial)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline" style="margin-top:16px;display:inline-block;">LTX Tutorial →</a>` : '';
      actionHtml = `
        <div class="uc-drawer__section">
          <p class="uc-drawer__section-label">How to use it</p>
          <ol class="uc-workflow">${stepsHtml}</ol>
          ${tutorialBtn}
        </div>`;
    }

    const socialHtml = `
      <div class="uc-social-bar">
        <button class="uc-react-btn" aria-label="Like this use case">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="uc-react-label">Like</span>
        </button>
        <button class="uc-used-btn" aria-label="I used this">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>I used this</span>
        </button>
      </div>
      <p class="uc-likers" hidden></p>
      <div class="uc-usage-form" hidden>
        <div class="uc-usage-form__row">
          <p class="uc-usage-form__label">How much time does this save each time?</p>
          <div class="uc-time-custom__inputs">
            <input type="number" class="uc-time-custom__hrs" min="0" max="99" placeholder="0" aria-label="Hours">
            <span class="uc-time-custom__unit">hrs</span>
            <input type="number" class="uc-time-custom__mins" min="0" max="59" placeholder="0" aria-label="Minutes">
            <span class="uc-time-custom__unit">min</span>
          </div>
        </div>
        <div class="uc-usage-form__row">
          <p class="uc-usage-form__label">How many times a month do you do this?</p>
          <div class="uc-time-custom__inputs">
            <input type="number" class="uc-freq-custom" min="1" max="99" placeholder="0" aria-label="Times per month">
            <span class="uc-time-custom__unit">times / month</span>
          </div>
        </div>
        <button class="uc-usage-submit btn btn--primary btn--sm" disabled>Log it →</button>
      </div>`;

    // Video embeds render in an iframe, so they get a strict allowlist:
    // only the hosts already permitted by the site's CSP frame-src (same
    // standard as safeEmbed in whats-new.js). Anything else is dropped.
    const safeVideo = safeEmbedUrl(uc.video);
    const videoHtml = safeVideo ? `
      <div class="uc-drawer__section">
        <p class="uc-drawer__section-label">Watch it in action</p>
        <div class="uc-drawer__video">
          <iframe src="${escAttr(safeVideo)}" allowfullscreen loading="lazy"></iframe>
        </div>
      </div>` : '';

    return `
      <div class="uc-drawer__meta">${tagsHtml}</div>
      <h2 class="uc-drawer__title">${escHtml(uc.title)}</h2>
      <div class="uc-drawer__desc">${descHtml}</div>
      <div class="uc-drawer__actions">
        <a href="${toolUrl}" target="_blank" rel="noopener noreferrer" class="btn btn--primary">
          Launch ${escHtml(uc.tool)} →
        </a>
        ${socialHtml}
      </div>
      ${actionHtml}
      ${videoHtml}`;
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function escAttr(str) {
    return escHtml(str);
  }
  function safeEmbedUrl(url) {
    url = String(url || '').trim();
    return /^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|www\.loom\.com|share\.descript\.com)\//i.test(url) ? url : '';
  }

  // ── Social bar binding (reactions + "I used this") ───

  function bindSocial(uc) {
    const email = (typeof hubGetEmail === 'function') ? hubGetEmail() : '';
    // Firestore-authored use cases carry an immutable stored slug; static
    // entries derive it from the title (identical for unedited titles).
    const slug  = uc.slug || (typeof titleToSlug === 'function' ? titleToSlug(uc.title) : '');
    const likersEl = body.querySelector('.uc-likers');

    // Reaction button
    const reactBtn = body.querySelector('.uc-react-btn');
    if (reactBtn) {
      const eng = window._ucEngagement;
      const rData = eng?.reactions?.[slug];
      if (rData) {
        _applyReactState(reactBtn, rData.count, rData.userReacted);
        _applyLikers(likersEl, rData.count, rData.userReacted);
      }
      if (email) {
        reactBtn.addEventListener('click', async () => {
          if (reactBtn.dataset.pending) return;
          reactBtn.dataset.pending = '1';

          // Optimistic update — apply immediately so it feels instant.
          // Post-S-4 we no longer track individual likers client-side,
          // so the optimistic state is purely (count, userReacted).
          const wasReacted   = reactBtn.classList.contains('is-reacted');
          const prevCountEl  = reactBtn.querySelector('.uc-react-count');
          const prevCount    = parseInt(prevCountEl?.textContent || '0', 10);
          const optCount     = wasReacted ? Math.max(0, prevCount - 1) : prevCount + 1;
          _applyReactState(reactBtn, optCount, !wasReacted);
          _applyLikers(likersEl, optCount, !wasReacted);

          try {
            const { count, userReacted } = await fsToggleReaction(email, uc.title, uc.slug);
            // Confirm with server values
            _applyReactState(reactBtn, count, userReacted);
            _applyLikers(likersEl, count, userReacted);
            if (window._ucEngagement) window._ucEngagement.reactions[slug] = { count, userReacted };
            _updateCardReaction(uc.title, count, userReacted);
          } catch (_) {
            // Revert on failure
            _applyReactState(reactBtn, prevCount, wasReacted);
            _applyLikers(likersEl, prevCount, wasReacted);
            window.hubToast?.("Couldn't save your reaction — please check your connection and try again.");
          } finally { delete reactBtn.dataset.pending; }
        });
      } else { reactBtn.style.display = 'none'; }
    }

    // "I used this" button — decoupled from time/frequency form
    const usedBtn   = body.querySelector('.uc-used-btn');
    const usageForm = body.querySelector('.uc-usage-form');
    const submitBtn = body.querySelector('.uc-usage-submit');
    const hrsEl     = body.querySelector('.uc-time-custom__hrs');
    const minsEl    = body.querySelector('.uc-time-custom__mins');
    const freqEl    = body.querySelector('.uc-freq-custom');

    function getMinutes() {
      const hrs  = Math.max(0, parseInt(hrsEl?.value  || '0', 10) || 0);
      const mins = Math.max(0, Math.min(59, parseInt(minsEl?.value || '0', 10) || 0));
      return (hrs * 60) + mins;
    }

    function getFreq() {
      return Math.max(1, parseInt(freqEl?.value || '0', 10) || 0);
    }

    function updateSubmitState() {
      if (submitBtn) submitBtn.disabled = !(getMinutes() > 0 && (parseInt(freqEl?.value || '0', 10) > 0));
    }

    function markLogged() {
      usedBtn.dataset.done = '1';
      usedBtn.classList.add('is-done');
      const label = usedBtn.querySelector('span:last-child');
      if (label) label.textContent = 'Thanks — logged!';
      usageForm.hidden = true;
    }

    if (usedBtn && usageForm && email) {
      usedBtn.addEventListener('click', () => {
        if (usedBtn.dataset.done) return;
        usageForm.hidden = false;
      });

      [hrsEl, minsEl, freqEl].forEach(el => el?.addEventListener('input', updateSubmitState));

      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          const minutes = getMinutes();
          const freq    = getFreq();
          if (!minutes || !freq) return;
          markLogged();
          await fsLogUsage(email, uc.title, uc.category, uc.tool, minutes, freq).catch(() => {});
        });
      }
    } else if (usedBtn && !email) { usedBtn.style.display = 'none'; }
  }

  function _applyReactState(btn, count, userReacted) {
    btn.classList.toggle('is-reacted', userReacted);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', userReacted ? 'currentColor' : 'none');
    const label = btn.querySelector('.uc-react-label');
    if (label) label.textContent = userReacted ? 'Liked' : 'Like';
    let countEl = btn.querySelector('.uc-react-count');
    if (count > 0) {
      if (!countEl) { countEl = document.createElement('span'); countEl.className = 'uc-react-count'; btn.insertBefore(countEl, label); }
      countEl.textContent = count;
    } else { countEl?.remove(); }
  }

  function _emailToName(email) {
    const local = (email || '').split('@')[0];
    return local.split(/[.\-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  // Pre-S-4 this function received the full `users` array of who reacted
  // and rendered named avatars ("Vix and Ben liked this"). The S-4 fix in
  // requests.js stops returning per-user identities (privacy) and only
  // gives count + own-state. Likers display degrades accordingly:
  //   you alone reacted    → "You liked this"
  //   you + others         → "You and N others liked this"
  //   only others reacted  → "N people liked this"
  //   nobody               → hidden
  function _applyLikers(el, count, userReacted) {
    if (!el) return;
    const total = count || 0;
    if (total === 0) { el.hidden = true; return; }
    let text;
    if (userReacted) {
      const others = total - 1;
      if (others <= 0) {
        text = 'You liked this';
      } else {
        text = 'You and ' + others + ' other' + (others > 1 ? 's' : '') + ' liked this';
      }
    } else {
      text = total === 1 ? '1 person liked this' : total + ' people liked this';
    }
    el.textContent = text;
    el.hidden = false;
  }

  function _updateCardReaction(title, count, userReacted) {
    const card = [...document.querySelectorAll('.uc-card')].find(
      c => c.querySelector('.uc-card__title')?.textContent?.trim() === title
    );
    if (!card) return;
    const btn = card.querySelector('.uc-react-btn');
    if (btn) _applyReactState(btn, count, userReacted);
  }

  // ── Variable binding ──────────────────────────────────

  function bindVariables(uc) {
    if (!uc.variables?.length) return;
    const inputs   = body.querySelectorAll('.uc-var-input');
    const promptEl = body.querySelector('.uc-prompt-box__text');
    if (!inputs.length || !promptEl) return;

    function applyVars() {
      let text = uc.prompt;
      inputs.forEach(inp => {
        const val = inp.value;
        if (val) text = text.split('{{' + inp.dataset.varId + '}}').join(val);
      });
      promptEl.textContent = text;
    }

    inputs.forEach(inp => inp.addEventListener('input', applyVars));
  }

  // ── Copy handler ──────────────────────────────────────

  function onCopy(e) {
    const btn    = e.currentTarget;
    const preEl  = btn.closest('.uc-prompt-box')?.querySelector('.uc-prompt-box__text');
    const prompt = preEl ? preEl.textContent.trim() : '';
    navigator.clipboard.writeText(prompt).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Copied!`;
      btn.classList.add('is-copied');
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.classList.remove('is-copied');
        btn.addEventListener('click', onCopy, { once: true });
      }, 2200);

      if (_activeUc && typeof fsLogPromptCopy === 'function') {
        const email = (typeof hubGetEmail === 'function') ? hubGetEmail() : '';
        if (email) fsLogPromptCopy(email, _activeUc.title, _activeUc.category, _activeUc.tool).catch(() => {});
      }

      // Non-blocking nudge to share a commercial win
      const existing = btn.closest('.uc-prompt-box')?.querySelector('.saw-nudge');
      if (!existing) {
        const nudge = document.createElement('p');
        nudge.className = 'saw-nudge';
        nudge.innerHTML = 'Used this on a real project? <a href="share-a-win.html">Tell us about the win →</a>';
        btn.closest('.uc-prompt-box')?.appendChild(nudge);
        setTimeout(() => nudge.classList.add('saw-nudge--visible'), 50);
        setTimeout(() => {
          nudge.classList.remove('saw-nudge--visible');
          setTimeout(() => nudge.remove(), 400);
        }, 6000);
      }
    });
  }

  // ── Card wiring ───────────────────────────────────────

  const DPIA_LABELS = {
    'dpia-required': { label: '🔴 DPIA Required', cls: 'uc-dpia-badge--dpia-required' },
    'legal-review':  { label: '🟠 Legal Review',  cls: 'uc-dpia-badge--legal-review'  },
    'client-check':  { label: '🟡 Client Check',  cls: 'uc-dpia-badge--client-check'  },
    'standard':      { label: '🟢 Standard',       cls: 'uc-dpia-badge--standard'      },
  };

  // Idempotent so it can safely re-run after the grid is rebuilt from
  // Firestore content (use-cases-content.js).
  function decorateCard(card) {
    // Inject DPIA badge from USE_CASES data
    if (typeof USE_CASES !== 'undefined' && !card.querySelector('.uc-dpia-badge')) {
      const title = card.querySelector('.uc-card__title')?.textContent?.trim() || '';
      const uc = USE_CASES.find(u => u.title === title);
      if (uc && uc.dpia && uc.dpia !== 'standard' && DPIA_LABELS[uc.dpia]) {
        const badge = document.createElement('span');
        badge.className = 'uc-dpia-badge ' + DPIA_LABELS[uc.dpia].cls;
        badge.textContent = DPIA_LABELS[uc.dpia].label;
        const body = card.querySelector('.uc-card__body');
        if (body) body.appendChild(badge);
      }
    }

    // Add "View →" affordance to footer (not on the submit card)
    const footer = card.querySelector('.uc-card__footer');
    if (footer && !card.classList.contains('uc-card--submit') && !footer.querySelector('.uc-card__view')) {
      const viewLink = document.createElement('span');
      viewLink.className = 'uc-card__view';
      viewLink.innerHTML = `View
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      footer.appendChild(viewLink);
    }
  }

  document.querySelectorAll('.uc-card').forEach(decorateCard);
  window._ucDecorateCards = function () {
    document.querySelectorAll('.uc-card').forEach(decorateCard);
  };

  // Open-drawer handler is delegated to the document so cards added after
  // initial load (the Firestore-rendered grid) work without re-binding.
  // Buttons inside cards (e.g. the reaction heart) call stopPropagation,
  // which prevents the event reaching here — same behaviour as before.
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.uc-card');
    if (!card || card.classList.contains('uc-card--submit')) return;
    const title = card.querySelector('.uc-card__title')?.textContent || '';
    const uc = findUseCase(title);
    if (uc) openDrawer(uc);
  });

  // ── Close handlers ────────────────────────────────────

  btnClose?.addEventListener('click', closeDrawer);
  btnX?.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });
})();

/* === Metrics strip === */
(function initMetricsStrip() {
  if (!document.getElementById('ucMetrics') || typeof USE_CASES === 'undefined') return;
  const prompts = USE_CASES.filter(u => u.type !== 'custom-build').length;
  const builds  = USE_CASES.filter(u => u.type === 'custom-build').length;
  const el = id => document.getElementById(id);
  if (el('metricPrompts')) el('metricPrompts').textContent = prompts;
  if (el('metricBuilds'))  el('metricBuilds').textContent  = builds;
})();

/* === Use case engagement (reactions, usage, copy counts) === */
(function initEngagement() {
  if (!document.getElementById('ucGrid')) return;
  window._ucEngagement = { reactions: {}, usage: {}, copies: {} };

  let _email = '';

  // Re-render hook for use-cases-content.js: after the grid is rebuilt from
  // Firestore content, re-apply the (already fetched) engagement data to the
  // new cards. No-op until the mirAuthReady fetch below has run.
  window._ucRenderEngagement = function () { _renderEngagement(_email); };

  document.addEventListener('mirAuthReady', async (e) => {
    // M-3: prefer the email from the event detail (Firebase Auth-confirmed);
    // fall back to firebase.auth().currentUser via hubGetEmail() rather than
    // the previous localStorage lookup (which would now return '1' anyway).
    const email = e.detail?.email || (typeof hubGetEmail === 'function' ? hubGetEmail() : '');
    _email = email;
    try {
      const [reactions, usage, copies] = await Promise.all([
        typeof fsGetAllReactions     === 'function' ? fsGetAllReactions(email) : Promise.resolve({}),
        typeof fsGetUsageSummary     === 'function' ? fsGetUsageSummary()      : Promise.resolve({}),
        typeof fsGetCopyCountSummary === 'function' ? fsGetCopyCountSummary()  : Promise.resolve({}),
      ]);
      window._ucEngagement = { reactions, usage, copies };
      _renderEngagement(email);
    } catch (err) { console.warn('initEngagement error:', err); }
  });

  function _renderEngagement(email) {
    if (typeof USE_CASES === 'undefined') return;
    const { reactions, usage, copies } = window._ucEngagement;
    USE_CASES.forEach(uc => {
      if (uc.type === 'custom-build') return;
      const card = [...document.querySelectorAll('.uc-card')].find(
        c => c.querySelector('.uc-card__title')?.textContent?.trim() === uc.title
      );
      if (!card) return;
      const slug = uc.slug || (typeof titleToSlug === 'function' ? titleToSlug(uc.title) : '');
      const rData  = reactions[slug] || { count: 0, userReacted: false };
      const uData  = usage[uc.title] || { count: 0 };
      const cCount = copies[uc.title] || 0;
      if (rData.count === 0 && uData.count === 0 && cCount === 0) return;

      let bar = card.querySelector('.uc-card__engagement');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'uc-card__engagement';
        card.querySelector('.uc-card__body')?.appendChild(bar);
      }
      bar.innerHTML = '';

      // Reaction button
      const reactBtn = document.createElement('button');
      reactBtn.className = 'uc-react-btn' + (rData.userReacted ? ' is-reacted' : '');
      reactBtn.title = rData.userReacted ? 'Unlike' : 'Like';
      reactBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="${rData.userReacted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${rData.count > 0 ? '<span class="uc-react-count">' + rData.count + '</span>' : ''}`;
      reactBtn.addEventListener('click', evt => {
        evt.stopPropagation();
        if (!email || reactBtn.disabled) return;
        reactBtn.disabled = true;
        fsToggleReaction(email, uc.title, uc.slug).then(({ count, userReacted }) => {
          const svgEl = reactBtn.querySelector('svg');
          if (svgEl) svgEl.setAttribute('fill', userReacted ? 'currentColor' : 'none');
          reactBtn.classList.toggle('is-reacted', userReacted);
          reactBtn.title = userReacted ? 'Unlike' : 'Like';
          let cEl = reactBtn.querySelector('.uc-react-count');
          if (count > 0) {
            if (!cEl) { cEl = document.createElement('span'); cEl.className = 'uc-react-count'; reactBtn.appendChild(cEl); }
            cEl.textContent = count;
          } else { cEl?.remove(); }
          if (window._ucEngagement) window._ucEngagement.reactions[slug] = { count, userReacted };
        }).catch(() => {
          window.hubToast?.("Couldn't save your reaction — please check your connection and try again.");
        }).finally(() => { reactBtn.disabled = false; });
      });
      bar.appendChild(reactBtn);

      if (cCount > 0) {
        const s = document.createElement('span');
        s.className = 'uc-eng-stat';
        s.textContent = cCount + (cCount === 1 ? ' copy' : ' copies');
        bar.appendChild(s);
      }
      if (uData.count > 0) {
        const s = document.createElement('span');
        s.className = 'uc-eng-stat';
        s.textContent = uData.count + ' used';
        bar.appendChild(s);
      }
    });
  }
})();

/* === Video watched tracking === */
(function initWatchedTracking() {
  if (!document.querySelector('.video-grid')) return;

  const STORAGE_KEY = 'miroma_hub_watched';
  const watched = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));

  function extractId(card) {
    const thumb = card.querySelector('.video-card__thumb');
    if (thumb) {
      const m = (thumb.getAttribute('href') || '').match(/[?&]v=([^&]+)/);
      return m ? m[1] : null;
    }
    const iframe = card.querySelector('iframe');
    if (iframe) {
      const src = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
      const parts = src.split('/');
      const last = parts[parts.length - 1].split('?')[0];
      return last || null;
    }
    return null;
  }

  function updatePanel(panel) {
    const cards = panel.querySelectorAll('.video-card');
    let count = 0;
    cards.forEach(card => {
      const id = extractId(card);
      if (id && watched.has(id)) { card.classList.add('is-watched'); count++; }
    });
    const el = panel.querySelector('.module-watched');
    if (el) {
      const total = cards.length;
      el.textContent = count + ' / ' + total + ' watched';
      el.classList.toggle('is-complete', count === total && total > 0);
    }
  }

  function markWatched(card) {
    const id = extractId(card);
    if (!id || watched.has(id)) return;
    watched.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...watched]));
    card.classList.add('is-watched');
    const panel = card.closest('.tab-panel');
    if (panel) updatePanel(panel);
  }

  // Mark as watched when user clicks a YouTube link or plays an embed
  document.querySelectorAll('.video-card').forEach(card => {
    const thumb = card.querySelector('.video-card__thumb');
    const embed = card.querySelector('.video-card__embed');
    if (thumb) thumb.addEventListener('click', () => markWatched(card));
    if (embed) embed.addEventListener('click', () => markWatched(card));
  });

  // Initialise display from saved state
  document.querySelectorAll('.tab-panel').forEach(updatePanel);
})();

/* === Form select placeholder colour === */
(function formSelectState() {
  document.querySelectorAll('.form-field select').forEach(sel => {
    const update = () => sel.classList.toggle('has-value', sel.selectedIndex > 0);
    update();
    sel.addEventListener('change', update);
  });
})();
