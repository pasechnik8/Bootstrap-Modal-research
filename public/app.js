// Import the actual unminified Bootstrap component: source breakpoints work directly.
import Modal from '/vendor/bootstrap/js/src/modal.js';

const $ = id => document.getElementById(id);
const element = $('studyModal');
const controls = ['keyboard', 'focus', 'animation', 'backdrop', 'preventShow', 'preventHide'];
const events = [];
let instance;
let generation = 0;
let lastJsOpener = null;
let start = performance.now();
// Our guard extends the component through a public event; it is not Bootstrap config.
let guardShow = false;
let guardHide = false;
let busy = false;

function snapshot() {
  const current = Modal.getInstance(element);
  return {
    version: Modal.VERSION,
    generation,
    registered: Boolean(current),
    _isShown: current?._isShown ?? null,
    _isTransitioning: current?._isTransitioning ?? null,
    focusTrapActive: current?._focustrap?._isActive ?? false,
    bodyModalOpen: document.body.classList.contains('modal-open'),
    backdropCount: document.querySelectorAll('.modal-backdrop').length,
    activeElement: document.activeElement?.id || document.activeElement?.tagName,
    ariaModal: element.getAttribute('aria-modal'),
    config: current ? { ...current._config } : null
  };
}

function refresh() {
  const s = snapshot();
  $('phase').textContent = !s.registered ? 'Экземпляр удалён' : busy ? s._isShown ? 'Открывается / открыто' : 'Закрывается' : 'Скрыто';
  if (s._isShown && !s._isTransitioning) $('phase').textContent = 'Открыто';
  $('flags').textContent = `isShown=${s._isShown} · isTransitioning=${s._isTransitioning}`;
  $('state').textContent = JSON.stringify(s, null, 2);
  $('settings').disabled = busy;
  for (const id of ['openJs', 'openData', 'race', 'sameInstance', 'dispose', 'reset']) $(id).disabled = busy;
}

function log(name, detail = '') {
  const entry = { n: events.length + 1, ms: Math.round(performance.now() - start), name, detail, state: snapshot() };
  events.push(entry);
  const li = document.createElement('li');
  const number = document.createElement('span'); number.className = 'event-number'; number.textContent = String(entry.n).padStart(2, '0');
  const content = document.createElement('div');
  const title = document.createElement('code'); title.textContent = name;
  const description = document.createElement('small'); description.textContent = `${entry.ms} мс · ${detail}`;
  content.append(title, description); li.append(number, content); $('journal').append(li);
  $('miniJournal').replaceChildren(...events.slice(-4).map(e => {
    const item = document.createElement('li'); item.textContent = `${e.n}. ${e.name}`; return item;
  }));
  refresh();
}

function configuration() {
  const backdrop = $('backdrop').value;
  return { keyboard: $('keyboard').checked, focus: $('focus').checked, backdrop: backdrop === 'static' ? 'static' : backdrop === 'true' };
}

function recreate() {
  if (busy) return;
  // Dispose only after hidden: dispose() is not a substitute for hide().
  Modal.getInstance(element)?.dispose();
  element.classList.toggle('fade', $('animation').checked);
  guardShow = $('preventShow').checked;
  guardHide = $('preventHide').checked;
  $('guardInside').checked = guardHide;
  const config = configuration();
  // Keep Data API recreation after dispose consistent with the selected controls.
  for (const [key, value] of Object.entries(config)) element.setAttribute(`data-bs-${key}`, String(value));
  instance = new Modal(element, config);
  generation++;
  log('new Modal()', JSON.stringify(configuration()));
  $('notice').textContent = `Экземпляр №${generation}. Новые настройки применены.`;
}

function ensureInstance() {
  if (!Modal.getInstance(element)) recreate();
  return Modal.getInstance(element);
}

