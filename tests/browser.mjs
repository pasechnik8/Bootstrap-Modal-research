import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from '../scripts/server.mjs';

const server = createServer({ built: process.argv.includes('--dist') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
let browser;
const results = [];
await fs.mkdir('.build', { recursive: true });
try {
  browser = await chromium.launch({ headless: true, ...(channel === 'chromium' ? {} : { channel }) });
  async function check(name, action) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => window.modalLab);
    try { await action(page); assert.deepEqual(errors, []); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    finally { await context.close(); }
  }
  const names = page => page.evaluate(() => modalLab.events.map(e => e.name));
  const opened = page => page.waitForFunction(() => modalLab.snapshot()._isShown && !modalLab.snapshot()._isTransitioning);
  const closed = page => page.waitForFunction(() => !modalLab.snapshot().bodyModalOpen && !modalLab.snapshot()._isShown && !document.querySelector('.modal-backdrop'));

  await check('Жизненный цикл: show → shown → hide → hidden; фон и scroll очищены', async p => {
    await p.click('#openJs'); await opened(p);
    const s = await p.evaluate(() => modalLab.snapshot());
    assert.equal(s.focusTrapActive, true); assert.equal(s.backdropCount, 1); assert.equal(s.ariaModal, 'true');
    await p.screenshot({ path: '.build/modal-open.png', fullPage: true });
    await p.click('#closeJs'); await closed(p);
    assert.deepEqual((await names(p)).filter(n => n.endsWith('.bs.modal')), ['show.bs.modal', 'shown.bs.modal', 'hide.bs.modal', 'hidden.bs.modal']);
    assert.equal(await p.evaluate(() => document.body.style.overflow), '');
    await p.screenshot({ path: '.build/demo.png', fullPage: true });
  });
  await check('При .fade show() возвращается раньше shown', async p => {
    await p.click('#openJs'); await opened(p); const n = await names(p);
    assert.ok(n.indexOf('caller:after show()') < n.indexOf('shown.bs.modal'));
  });
  await check('Без .fade shown вызывается внутри show()', async p => {
    await p.uncheck('#animation'); await p.click('#openJs'); await opened(p); const n = await names(p);
    assert.ok(n.indexOf('shown.bs.modal') < n.indexOf('caller:after show()'));
  });
  await check('Отмена show: фон и состояние не меняются', async p => {
    await p.check('#preventShow'); await p.click('#openJs');
    const s = await p.evaluate(() => modalLab.snapshot());
    assert.equal(s._isShown, false); assert.equal(s.backdropCount, 0); assert.equal(s.bodyModalOpen, false);
    assert.ok(!(await names(p)).includes('shown.bs.modal'));
  });
  await check('Отмена hide не порождает hidePrevented; снятие отмены работает', async p => {
    await p.check('#preventHide'); await p.click('#openJs'); await opened(p); await p.click('#closeJs');
    assert.equal(await p.evaluate(() => modalLab.snapshot()._isShown), true);
    assert.ok(!(await names(p)).includes('hidePrevented.bs.modal'));
    await p.uncheck('#guardInside'); await p.click('#closeJs'); await closed(p);
  });
  await check('keyboard=true: Escape закрывает', async p => {
    await p.click('#openJs'); await opened(p); await p.keyboard.press('Escape'); await closed(p);
  });
  await check('keyboard=false: hidePrevented без hide', async p => {
    await p.uncheck('#keyboard'); await p.click('#openJs'); await opened(p); await p.keyboard.press('Escape');
    await p.waitForFunction(() => modalLab.events.some(e => e.name === 'hidePrevented.bs.modal'));
    assert.equal(await p.evaluate(() => modalLab.snapshot()._isShown), true);
    assert.ok(!(await names(p)).includes('hide.bs.modal'));
  });
  await check('static backdrop не закрывает окно', async p => {
    await p.selectOption('#backdrop', 'static'); await p.click('#openJs'); await opened(p); await p.mouse.click(10, 10);
    await p.waitForFunction(() => modalLab.events.some(e => e.name === 'hidePrevented.bs.modal'));
    assert.equal(await p.evaluate(() => modalLab.snapshot()._isShown), true);
  });
  await check('Обычный фон закрывает; backdrop=false не создаёт затемнение', async p => {
    await p.click('#openJs'); await opened(p); await p.mouse.click(10, 10); await closed(p);
    await p.selectOption('#backdrop', 'false'); await p.click('#openJs'); await opened(p);
    assert.equal(await p.evaluate(() => modalLab.snapshot().backdropCount), 0);
    await p.mouse.click(10, 10); assert.equal(await p.evaluate(() => modalLab.snapshot()._isShown), true);
  });
  await check('FocusTrap возвращает внешний фокус; focus=false отключает его', async p => {
    await p.click('#openJs'); await opened(p);
    await p.evaluate(() => document.getElementById('clearLog').focus());
    assert.equal(await p.evaluate(() => document.getElementById('studyModal').contains(document.activeElement)), true);
    for (let i = 0; i < 9; i++) await p.keyboard.press('Tab');
    assert.equal(await p.evaluate(() => document.getElementById('studyModal').contains(document.activeElement)), true);
    await p.click('#closeJs'); await closed(p); await p.uncheck('#focus'); await p.click('#openJs'); await opened(p);
    await p.evaluate(() => document.getElementById('clearLog').focus());
    assert.equal(await p.evaluate(() => document.activeElement.id), 'clearLog');
  });
  await check('hide() во время открытия игнорируется; без fade проходит', async p => {
    await p.click('#race'); await opened(p); assert.ok(!(await names(p)).includes('hide.bs.modal'));
    await p.click('#closeJs'); await closed(p); await p.click('#reset'); await p.uncheck('#animation'); await p.click('#race'); await closed(p);
    const n = await names(p); assert.ok(n.includes('shown.bs.modal')); assert.ok(n.includes('hidden.bs.modal'));
  });
  await check('Data API открывает, закрывает и возвращает фокус на кнопку', async p => {
    await p.click('#openData'); await opened(p);
    await p.getByRole('button', { name: 'Закрыть через data-bs-dismiss', exact: true }).click(); await closed(p);
    assert.equal(await p.evaluate(() => document.activeElement.id), 'openData');
  });
  await check('getOrCreateInstance возвращает старый объект; dispose удаляет регистрацию', async p => {
    await p.click('#sameInstance');
    assert.match(await p.locator('#journal').innerText(), /Тот же объект: true/);
    await p.click('#dispose'); assert.equal(await p.evaluate(() => modalLab.snapshot().registered), false);
    await p.click('#openData'); await opened(p); assert.equal(await p.evaluate(() => modalLab.snapshot().registered), true);
  });
  await check('Тип конфигурации проверяется; JS options приоритетнее data attributes', async p => {
    const result = await p.evaluate(() => {
      const el = document.createElement('div'); el.innerHTML = '<div class="modal-dialog"></div>'; el.dataset.bsKeyboard = 'false';
      const a = new modalLab.Modal(el, { keyboard: true }); const keyboard = a._config.keyboard; a.dispose();
      let throws = false; try { new modalLab.Modal(el, { keyboard: 'wrong' }); } catch (e) { throws = e instanceof TypeError; }
      return { keyboard, throws };
    });
    assert.deepEqual(result, { keyboard: true, throws: true });
  });
  await check('Мобильная ширина без горизонтального переполнения', async p => {
    await p.setViewportSize({ width: 390, height: 844 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await p.click('#openJs'); await opened(p);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
  await fs.writeFile('.build/browser-results.json', JSON.stringify({ date: '2026-11-01', channel, results }, null, 2));
  console.log(`${results.length} browser checks passed.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
