const { db } = require('../lib/firebase');
const { buildProductRecord } = require('../lib/normalize');
const { enviarTelegram } = require('../lib/telegram');

const BATCH_SIZE = 500;

function tagsProducto(p) {
    const conc = p.concentracion !== 'SIN_ESPECIFICAR' ? p.concentracion : '';
    const test = p.tester ? 'TESTER' : '';
    return [conc, test, p.tamano].filter(Boolean).join(' · ');
}

function formatProducto(p) {
    const semaforo = p.stock ? '🟢' : '🔴';
    const tags = tagsProducto(p);
    return `${semaforo} ${p.nombre}\n   ${p.proveedor}${tags ? ' (' + tags + ')' : ''} — $${p.precio.toFixed(2)}`;
}

function buildDigest(cambios) {
    const partes = [];
    if (cambios.nuevos.length) partes.push('🆕 NUEVOS INGRESOS\n' + cambios.nuevos.map(formatProducto).join('\n'));
    if (cambios.volvieron.length) partes.push('🟢 VOLVIERON A STOCK\n' + cambios.volvieron.map(formatProducto).join('\n'));
    if (cambios.agotados.length) partes.push('🔴 SE AGOTARON\n' + cambios.agotados.map(formatProducto).join('\n'));
    if (cambios.bajaron.length) partes.push('📉 BAJARON DE PRECIO\n' + cambios.bajaron.map(p =>
          `${p.nombre} (${p.proveedor}): $${p.precioAnterior.toFixed(2)} → $${p.precio.toFixed(2)}`).join('\n'));
    if (cambios.subieron.length) partes.push('📈 SUBIERON DE PRECIO\n' + cambios.subieron.map(p =>
          `${p.nombre} (${p.proveedor}): $${p.precioAnterior.toFixed(2)} → $${p.precio.toFixed(2)}`).join('\n'));
    return partes.join('\n\n');
}

async function guardarEnLotes(catalogoNuevo) {
    for (let i = 0; i < catalogoNuevo.length; i += BATCH_SIZE) {
          const batch = db.batch();
          catalogoNuevo.slice(i, i + BATCH_SIZE).forEach(p => {
                  batch.set(db.collection('productos').doc(p.id), p);
          });
          await batch.commit();
    }
}

async function borrarEnLotes(ids) {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batch = db.batch();
          ids.slice(i, i + BATCH_SIZE).forEach(id => batch.delete(db.collection('productos').doc(id)));
          await batch.commit();
    }
}

async function notificarTodos(texto) {
    const snap = await db.collection('chats').get();
    for (const doc of snap.docs) {
          await enviarTelegram(doc.id, texto);
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

    const body = req.body;
    if (!body || body.token !== process.env.INGEST_TOKEN) {
          return res.status(401).json({ ok: false, error: 'token invalido' });
    }

    const productosCrist = (body.crist || []).map(p =>
          buildProductRecord(p.nombre, 'Crist', p.id, p.precio, p.stock, p.url)
                                                    );
    const productosFragrance = (body.fragrance || []).map(p => {
          const minorUnit = p.currency_minor_unit || 2;
          const price = parseFloat(p.price) / Math.pow(10, minorUnit);
          return buildProductRecord(p.name, 'Fragrance', p.id, price, p.is_in_stock, p.permalink);
    });

    const catalogoNuevo = productosCrist.concat(productosFragrance);
    if (!catalogoNuevo.length) {
          return res.status(400).json({ ok: false, error: 'no llego ningun producto' });
    }

    const prevSnap = await db.collection('productos').get();
    const esPrimeraVez = prevSnap.empty;
    const prevMap = {};
    prevSnap.forEach(doc => { prevMap[doc.id] = doc.data(); });

    const cambios = { nuevos: [], agotados: [], volvieron: [], bajaron: [], subieron: [] };
    catalogoNuevo.forEach(p => {
          const anterior = prevMap[p.id];
          if (!anterior) { cambios.nuevos.push(p); return; }
          if (!anterior.stock && p.stock) cambios.volvieron.push(p);
          if (anterior.stock && !p.stock) cambios.agotados.push(p);
          const centavosAntes = Math.round(anterior.precio * 100);
          const centavosAhora = Math.round(p.precio * 100);
          if (centavosAntes !== centavosAhora) {
                  const conAnterior = Object.assign({}, p, { precioAnterior: anterior.precio });
                  if (centavosAhora < centavosAntes) cambios.bajaron.push(conAnterior);
                  else cambios.subieron.push(conAnterior);
          }
    });

    await guardarEnLotes(catalogoNuevo);

    const idsNuevos = new Set(catalogoNuevo.map(p => p.id));
    const idsBorrar = Object.keys(prevMap).filter(id => !idsNuevos.has(id));
    if (idsBorrar.length) await borrarEnLotes(idsBorrar);

    if (esPrimeraVez) {
          await notificarTodos(`✅ Catalogo inicial cargado: ${catalogoNuevo.length} productos (Crist + Fragrance). Desde la proxima revision te aviso de cualquier cambio real.`);
          return res.json({ ok: true, primeraVez: true, total: catalogoNuevo.length });
    }

    const huboAlgo = cambios.nuevos.length || cambios.agotados.length || cambios.volvieron.length || cambios.bajaron.length || cambios.subieron.length;
    if (huboAlgo) {
          const digest = buildDigest(cambios);
          await db.collection('estado').doc('ultimoDigest').set({ texto: digest, fecha: new Date().toISOString() });
          await notificarTodos('📋 Cambios detectados hoy\n\n' + digest);
    }

    return res.json({
          ok: true,
          total: catalogoNuevo.length,
          cambios: {
                  nuevos: cambios.nuevos.length,
                  agotados: cambios.agotados.length,
                  volvieron: cambios.volvieron.length,
                  bajaron: cambios.bajaron.length,
                  subieron: cambios.subieron.length
          }
    });
};
