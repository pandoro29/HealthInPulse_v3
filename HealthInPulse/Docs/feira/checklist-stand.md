# Checklist do stand: HealthInPulse v8 (sáb 24/10/2026)

Marque na ordem. O que depende de uma pessoa está com o nome de quem faz no plano (`Docs/plano-feira/`).

## Até quinta 22/10

- [ ] **Banner na gráfica** (leva de 24 a 48 h): `Docs/feira/banner.pdf`, 80 × 120 cm, retrato.
  - O banner foi refeito em 22/10 para a proposta de prevenção ("Como manter a saúde em dia?") e o PDF já foi
    gerado de novo. Antes de mandar, confira que não aparece nome de doença nem de órgão (os exames aparecem só pelo
    nome) e que a lista de fontes do rodapé bate com a base no dia.
  - **Quando a URL do Render chegar**, ela vive em três lugares: `frontend/src/config.js` (QR da tela do `/teste`,
    fixo no build), `scripts/stand.mjs` (texto do terminal) e o banner (`banner.html`, `qr-teste.svg`, `banner.pdf`).
    O comando abaixo troca os três; depois rode `npm run build` e confira o QR da tela e o do PDF.
  - Antes de mandar, confira se a URL do QR é a do Render de verdade. Se mudou:
    `npm run qr -- https://SEU-APP.onrender.com/teste --pdf` (regera o `qr-teste.svg`, o texto da URL no banner e o
    PDF).
  - Gere o PDF **com internet**: o banner baixa as fontes (Sora, DM Sans) do Google Fonts. Sem internet o Chrome
    troca por outra fonte e o layout muda. Abra o PDF e confira visualmente: título em duas linhas, nada cortado,
    rodapé inteiro.
  - Aponte a câmera do celular para o QR **no PDF aberto na tela** e confirme que abre o `/teste`.
  - Plano B se a gráfica atrasar: imprimir o banner em folhas A3 (ou só o QR em A4) e colar num papel-cartão.
- [ ] **Render no ar:** abrir `https://healthinpulse.onrender.com/teste` (ou a URL real) e fazer um teste completo.
  - `npm run smoke -- --url=https://SEU-APP.onrender.com` passa.
  - No Render, `KB_EDIT=false` (a edição da base fica só no notebook; sem a variável também fica desligada, o padrão é fechado), `DEMO_PASSWORD` e `OPENAI_API_KEY` vazios.
  - Keep-warm ligado (UptimeRobot ou cron-job.org chamando `/health` a cada 10 min); no plano grátis o serviço dorme
    depois de 15 min sem acesso e demora ~1 min para acordar.

## Quinta 22 ou sexta 23: ensaio no notebook Windows do stand

- [ ] Clone limpo **fora do OneDrive** (ex.: `C:\dev\HealthInPulse`), no **Prompt de Comando (cmd)** ou Git Bash,
  não no PowerShell.
- [ ] `npm run setup` com internet (baixa o Prisma e as dependências).
- [ ] **Desligar o Wi-Fi** e rodar `npm run stand` (ele imprime as URLs; `--check` só confere e encerra). Abrir `http://localhost:3000`:
  - [ ] `/teste` completo (capa → perfil → perguntas → resultado) em tela cheia (F11). O resultado mostra próximo
    passo, padrão normal, exames preventivos e hábitos, **sem** nome de doença, órgão, selo ou porcentagem;
    <!-- conferir na tela -->
  - [ ] alerta do `/teste`: "Sim" para perda de peso sem explicação e para suor noturno → "Procure atendimento
    agora", sem nome de doença;
  - [ ] login: a tela abre **vazia, sem cards**; usuário `ana` e a senha do slide 5 → Roberto em **INVESTIGAR** com o
    "por quê". Errar a senha de propósito: aparece a mensagem, o usuário continua digitado e a página não recarrega;
  - [ ] Base da IA: editar o **LR+ do FIT (13,17 → 2)**: o Roberto cai de 44,8% para 11,0% na simulação; depois **Restaurar padrão**;
  - [ ] Marina em **ATENÇÃO** para mama; João com câncer em **ROTINA**, mas STOP-Bang 6 e FINDRISC 23 (risco HIGH,
    alerta para a médica) e "Agendar consulta" no app dele;
  - [ ] cadastro de paciente novo (só usuário, nome e senha) → entra direto na triagem → tutorial das abas. A conta
    some no próximo `npm run stand`. <!-- conferir na tela -->
  - As fontes são locais: sem internet o visual tem que ficar igual.
- [ ] Se o Windows perguntar sobre o firewall na primeira execução: **permitir o Node.js em rede privada** (para
  celulares na mesma rede abrirem pelo IP que o `stand` imprime).
