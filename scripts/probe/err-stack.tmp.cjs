const { BASE_URL, launch } = require('./browser');
(async () => {
  const b = await launch(['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => console.log('STACK:', String(e.stack || e).slice(0, 600)));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  await b.close();
})();
