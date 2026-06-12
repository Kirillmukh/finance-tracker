// Footer module — "liquid glass" behaviors for the bottom nav:
// 1. Sliding indicator pill behind the active tab.
// 2. Quick flick on the bar switches tabs relative to the swipe direction.
// 3. Hold & drag: the pill follows the finger; release picks the tab under it.
// 4. Compact mode: bar shrinks on scroll down, expands on scroll up / touch.

// Fraction of one tab slot a flick must travel to commit a switch on release.
const SWIPE_COMMIT_RATIO = 0.3;
// Gestures shorter than this are flicks (relative); longer are positional drags.
const FLICK_MS = 300;
// Finger travel (px) before a touch is treated as a drag rather than a tap.
const DRAG_START_PX = 6;
// Bubble stretch per px of finger velocity (px per pointermove event), and its cap.
const STRETCH_PER_PX = 0.01;
const MAX_STRETCH = 1.25;
// Accumulated scroll (px) before compact state toggles — filters out jitter.
const SCROLL_DELTA = 8;
// Never compact near the top of the page.
const SCROLL_MIN_Y = 60;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function setupFooter(navigation, doc = document, win = window) {
  const nav = doc.querySelector('.bottom-nav');
  if (!nav) return null;

  const items = [...nav.querySelectorAll('.nav-item')];
  const pages = items.map((item) => item.getAttribute('data-page'));

  const indicator = doc.createElement('span');
  indicator.className = 'nav-indicator';
  nav.prepend(indicator);

  const activeIndex = () => {
    const index = items.findIndex((item) => item.classList.contains('active'));
    return index === -1 ? 0 : index;
  };

  // offset is in slot units; translateX is relative to the indicator's own
  // width (one slot), so offset * 100% lands exactly on slot N.
  // stretch — «пузырь»: растяжение по X со сплющиванием по Y (объём сохраняется).
  const setIndicator = (offset, animate, stretch = 1) => {
    indicator.classList.toggle('nav-indicator--drag', !animate);
    indicator.style.transform =
      `translateX(${offset * 100}%) scale(${stretch}, ${1 / stretch})`;
  };

  const updateIndicator = () => setIndicator(activeIndex(), true);

  // Navigation's own click handlers run first (registered earlier) and set
  // the .active class — here we only re-sync the indicator afterwards.
  items.forEach((item) => item.addEventListener('click', updateIndicator));
  updateIndicator();

  // Во время драга подсвечена только вкладка под пилюлей (index = -1 — снять)
  const setBubbleTarget = (index) => {
    items.forEach((item, i) => item.classList.toggle('in-bubble', i === index));
  };

  // --- Swipe / hold-drag on the bar to switch tabs ---
  let startX = null;
  let startTime = 0;
  let dragging = false;
  let suppressClick = false;
  let lastMoveX = 0;
  let velocity = 0; // сглаженная скорость пальца, px за событие pointermove

  const slotWidth = () => nav.clientWidth / items.length || 1;
  // Swipe left = move to the tab on the right, hence the sign flip.
  const flickProgress = (e) => -(e.clientX - startX) / slotWidth();
  // Slot offset of the tab currently under the finger (continuous, in slot units).
  const fingerOffset = (clientX) => {
    const rect = nav.getBoundingClientRect();
    const slot = rect.width / items.length || 1;
    return clamp((clientX - rect.left) / slot - 0.5, 0, items.length - 1);
  };

  nav.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startTime = Date.now();
    dragging = false;
    suppressClick = false;
    lastMoveX = e.clientX;
    velocity = 0;
    nav.classList.remove('compact');
  });

  nav.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    if (!dragging && Math.abs(e.clientX - startX) < DRAG_START_PX) return;
    const firstMove = !dragging;
    if (firstMove && nav.setPointerCapture && e.pointerId !== undefined) {
      // Захват только с началом драга: захват на pointerdown ретаргетит
      // последующий click на nav и ломает обычные тапы по вкладкам.
      try { nav.setPointerCapture(e.pointerId); } catch (_) {}
    }
    dragging = true;
    nav.classList.add('dragging');
    velocity = 0.7 * velocity + 0.3 * (e.clientX - lastMoveX);
    lastMoveX = e.clientX;
    const stretch = Math.min(MAX_STRETCH, 1 + Math.abs(velocity) * STRETCH_PER_PX);
    const offset = fingerOffset(e.clientX);
    // Пилюля позиционно следует за пальцем; первый шаг анимируем,
    // чтобы она плавно «подъехала» под палец с активной вкладки.
    setIndicator(offset, firstMove, stretch);
    setBubbleTarget(Math.round(offset));
  });

  const endDrag = (e) => {
    if (startX === null) return;
    const progress = flickProgress(e);
    const elapsed = Date.now() - startTime;
    const wasDragging = dragging;
    startX = null;
    dragging = false;
    nav.classList.remove('dragging');
    setBubbleTarget(-1);
    if (!wasDragging) return;

    suppressClick = true;
    let target;
    if (elapsed < FLICK_MS && Math.abs(progress) >= SWIPE_COMMIT_RATIO) {
      // Быстрый флик — относительный сдвиг от активной вкладки
      const steps = Math.sign(progress) * Math.max(1, Math.round(Math.abs(progress)));
      target = clamp(activeIndex() + steps, 0, items.length - 1);
    } else {
      // Удержание — вкладка, над которой отпустили палец
      target = Math.round(fingerOffset(e.clientX));
    }
    if (target !== activeIndex()) {
      navigation.showPage(pages[target]);
    }
    updateIndicator();
  };

  nav.addEventListener('pointerup', endDrag);
  nav.addEventListener('pointercancel', endDrag);

  // A click fired right after a swipe would re-trigger Navigation's handlers
  // on whatever item the finger ended over — swallow it in the capture phase.
  nav.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  // --- Compact mode on scroll ---
  let lastY = win.scrollY;
  let ticking = false;
  win.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      win.requestAnimationFrame(() => {
        ticking = false;
        const y = win.scrollY;
        if (y <= SCROLL_MIN_Y) {
          lastY = y;
          nav.classList.remove('compact');
          return;
        }
        const dy = y - lastY;
        if (Math.abs(dy) < SCROLL_DELTA) return;
        lastY = y;
        nav.classList.toggle('compact', dy > 0);
      });
    },
    { passive: true }
  );

  return { updateIndicator };
}
