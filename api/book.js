// POST /api/book  { nome, telefone, servico, barbeiro, dia, hora }
const crypto = require('crypto');
const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'Use POST' });
  if (!L.configured()) return L.send(res, 503, { fallback: true });
  try {
    if (await L.db.hit(`rl:book:${L.ip(req)}`, 600) > 12) return L.send(res, 429, { error: 'Muitas tentativas. Espere alguns minutos.' });

    const b = await L.readBody(req);
    const nome = String(b.nome || '').trim().slice(0, 60);
    const telefone = String(b.telefone || '').replace(/\D/g, '');
    const { servico, dia, hora } = b;
    const barbeiro = String(b.barbeiro || 'Sem preferência');

    if (!nome) return L.send(res, 400, { error: 'Escreva seu nome.' });
    if (telefone.length < 10 || telefone.length > 13) return L.send(res, 400, { error: 'Confira o número de WhatsApp, com DDD.' });
    if (!L.SERVICES[servico]) return L.send(res, 400, { error: 'Escolha um serviço.' });
    if (barbeiro !== 'Sem preferência' && !L.BARBERS.includes(barbeiro)) return L.send(res, 400, { error: 'Escolha um barbeiro.' });
    if (!L.validDate(dia || '') || !/^\d{2}:\d{2}$/.test(hora || '')) return L.send(res, 400, { error: 'Escolha um dia e um horário.' });

    const livres = await L.freeStarts(dia, servico, barbeiro);
    if (!livres.includes(hora)) return L.send(res, 409, { error: 'Esse horário acabou de ser ocupado. Escolha outro.' });

    const id = crypto.randomBytes(6).toString('hex');
    const n = L.slotsFor(servico), start = L.toMin(hora);
    const candidatos = barbeiro === 'Sem preferência' ? L.BARBERS : [barbeiro];
    let escolhido = null;
    for (const nomeB of candidatos) {
      if (await L.db.reserve(`ag:${dia}`, id, L.fieldsFor(nomeB, start, n))) { escolhido = nomeB; break; }
    }
    if (!escolhido) return L.send(res, 409, { error: 'Esse horário acabou de ser ocupado. Escolha outro.' });

    const bk = { id, nome, telefone, servico, barbeiro: escolhido, dia, hora, criado: new Date().toISOString(), status: 'ativo' };
    await L.db.set(`bk:${id}`, JSON.stringify(bk));

    const fim = L.toHHMM(start + L.SERVICES[servico]);
    await L.notify(`✂️ *Novo agendamento*\n\n*${nome}*\n${servico} com ${escolhido}\n${L.dateLabel(dia)}, ${hora} às ${fim}\nWhatsApp: +${telefone.length <= 11 ? '55' + telefone : telefone}`);

    L.send(res, 200, { ok: true, id, barbeiro: escolhido, dia, hora, fim, quando: L.dateLabel(dia) });
  } catch (e) {
    console.error(e);
    L.send(res, 500, { error: 'Não deu para agendar agora. Tente de novo ou chame no WhatsApp.' });
  }
};