- [ ] Se der `EPERM` ou `EBUSY`: `Ctrl+C`, fechar o VS Code nessa pasta e rodar de novo (o `stand` reseta o banco antes
  de subir).
- [ ] Ensaiar o **pitch de 30 s e de 3 min** (`pitch.md`) com cronômetro, e ler o `faq-banca.md`.
- [ ] Ensaiar a demo do `roteiro-demo.md` pelo menos duas vezes, revezando quem clica e quem fala.
- [ ] Abrir os `slides.pptx` no notebook (PowerPoint ou o visualizador) e conferir se nada saiu do lugar. O slide 5
  tem os logins da demo: é o único lugar com as senhas.

## Material para levar

- [ ] Notebook do stand + carregador.
- [ ] Extensão/filtro de linha (tomada de evento costuma ser longe).
- [ ] Mouse (a demo da Base da IA tem campos pequenos).
- [ ] Celular com 4G para roteador (plano B se o Wi-Fi do evento falhar e alguém quiser o site online).
- [ ] Banner (ou o plano B em A3) + fita dupla-face / fita crepe.
- [ ] QR impresso em A4 extra para deixar na mesa.

## Sábado 24, de manhã

- [ ] Ligar o notebook, **Wi-Fi desligado**, `npm run stand` (as datas dos dados de exemplo ficam atualizadas).
- [ ] Abrir no navegador, em abas:
  1. `http://localhost:3000/teste?kiosk=1` (modo quiosque: volta sozinho para a capa depois de 120 s parado);
  2. login da médica (usuário `ana`, senha no slide 5; a tela de login não tem mais cards) com o Roberto aberto;
  3. a Base da IA.
- [ ] `slides.pptx` aberto no slide 5 (logins) no celular de quem demonstra.
- [ ] Abrir a URL do Render no celular uns minutos antes de abrir o stand, para ele "acordar".
- [ ] Testar o QR do banner com dois celulares diferentes (Android e iPhone).
- [ ] Brilho da tela no máximo; desligar notificações e atualização automática do Windows.

## Durante a feira

- [ ] Revezar: uma pessoa acompanha o visitante no teste, outra demonstra para quem quer ver a fundo.
- [ ] **Depois de cada demonstração da Base da IA: "Restaurar padrão".** Se esquecer, o Roberto e os visitantes
  passam a usar o número editado.
- [ ] Se o notebook travar: `Ctrl+C` e `npm run stand` de novo (reseta o banco e volta tudo ao normal; `--skip-build` acelera, `--keep-db` mantém as edições da Base da IA, `--port=3001` se a porta estiver ocupada).
- [ ] Se aparecer sessão antiga/tela estranha: o `/teste` é público e não usa token, mas abra-o num **perfil separado do navegador** (ou janela anônima), longe do login da médica.
- [ ] Se o Render cair: o teste continua no notebook; o QR vira "faça aqui no notebook".

### Acolhimento: quando o resultado preocupar o visitante

O visitante nunca vê doença na tela, e a equipe também não fala em doença. Se o resultado for **"Agendar consulta"**
ou **"Procure atendimento agora"**, ou se a pessoa ficar abalada:

1. **Ouça primeiro.** Não brinque com o resultado e não diga "isso não é nada".
2. **Explique o que é o resultado:** "O teste compara suas respostas com o padrão normal. Não é diagnóstico; quem
   avalia é o médico, na consulta."
3. **Indique o próximo passo que a tela mostrou:** "Vale conversar com um médico, levando o que apareceu aqui." Se a
   tela listar um exame preventivo, mostre qual.
4. **Não interprete o caso pessoal e não fale em doença** ("você tem", "deve ser", "pode ser X"). Nenhum de nós é
   médico. Se a pessoa perguntar "é câncer?" ou "é grave?": "O teste não diz isso, e a gente também não pode dizer.
   Por isso o próximo passo é o médico."
5. Se a pessoa contar algo grave (dor no peito agora, falta de ar forte, sangramento intenso): procurar atendimento
   agora, **SAMU 192**, sem pânico. Se falar em se machucar ou em não querer viver: **CVV 188** (gratuito, 24 horas).
6. Ofereça fazer o teste no **próprio celular**, pelo QR, se ela preferir privacidade. Nada é gravado.

Sinais na tela: o visitante vê o próximo passo, nunca categoria de risco nem porcentagem, e todo resultado diz "não é
diagnóstico". <!-- conferir na tela -->

## Depois da feira

- [ ] `Ctrl+C` no `stand`. Nada de visitante ficou gravado (o teste público não grava), mas não deixe o notebook
  logado como a médica.
- [ ] Anotar as perguntas da banca que não estavam no FAQ, para a próxima versão.
