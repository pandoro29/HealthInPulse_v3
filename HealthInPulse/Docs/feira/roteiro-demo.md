# Roteiro da demonstração (cliques, tempos e plano B)

Duração total: cerca de **5 minutos** (o pitch de 3 min em `pitch.md` usa os passos 2 a 4 em versão curta). Os tempos
abaixo são o alvo; cronometre no ensaio e anote o real ao lado.

Quem clica fica no notebook; quem fala, de frente para o público. Nunca diga "a IA diagnostica". Para o visitante e
para o paciente, **nada de doença**: nem nome de doença, nem órgão, nem "risco de", nem categoria, nem porcentagem;
fale em próximo passo, padrão normal, exames preventivos e metas. O risco ("estima o risco", "mostra o porquê") é
assunto só da tela da médica.

Os pontos marcados com `<!-- conferir na tela -->` dependem de tela que ainda está sendo feita: confira no ensaio,
ajuste o texto e tire a marca.

## Antes de começar

`npm run stand` imprime as URLs (neste notebook, rede e Render). Depois de subir, deixe abertas, em abas:

| Aba | Endereço | Para quê |
|---|---|---|
| 1 | `http://localhost:3000/teste?kiosk=1` | passo 1 (modo quiosque: volta à capa sozinho após 120 s parado) |
| 2 | `http://localhost:3000/login` | passos 2 a 5, já logada como médica (veja abaixo) |

Logins: a tela de login abre **vazia, sem os cards** de demonstração. Digite **usuário** e **senha** (o login é por
usuário, não por e-mail). Os quatro logins estão no **slide 5, "Logins da demo"**, do `slides.pptx`: deixe esse slide
aberto no celular de quem demonstra. Usuários: `ana` (médica), `roberto`, `joao` e `marina`.

Banco recém-zerado pelo `stand` (sem `--keep-db`): Base da IA na versão original e Roberto em 44,8% (exibido "≥20%").

## Passo a passo

### 1. Teste rápido do visitante (`/teste`) · 1:30

Abra a aba 1. Quem assiste é o visitante: fale em próximo passo, padrão normal, exames preventivos e hábitos. Não há
mais card por câncer, selo, "× a média" nem "em 1.000".

