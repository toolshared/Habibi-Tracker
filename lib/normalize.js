// Misma logica de normalizacion de nombres que usabamos en Apps Script,
// portada a Node.js. Lista ABIERTA de presentaciones a proposito: cada
// tipo se reporta tal como es, ninguno se mezcla con otro.

const STOPWORDS = ['for', 'men', 'women', 'man', 'woman', 'unisex', 'spray', 'eau', 'de', 'parfum',
                     'parfums', 'perfume', 'perfumes', 'fragrance', 'wholesale', 'the', 'a', 'an', 'by', 'fl', 'oz', 'ml',
                     'vial', 'bottle', 'default', 'title'];

const PALABRAS_PRESENTACION = ['edt', 'edp', 'edc', 'extrait', 'tester', 'cologne',
                                 'fraiche', 'fraiche', 'oil', 'concentrated', 'attar', 'itr', 'aceite', 'mist',
                                 'deodorant', 'deo', 'desodorante', 'splash', 'solid', 'cream', 'crema', 'pure'];

const PRESENTACIONES = [
  { label: 'EXTRAIT', regex: /\bextrait\b|\bpure parfum\b|\bparfum extract\b|\bperfume extract\b/ },
  { label: 'EDP', regex: /\bedp\b|\beau de parfum\b/ },
  { label: 'EDT', regex: /\bedt\b|\beau de toilette\b/ },
  { label: 'EDC', regex: /\bedc\b|\beau de cologne\b/ },
  { label: 'COLOGNE', regex: /\bcologne\b/ },
  { label: 'EAU FRAICHE', regex: /\beau fraiche\b|\beau fraiche\b/ },
  { label: 'ACEITE / OIL', regex: /\bperfume oil\b|\bconcentrated oil\b|\battar\b|\bitr\b|\baceite\b|\boil\b/ },
  { label: 'MIST / BODY SPRAY', regex: /\bbody mist\b|\bmist\b|\bbody spray\b/ },
  { label: 'DESODORANTE', regex: /\bdeodorant\b|\bdeo spray\b|\bdesodorante\b/ },
  { label: 'SPLASH', regex: /\bsplash\b/ },
  { label: 'SOLIDO / CREMA', regex: /\bsolid perfume\b|\bperfume cream\b|\bcrema\b/ },
  { label: 'PARFUM', regex: /\bparfum\b/ } // generico, va al final
  ];

function stripAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractConcentration(nameLower) {
    for (let i = 0; i < PRESENTACIONES.length; i++) {
          if (PRESENTACIONES[i].regex.test(nameLower)) return PRESENTACIONES[i].label;
    }
    return 'SIN_ESPECIFICAR';
}

function extractTester(nameLower) {
    return /\btester\b/.test(nameLower);
}

function extractSize(nameLower) {
    const m = nameLower.match(/(\d+(\.\d+)?)\s?(ml|fl\.?\s?oz|oz)\b/);
    return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

function tokenize(nameLower) {
    let cleaned = nameLower
      .replace(/\(tester\)/g, ' ')
      .replace(/\d+(\.\d+)?\s?(ml|fl\.?\s?oz|oz)\b/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ');
    let words = cleaned.split(/\s+/).filter(Boolean);
    words = words.filter(w => !STOPWORDS.includes(w) && !PALABRAS_PRESENTACION.includes(w) && w.length > 1);
    return words;
}

function buildProductRecord(rawName, proveedor, id, price, inStock, url) {
    const lower = stripAccents(String(rawName).toLowerCase());
    return {
          id: proveedor + '_' + id,
          proveedor,
          nombre: rawName,
          concentracion: extractConcentration(lower),
          tester: extractTester(lower),
          tamano: extractSize(lower),
          precio: Number(price) || 0,
          stock: !!inStock,
          url: url || '',
          tokens: tokenize(lower)
    };
}

module.exports = { stripAccents, extractConcentration, extractTester, extractSize, tokenize, buildProductRecord };
