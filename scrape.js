// Baja el catalogo completo de Crist Fragances y FragranceShop Wholesale
// usando un navegador real (asi se pasa el challenge de Cloudflare de
// FragranceShop), y se lo entrega al backend en Vercel.

const { chromium } = require('playwright');

async function fetchCrist(page) {
    const productos = [];
    let pageNum = 1;
    while (pageNum <= 50) {
          const url = `https://wholesale.cristfragances.com/products.json?limit=250&page=${pageNum}`;
          await page.goto(url, { timeout: 30000 });
          let data;
          try {
                  const text = await page.evaluate(() => document.body.innerText);
                  data = JSON.parse(text);
          } catch (err) {
                  console.log(`Crist: no se pudo leer la pagina ${pageNum}, se detiene ahi.`);
                  break;
          }
          const items = data.products || [];
          if (items.length === 0) break;
          items.forEach(p => {
                  (p.variants || []).forEach(v => {
                            const fullName = p.title + (v.title && v.title !== 'Default Title' ? ' - ' + v.title : '');
                            productos.push({
                                        id: v.id,
                                        nombre: fullName,
                                        precio: parseFloat(v.price),
                                        stock: !!v.available,
                                        url: 'https://wholesale.cristfragances.com/products/' + p.handle
                            });
                  });
          });
          console.log(`Crist pagina ${pageNum}: ${items.length} productos (acumulado: ${productos.length})`);
          pageNum++;
    }
    return productos;
}

async function fetchFragrance(page) {
    const productos = [];
    let pageNum = 1;
    while (pageNum <= 60) {
          const url = `https://wholesale.fragranceshop.com/wp-json/wc/store/v1/products?per_page=100&page=${pageNum}`;
          await page.goto(url, { timeout: 30000 });
          await page.waitForTimeout(1200);
          let data;
          try {
                  const text = await page.evaluate(() => document.body.innerText);
                  data = JSON.parse(text);
          } catch (err) {
                  console.log(`Fragrance: no se pudo leer la pagina ${pageNum}, se detiene ahi.`);
                  break;
          }
          if (!Array.isArray(data) || data.length === 0) break;
          data.forEach(p => {
                  productos.push({
                            id: p.id,
                            name: p.name,
                            price: p.prices ? p.prices.price : null,
                            currency_minor_unit: p.prices ? p.prices.currency_minor_unit : 2,
                            is_in_stock: p.is_in_stock,
                            permalink: p.permalink
                  });
          });
          console.log(`Fragrance pagina ${pageNum}: ${data.length} productos (acumulado: ${productos.length})`);
          pageNum++;
    }
    return productos;
}

async function main() {
    const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
    const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

  const crist = await fetchCrist(page);
    const fragrance = await fetchFragrance(page);

  await browser.close();

  console.log(`Total Crist: ${crist.length}, Total Fragrance: ${fragrance.length}`);

  if (crist.length === 0 && fragrance.length === 0) {
        console.error('No se bajo ningun producto de ningun proveedor - algo salio mal, revisar antes de confiar en el resultado.');
        process.exit(1);
  }

  const resp = await fetch(process.env.INGESTA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: process.env.INGEST_TOKEN, crist, fragrance })
  });

  const respText = await resp.text();
    console.log('Respuesta del backend:', resp.status, respText);

  if (!resp.ok) process.exit(1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
