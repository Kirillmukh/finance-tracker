// Footer module — "liquid glass" behaviors for the bottom nav:
// 1. Sliding indicator pill behind the active tab.
// 2. Drag on the bar: the pill follows the finger and the page under it
//    switches LIVE as the pill crosses tabs (no wait for release). A quick
//    short flick nudges one tab in the finger's direction.
// 3. Compact mode: bar shrinks on scroll down, expands on scroll up / touch.

// Fraction of one tab slot a flick must travel to nudge to the adjacent tab.
const SWIPE_COMMIT_RATIO = 0.3;
// Only gestures shorter than this can nudge; longer holds are purely positional.
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

  // --- Drag on the bar: любой контакт задействует слайдер ---
  let startX = null;
  let startTime = 0;
  let tracking = false; // палец ушёл дальше DRAG_START_PX — мгновенное слежение
  let lastMoveX = 0;
  let velocity = 0; // сглаженная скорость пальца, px за событие pointermove

  const slotWidth = () => nav.clientWidth / items.length || 1;
  // Slot offset of the tab currently under the finger (continuous, in slot units).
  const fingerOffset = (clientX) => {
    const rect = nav.getBoundingClientRect();
    const slot = rect.width / items.length || 1;
    return clamp((clientX - rect.left) / slot - 0.5, 0, items.length - 1);
  };

  // Пилюля следует за пальцем, окно под ней переключается живьём,
  // не дожидаясь отпускания — отпускание лишь финализирует выбор.
  const followFinger = (clientX, animate, stretch = 1) => {
    const offset = fingerOffset(clientX);
    setIndicator(offset, animate, stretch);
    const nearest = Math.round(offset);
    setBubbleTarget(nearest);
    if (nearest !== activeIndex()) {
      navigation.showPage(pages[nearest]);
    }
  };

  nav.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startTime = Date.now();
    tracking = false;
    lastMoveX = e.clientX;
    velocity = 0;
    nav.classList.remove('compact');
    nav.classList.add('dragging');
    // Захват на pointerdown безопасен: указательные клики по бару всё равно
    // гасятся capture-обработчиком ниже, выбор делают pointer-события.
    if (nav.setPointerCapture && e.pointerId !== undefined) {
      try { nav.setPointerCapture(e.pointerId); } catch (_) {}
    }
    // Слайдер задействуется с первого касания — пилюля анимированно
    // подъезжает под палец.
    followFinger(e.clientX, true);
  });

  nav.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    // До порога — не слежение, а дрожание пальца: не рвём стартовую анимацию.
    if (!tracking && Math.abs(e.clientX - startX) < DRAG_START_PX) return;
    tracking = true;
    velocity = 0.7 * velocity + 0.3 * (e.clientX - lastMoveX);
    lastMoveX = e.clientX;
    const stretch = Math.min(MAX_STRETCH, 1 + Math.abs(velocity) * STRETCH_PER_PX);
    followFinger(e.clientX, false, stretch);
  });

  nav.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const elapsed = Date.now() - startTime;
    startX = null;
    nav.classList.remove('dragging');
    setBubbleTarget(-1);
    // Коммит всегда совпадает с тем, что видит пользователь: открывается
    // вкладка, над которой пилюля оказалась в момент отпускания.
    let target = Math.round(fingerOffset(e.clientX));
    if (
      target === activeIndex() &&
      elapsed < FLICK_MS &&
      Math.abs(dx) >= slotWidth() * SWIPE_COMMIT_RATIO
    ) {
      // Быстрый короткий флик, не дотянувший до соседнего слота, —
      // дотолкнуть пилюлю на одну вкладку в направлении движения пальца.
      target = clamp(activeIndex() + Math.sign(dx), 0, items.length - 1);
    }
    if (target !== activeIndex()) {
      navigation.showPage(pages[target]);
    }
    updateIndicator();
  });

  // Системная отмена жеста — прибраться без коммита (живое переключение
  // уже показало актуальное окно, пилюля вернётся на активную вкладку).
  nav.addEventListener('pointercancel', () => {
    if (startX === null) return;
    startX = null;
    nav.classList.remove('dragging');
    setBubbleTarget(-1);
    updateIndicator();
  });

  // Указательные клики по бару гасятся всегда: выбор вкладок полностью
  // обрабатывает слайдер на pointer-событиях, ссылки не должны срабатывать.
  // Клавиатурная активация (click с detail 0) проходит к обработчикам
  // Navigation, иначе сломается доступность с клавиатуры.
  nav.addEventListener(
    'click',
    (e) => {
      if (e.detail > 0) {
        e.preventDefault();
        e.stopPropagation();
      }
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
