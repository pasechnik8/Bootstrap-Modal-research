import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer, projectRoot } from '../scripts/server.mjs';

const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise(resolve => server.close(resolve)));
test('Исследуемая версия точно 5.3.8', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, 'node_modules/bootstrap/package.json')));
  assert.equal(pkg.version, '5.3.8');
});
test('Страница и оригинальный ES module доступны с корректным MIME', async () => {
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /studyModal/);
  const source = await fetch(`${base}/vendor/bootstrap/js/src/modal.js`);
  assert.match(source.headers.get('content-type'), /javascript/);
  assert.match(await source.text(), /class Modal extends BaseComponent/);
});
test('Сервер не публикует README и файлы вне public/vendor', async () => {
  assert.equal((await fetch(`${base}/README.md`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e%5cpackage.json`)).status, 403);
});
test('Несуществующие ресурсы и изменяющие HTTP-методы отклоняются', async () => {
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
