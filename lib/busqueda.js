const { db } = require('./firebase');
const { stripAccents, extractConcentration, extractTester, tokenize } = require('./normalize');

async function buscarPerfume(query) {
    const lowerQ = stripAccents(query.toLowerCase());
    const qConc = extractConcentration(lowerQ);
    const qTester = extractTester(lowerQ);
    const qTokens = tokenize(lowerQ);

  if (!qTokens.length) {
        return `No entendi "${query}". Prueba escribiendo el nombre del perfume.`;
  }

  // Traemos solo los productos que contienen AL MENOS UNA de las palabras buscadas
  // (Firestore permite hasta 10 valores en array-contains-any)
  const snap = await db.collection('productos')
      .where('tokens', 'array-contains-any', qTokens.slice(0, 10))
      .get();

  let candidatos = snap.docs.map(doc => {
        const o = doc.data();
        const coincidencias = qTokens.filter(t => o.tokens.includes(t)).length;
        return { o, coincidencias };
  });

  if (qConc !== 'SIN_ESPECIFICAR') candidatos = candidatos.filter(r => r.o.concentracion === qConc);
    if (qTester) candidatos = candidatos.filter(r => r.o.tester === true);

  // Preferimos los que contienen TODAS las palabras buscadas, sin importar
  // cuantas palabras extra tenga el nombre del producto
  let resultados = candidatos.filter(r => r.coincidencias === qTokens.length);

  // Si nada contiene todas las palabras, mostramos lo mas parecido
  if (!resultados.length) {
        resultados = candidatos.filter(r => r.coincidencias > 0);
  }

  resultados = resultados.sort((a, b) => {
        if (b.coincidencias !== a.coincidencias) return b.coincidencias - a.coincidencias;
        return a.o.tokens.length - b.o.tokens.length;
  }).slice(0, 15);

  if (!resultados.length) {
        return `No encontre nada parecido a "${query}". Prueba con menos palabras, o revisa que este bien escrito.`;
  }

  const lineas = resultados.map(r => {
        const o = r.o;
        const stock = o.stock ? '🟢 disponible' : '🔴 agotado';
        const conc = o.concentracion !== 'SIN_ESPECIFICAR' ? o.concentracion : '';
        const test = o.tester ? 'TESTER' : '';
        const tags = [conc, test, o.tamano].filter(Boolean).join(' · ');
        return `${o.nombre}\n${o.proveedor}${tags ? ' (' + tags + ')' : ''} — $${o.precio.toFixed(2)} — ${stock}`;
  });

  return `Resultados para "${query}" (${resultados.length}):\n\n` + lineas.join('\n\n');
}

module.exports = { buscarPerfume };
