const { db } = require('../lib/firebase');
const { enviarTelegram, enviarAccionEscribiendo } = require('../lib/telegram');
const { buscarPerfume } = require('../lib/busqueda');

const VERSION_CODIGO = 'vercel-v1';

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('ok');

    const body = req.body;
    const msg = body && body.message;
    if (!msg || !msg.text) return res.status(200).send('ok');

    const chatId = String(msg.chat.id);
    const text = msg.text.trim();

    if (!text.startsWith('/')) enviarAccionEscribiendo(chatId);

    try {
          if (text === '/start') {
                  await db.collection('chats').doc(chatId).set({ registradoEn: new Date().toISOString() });
                  await enviarTelegram(chatId,
                                               'Listo! Quedaste registrado.\n\nEscribeme el nombre de un perfume (ej: "club de nuit intense man edt") y te digo que proveedor lo tiene, presentacion y precio.\n\nComandos:\n/cambios — ultimos cambios detectados\n/version — version del codigo en uso\n/ayuda — ver esto de nuevo'
                                             );
          } else if (text === '/ayuda') {
                  await enviarTelegram(chatId,
                                               'Escribeme el nombre de un perfume y busco en ambos proveedores.\n\nComandos:\n/cambios — ultimos cambios detectados (nuevos, sold out, precios)\n/version — version del codigo en uso\n/ayuda — este mensaje'
                                             );
          } else if (text === '/cambios') {
                  const doc = await db.collection('estado').doc('ultimoDigest').get();
                  await enviarTelegram(chatId, doc.exists ? doc.data().texto : 'Todavia no se ha detectado ningun cambio.');
          } else if (text === '/version') {
                  await enviarTelegram(chatId, 'Version del codigo en este momento: ' + VERSION_CODIGO);
          } else if (text.startsWith('/')) {
                  await enviarTelegram(chatId, 'No reconozco ese comando. Prueba /ayuda');
          } else {
                  const resultado = await buscarPerfume(text);
                  await enviarTelegram(chatId, resultado);
          }
    } catch (err) {
          console.error('Error procesando mensaje "' + text + '":', err);
          try {
                  await enviarTelegram(chatId, 'Tuve un problema buscando eso. Intenta de nuevo en un momento.');
          } catch (err2) {
                  console.error('Tambien fallo el aviso de error:', err2);
          }
    }

    return res.status(200).send('ok');
};
