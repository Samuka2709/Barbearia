// Painel do barbeiro
// POST {acao:'login', senha}            -> { token }
// GET  ?acao=agenda&dia=AAAA-MM-DD       -> agenda do dia
// POST {acao:'cancelar', id}
// POST {acao:'bloquear'|'liberar', dia, barbeiro, hora}
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.configured() || !process.env.ADMIN_PASSWORD) return L.send(res, 503, { error: 'O agendamento ainda não foi ativado no servidor.' });
  try {
    const b = req.method === 'POST' ? await L.readBody(req) : {};
    const q = L.query(req);
    const acao = b.acao || q.acao;

    if (acao === 'login') {
      if (await L.db.hit(`rl:login:${L.ip(req)}`, 900) > 8) return L.send(res, 429, { error: 'Muitas tentativas. Espere 15 minutos.' });
      if (!L.passwordOk(b.senha)) return L.send(res, 401, { error: 'Senha incorreta.' });
      return L.send(res, 200, { token: L.makeToken() });
    }

    if (!L.checkToken(req)) return L.send(res, 401, { error: 'Entre de novo.' });

    if (acao === 'agenda') {
      const dia = q.dia;
      if (!L.validDate(dia || '')) return L.send(res, 400, { error: 'Dia inválido.' });
      const h = await L.db.hgetall(`ag:${dia}`);
      const ids = [...new Set(Object.values(h).filter(v => v !== 'BLOCK'))];
      const docs = (await L.db.mget(ids.map(i => `bk:${i}`))).map(x => x && JSON.parse(x)).filter(Boolean);
      const bloqueios = Object.entries(h).filter(([, v]) => v === 'BLOCK').map(([k]) => { const [barbeiro, hora] = k.split('|'); return { barbeiro, hora }; });
      return L.send(res, 200, {
        dia, quando: L.dateLabel(dia), barbeiros: L.BARBERS, servicos: L.SERVICES,
        horarios: L.dayStarts(dia).map(L.toHHMM),
        agendamentos: docs.map(d => ({ ...d, fim: L.toHHMM(L.toMin(d.hora) + L.SERVICES[d.servico]), slots: L.slotsFor(d.servico) })),
        bloqueios
      });
    }

    if (acao === 'cancelar') {
      const raw = await L.db.get(`bk:${b.id}`);
      if (!raw) return L.send(res, 404, { error: 'Agendamento não encontrado.' });
      const d = JSON.parse(raw);
      await L.db.hdel(`ag:${d.dia}`, L.fieldsFor(d.barbeiro, L.toMin(d.hora), L.slotsFor(d.servico)));
      d.status = 'cancelado';
      await L.db.set(`bk:${d.id}`, JSON.stringify(d));
      return L.send(res, 200, { ok: true });
    }

    if (acao === 'bloquear' || acao === 'liberar') {
      const { dia, barbeiro, hora } = b;
      if (!L.validDate(dia || '') || !L.BARBERS.includes(barbeiro) || !L.dayStarts(dia).map(L.toHHMM).includes(hora)) return L.send(res, 400, { error: 'Dados inválidos.' });
      const campo = `${barbeiro}|${hora}`;
      if (acao === 'bloquear') {
        if (!(await L.db.reserve(`ag:${dia}`, 'BLOCK', [campo]))) return L.send(res, 409, { error: 'Esse horário já está ocupado.' });
      } else {
        const h = await L.db.hgetall(`ag:${dia}`);
        if (h[campo] === 'BLOCK') await L.db.hdel(`ag:${dia}`, [campo]);
      }
      return L.send(res, 200, { ok: true });
    }

    L.send(res, 400, { error: 'Ação desconhecida.' });
  } catch (e) {
    console.error(e);
    L.send(res, 500, { error: 'Erro no servidor. Tente de novo.' });
  }
};