1. Capa: a chamada de prevenção, com "Nada é gravado, sem login" e "Não é diagnóstico". Mostre o QR ("Prefere
   responder no celular?"). <!-- conferir na tela -->
2. Clique em **Começar o teste**. Perfil: idade, sexo, altura, peso, fumo etc. Preencha ao vivo ou use os botões
   "Demonstração da equipe" no pé da capa (preenchem tudo e vão direto ao resultado com **Ver o resultado**).
3. Perguntas, uma por tela, com **Sim / Não / Não sei**. Mostre **Voltar**. A pergunta não traz mais o "por que
   estamos perguntando", porque esse texto citava a doença. <!-- conferir na tela -->
4. Resultado, de cima para baixo: <!-- conferir na tela -->
   - **Próximo passo:** "Manter a rotina", "Agendar consulta" ou "Procure atendimento agora", com o texto do que fazer
     (e o telefone, SAMU 192 ou CVV 188, quando couber).
   - **Padrão normal:** o teste não tem a pulseira, então a comparação é pelo peso: se o IMC passa da faixa normal
     (18,5 a 24,9, OMS), aparece o peso em que ele volta para a faixa.
   - **Exames preventivos** da idade e do sexo, pelo nome, sem dizer o que previnem: "recomendado para a sua idade",
     "converse com seu médico" ou "recomendado a partir dos N anos".
   - **Hábitos com fonte:** 150 minutos de atividade por semana (OMS), reduzir o álcool, parar de fumar, com a fonte
     de cada um.
   - Se o visitante perguntar "e o câncer?" ou "por que não diz se eu tenho alguma coisa?", responda com o FAQ 1:
     o app é de prevenção, e quem avalia risco é o médico, na consulta.
5. **Novo teste** limpa tudo para o próximo visitante.

Qual persona para qual efeito (rápido, ~30 s cada): <!-- conferir na tela -->

| Botão | Próximo passo esperado | O que mostrar |
|---|---|---|
| **Carlos, 67** | Agendar consulta | ex-fumante com tosse: o resultado pede consulta sem dizer por quê. Exames: sangue oculto nas fezes; PSA como "converse com seu médico" |
| **Helena, 47** | Agendar consulta | preventivo atrasado: DNA-HPV (ou preventivo) em "recomendado"; o motivo da família fica com a médica |
| **Roberto, 63** | Agendar consulta | o mesmo próximo passo que ele vê no app. O porquê (e o INVESTIGAR) só aparece no painel da médica (passo 2) |
| *ao vivo:* 30 anos, não fuma, tudo "Não" | Manter a rotina | o resultado tranquilo: exames da idade e hábitos |

Se alguém receber "Procure atendimento agora", ou ficar preocupado com "Agendar consulta", pare a demo e siga o
acolhimento do `checklist-stand.md`.

### 2. Roberto, na visão da médica · 1:30

1. Aba 2: na tela de login (vazia), digite o usuário **`ana`** e a senha da médica (slide 5) e entre.
2. Menu **Pacientes** → **Roberto Alves Pereira**. O **painel de riscos** está logo abaixo do cabeçalho.
3. Chips de "baseado em": triagem, exames (FIT positivo, hemoglobina 10,9), **balança** (perda de 9,5% em 90 dias, 84 → 76 kg).
4. Card **Colorretal**: selo **INVESTIGAR**, risco **"≥20%"** em 2 anos (o motor calcula 44,8%; a tela corta em 20% porque
   as pistas são correlacionadas, FAQ 14) e RR "> 10×". Já vem aberto o **"por quê"**, fator a fator, com a fonte:
   FIT positivo (×13,2), hemoglobina baixa (×5,2), perda de peso na balança (×5,1), mudança do intestino (×3,9); os
   "não" para sangramento retal e dor abdominal diminuem um pouco.
5. Pulmão em **ATENÇÃO** (fumo + perda de peso) e, em rastreamento, a **TC de pulmão de baixa dose** indicada; o colorretal
   mostra a nota laranja "o próximo passo é a avaliação médica, não o rastreamento de rotina".
6. O botão **Recalcular** refaz a conta na hora.

### 3. Base da IA: editar o LR do FIT · 1:00

1. Menu **Base da IA** (aba **Câncer**, **Colorretal** já selecionado). Mostre as fontes e o selo "Versão N".
2. Na lateral, **Simular em paciente** → escolha **Roberto Alves Pereira**. Aparece "≥20% (44,8%)" em colorretal.
3. Em **Sinais, sintomas e exames**, linha **Sangue oculto nas fezes (FIT) positivo**, clique no **LR+** (13,17), digite **2** e **Enter**.
   (Opcional: preencha antes o "Motivo da edição", por exemplo "demonstração na feira".)
4. A simulação refaz sozinha: o risco do Roberto cai de **44,8% para 11,0%** (INVESTIGAR continua pelos outros sinais,
   mas o número despenca). Clique em **Histórico**: aparece quem mudou, quando, e "13,17 → 2".
   Se quiser, **Painel do paciente →** abre o Roberto com o novo valor.

### 4. Restaurar padrão · 0:15

1. **Restaurar padrão** (topo da Base da IA) → confirme. A versão sobe e o FIT volta a **13,17**; a simulação volta a
   **44,8%**. As edições continuam no histórico.
2. Fale: "o histórico guarda tudo, como o Git, mas para os dados da IA".

**Regra de ouro:** nunca deixe o notebook sem "Restaurar padrão" depois de editar.

### 5. Marina · 0:45

1. **Pacientes** → **Marina Azevedo Lima** (34 anos). Painel: mama **ATENÇÃO**, **RR 2,2×**, ~1 em 1.000, por causa da mãe
   (câncer de mama aos 41).
2. Rastreamento: mamografia de alto risco indicada (começar 10 anos antes do caso da mãe, se a médica confirmar) e
   **DNA-HPV** (preventivo atrasado).
3. Se sobrar tempo: **João** (58): câncer em ROTINA, mas escores crônicos altos: STOP-Bang 6 (alto) e FINDRISC 23
   (muito alto), PHQ-2 negativo; risco geral HIGH e a médica recebe o alerta. O painel de câncer não é tingido pelos
   escores crônicos. No app dele, o João vê "Agendar consulta".

Extra do paciente (opcional, +1 min): os tokens ficam no `localStorage`, que é compartilhado entre abas, então o
paciente precisa entrar numa **janela anônima** (ou em outro perfil do navegador); na mesma janela da médica ele
derruba o login dela. Prefira o **João** (usuário `joao`, senha no slide 5) para a triagem ao vivo. Se for o Roberto,
a triagem ao vivo **substitui** a última dele e muda a história dos 44,8% até rodar `npm run stand` de novo. As contas
da demo não abrem o tutorial (já nascem com ele visto). No fim da triagem, o paciente vê o resultado de prevenção:
próximo passo, sinais da pulseira contra a faixa normal, exames preventivos e metas, sem nome de doença. O confete só
sai sem risco. Com a médica logada na outra janela, chega para ela o aviso da triagem (com o Roberto: "Câncer para
investigar: colorretal. Ver paciente →"). Mostre as duas telas lado a lado: **o paciente vê o próximo passo; a médica
vê o risco.** <!-- conferir na tela -->

Se perguntarem pelo cadastro: **Cadastre-se** pede só usuário, nome e senha, entra direto na triagem e, depois do
resultado, mostra o tutorial das abas. O paciente novo já fica ligado à Dra. Ana. A conta some no próximo
`npm run stand`. <!-- conferir na tela -->

## Plano B

| Problema | O que fazer |
|---|---|
| **Render dormindo** (plano grátis acorda em ~1 min) | O keep-warm chama `/health` a cada 10 min. Abra a URL do Render no celular 5 min antes de abrir o stand. Durante a feira, use **sempre o notebook** (`localhost:3000`), que não depende do Render. Se o visitante escaneou o QR e ficou carregando, diga "é o servidor acordando, 1 minuto" e ofereça o notebook. |
| **Sem Wi-Fi** | A demo inteira roda local: `npm run stand` não precisa de internet (fontes locais, IA simulada). Só o QR/Render ficam fora. Os visitantes fazem o teste **no notebook** (aba `/teste?kiosk=1`) e quem quiser usa o próprio celular em 4G pelo QR se o Render estiver acordado. Se o celular da equipe fizer hotspot, o `stand` imprime o IP da rede para abrir de outros celulares. |
| **Login não entra** | É **usuário**, não e-mail (`ana`, `roberto`, `joao`, `marina`); as senhas estão no slide 5. Errou a senha: o usuário continua digitado, redigite só a senha. Se o navegador preencher sozinho uma senha antiga salva, apague e digite. |
| **Token velho no navegador** (sessão antiga de outro login, tela que não carrega ou volta ao login) | `/teste` é público e ignora token, mas o login da médica não. Abra o `/teste` num **perfil separado do navegador** (ou janela anônima) e deixe a médica em outro. Para limpar: DevTools → Application → Clear site data, ou **Sair** e entrar de novo. |
| **Alguém recebeu "Procure atendimento agora"** (ou ficou preocupado) | Pare a demo. Siga o roteiro de acolhimento no `checklist-stand.md` (ouvir, explicar que o teste compara com o padrão normal e não diagnostica, indicar o médico, não interpretar o caso, não falar em doença). Ofereça refazer no celular, pelo QR. |
| **Notebook travou no meio** | `Ctrl+C` e `npm run stand` de novo (zera o banco e volta tudo ao normal). Com pressa: `npm run stand -- --skip-build`. |
| **Esqueceu de restaurar a base** | Base da IA → **Restaurar padrão**. Ou reinicie com `npm run stand` (sem `--keep-db`). |
| **Resultado do Roberto diferente do esperado** | Provável base editada ou banco antigo. Restaurar padrão; se persistir, `npm run stand`. Confira a versão da base no selo "Versão N". |
| **Base da IA sem edição** (aviso âmbar "só leitura") | O servidor subiu sem `KB_EDIT=true`. Só acontece fora do `npm run stand` (ex.: Render). Use o notebook com `npm run stand`. |
| **Porta ocupada** | `npm run stand -- --port=3001` (e abra `localhost:3001`). |

## Conferência (refazer depois das correções de 22/10)

- [ ] usuário e senha das 4 contas no seed batem com o slide 5 (`ana`, `roberto`, `joao`, `marina`), e a tela de login
  abre vazia, sem cards;
- [ ] `/teste`: resultado sem nome de doença, órgão, selo ou porcentagem; textos do passo 1 e da tabela de personas
  conferidos na tela (tirar as marcas `conferir na tela`);
- [x] "≥20%" na tela do painel e "≥20% (44,8%)" na simulação da Base da IA (conferir de novo depois da Parte 6);
- [x] sinal do FIT na Base da IA e valor a mudar: **LR+ 13,17 → 2** (Roberto 44,8% → 11,0%) (idem);
- [ ] tempos reais de cada passo, cronometrados no ensaio (fazer no ensaio de quinta/sexta).
