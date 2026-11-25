// GET /api/slots?dia=AAAA-MM-DD&servico=Corte&barbeiro=Barbeiro%201
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.configured()) return L.send(res, 503, { fallback: true });
  const q = L.query(req);
  if (!L.validDate(q.dia || '') || !L.SERVICES[q.servico]) return L.send(res, 400, { error: 'Dados inválidos' });
  try {
    const horarios = await L.freeStarts(q.dia, q.servico, q.barbeiro);
    L.send(res, 200, { horarios, fechado: L.dayStarts(q.dia).length === 0 });
  } catch (e) {
    console.error(e);
    L.send(res, 503, { fallback: true });
  }
};