// Listeners stay on the DOM element across instance recreation.
// Native addEventListener is separate from Bootstrap's own event registry.
for (const name of ['show', 'shown', 'hide', 'hidden', 'hidePrevented']) {
  element.addEventListener(`${name}.bs.modal`, event => {
    if (name === 'show') {
      const registered = Modal.getInstance(element);
      if (registered !== instance) { instance = registered; generation++; }
      $('modalHint').textContent = '';
      if (guardShow) event.preventDefault();
      else busy = true;
    }
    if (name === 'hide' && guardHide) {
      event.preventDefault();
      $('modalHint').textContent = 'Закрытие отменено нашим обработчиком hide.bs.modal. Выключите флажок ниже поля.';
    }
    if (name === 'hidePrevented') {
      $('modalHint').textContent = 'Настройки Bootstrap не разрешают это закрытие. Событие hide.bs.modal не запускалось.';
    }
    if (name === 'hidden') busy = false;
    log(event.type, `defaultPrevented=${event.defaultPrevented}; shown=${instance?._isShown}; transitioning=${instance?._isTransitioning}`);
    if (name === 'hidden' && lastJsOpener) {
      // Data API restores focus itself. For programmatic opening it is our responsibility.
      lastJsOpener.focus(); lastJsOpener = null;
    }
    queueMicrotask(refresh);
  });
}

for (const id of controls) $(id).addEventListener('change', recreate);
$('guardInside').addEventListener('change', event => {
  guardHide = event.target.checked;
  $('preventHide').checked = guardHide;
  $('modalHint').textContent = guardHide ? 'Закрытие будет отменяться обработчиком события.' : 'Отмена отключена. Теперь окно можно закрыть.';
  log('app:guardHide', String(guardHide));
});
$('openJs').addEventListener('click', event => {
  lastJsOpener = event.currentTarget;
  const current = ensureInstance();
  log('caller:before show()');
  current.show(event.currentTarget);
  log('caller:after show()', 'show() не возвращает Promise');
});
$('openData').addEventListener('click', () => {
  lastJsOpener = null;
  log('click:data-bs-toggle', 'Дальше событие всплывает до обработчика Bootstrap на document');
});
$('closeJs').addEventListener('click', () => {
  log('caller:before hide()');
  Modal.getInstance(element)?.hide();
  log('caller:after hide()');
});
$('race').addEventListener('click', event => {
  lastJsOpener = event.currentTarget;
  const current = ensureInstance();
  log('caller:show(); hide()', 'Два последовательных вызова без ожидания');
  current.show(event.currentTarget);
  current.hide();
  log('caller:after immediate hide()', `transitioning=${current._isTransitioning}`);
});
$('sameInstance').addEventListener('click', () => {
  const first = ensureInstance();
  const second = Modal.getOrCreateInstance(element, { keyboard: !first._config.keyboard });
  log('getOrCreateInstance()', `Тот же объект: ${first === second}; keyboard осталось ${second._config.keyboard}. Новая конфигурация не применена.`);
});
$('dispose').addEventListener('click', () => {
  Modal.getInstance(element)?.dispose();
  instance = null;
  log('dispose()', `getInstance(element) = ${Modal.getInstance(element)}`);
  $('notice').textContent = 'Экземпляр удалён. Следующее открытие создаст новый.';
});
$('clearLog').addEventListener('click', () => {
  events.length = 0; start = performance.now(); $('journal').replaceChildren(); $('miniJournal').replaceChildren();
});
$('reset').addEventListener('click', () => {
  for (const id of ['keyboard', 'focus', 'animation']) $(id).checked = true;
  for (const id of ['preventShow', 'preventHide']) $(id).checked = false;
  $('backdrop').value = 'true';
  $('clearLog').click(); recreate();
});
document.addEventListener('focusin', () => queueMicrotask(refresh));

recreate();
// Read-only observability for DevTools and integration tests. The UI uses the same code.
window.modalLab = { snapshot, events, get instance() { return Modal.getInstance(element); }, Modal };
