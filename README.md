# Mestre Barber Club

Site de barbearia em HTML/CSS/JS puro, tema preto e dourado.

- Abra `index.html` no navegador.
- Agendamento pelo WhatsApp: troque `WHATS` no fim do `index.html` pelo número real.
- Fotos de exemplo do Unsplash em `img/fotos/`; troque pelas fotos reais.

## Agendamento online

**Status: desativado.** Para ligar, troque `const AGENDA_ONLINE=false` para `true` em `index.html` e siga os passos abaixo.

O formulário do site reserva horários de verdade (`/api/slots`, `/api/book`) e o barbeiro vê a agenda em **/painel**.
Enquanto o banco não estiver configurado, o formulário volta sozinho para o modo antigo (mensagem no WhatsApp).

### Ativar (uma vez, no painel da Vercel)
1. **Banco:** Vercel → projeto → *Storage* → *Create* → **Upstash for Redis** (plano gratuito) → conectar ao projeto.
   Isso cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL`/`_TOKEN`).
2. **Senha do painel:** *Settings → Environment Variables* → `ADMIN_PASSWORD` = uma senha forte.
3. **Aviso no WhatsApp (CallMeBot, gratuito):**
   - Abra https://www.callmebot.com/blog/free-api-whatsapp-messages/ e veja o número atual do CallMeBot (ele muda de tempos em tempos).
   - No celular que vai receber os avisos, salve esse contato e mande: `I allow callmebot to send me messages`.
   - Você recebe uma *apikey* por mensagem.
   - Crie a variável `CALLMEBOT` = `5511999999999:APIKEY` (número com DDI e DDD, dois-pontos, apikey). Para avisar mais de um número, separe por vírgula.
4. Faça um novo deploy (*Deployments → Redeploy*).

### Ajustar regras
Serviços, durações, barbeiros e horários de funcionamento ficam no topo de `api/_lib.js`.
Se mudar barbeiros ou serviços, mude também as opções do formulário em `index.html`.
