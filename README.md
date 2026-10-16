# RPG Dice para Lumiverse

Testes automáticos de interpretação com uma IA auxiliar e dados sorteados pelo código. Inclui um pequeno dado flutuante, semitransparente e móvel, histórico do chat e cheats explícitos.

## Instalar

No gerenciador de extensões **Spindle** do Lumiverse, escolha instalar por URL:

```text
https://github.com/luizram17/Lumiverse-RPG-Dice
```

Conceda as permissões solicitadas. O repositório inclui `dist/backend.js` e `dist/frontend.js`; não é necessário compilar para instalar. Para receber a versão **1.0.4**, use a ação de atualização do Spindle e recarregue a página para carregar os arquivos atualizados. Esta versão acrescenta efeitos narrativos editáveis para os quatro resultados e mantém as correções de carregamento da interface da 1.0.2.

Compatibilidade conferida com **Lumiverse 1.2.5**, fonte `b1a68d9e32e2a2480a0d5ae71422566845f2657b`, e SDK `lumiverse-spindle-types` 0.6.40. O host precisa anunciar `required-interceptors-v1 >= 1`; versões sem esse recurso não podem habilitar os testes. Os runtimes de backend e as permissões são os fornecidos pelo Lumiverse.

## Configurar e usar

1. Cadastre um perfil de conexão no Lumiverse, com sua chave guardada pelo próprio host.
2. Abra **Configurações → RPG Dice** ou a aba **Dados / RPG Dice** na lateral. Escolha o perfil auxiliar e seu modelo no seletor nativo. É possível digitar um ID quando o provedor não oferece catálogo.
3. Escolha cada persona, ajuste suas seis abordagens e salve a ficha. O padrão é **Cuidadoso 3, Astuto 2, Chamativo 2, Enérgico 1, Ágil 1, Furtivo 0**. Cada valor admite inteiros de 0 a 5. Não há distribuição automática ao editar.
4. Habilite os testes, salve e converse normalmente com uma persona selecionada. A conexão e o modelo principais continuam independentes.

A ficha é salva pelo ID da persona, isolada por conta. Trocar o nome preserva os valores; criar outra persona cria outra ficha. A primeira utilização de uma persona salva os valores iniciais.

O dado **⚄** fica com opacidade de 60% em repouso e se destaca ao passar o mouse ou receber foco. Arraste para movê-lo; clique para abrir o histórico e os cheats. A posição fica salva para a conta e limitada à tela. O histórico mostra os quatro dados, soma, abordagem, atributo salvo, bônus, DT, motivo, resultado e eventual CHEAT. Seu conteúdo pertence ao chat aberto.

### Editar os textos dos modelos

Na mesma aba de configurações, expanda **Editar textos enviados aos modelos**. Há treze campos de texto:

- **Árbitro auxiliar:** o `system` completo, incluindo papel, diretrizes, instruções de OOC e formato JSON esperado. Esse campo contém o texto system integral enviado ao auxiliar.
- **Principal:** oito trechos fixos, na ordem da nota: abertura antes da persona, separador antes da abordagem, texto antes da ação, antes da categoria, antes do efeito, depois do efeito, instrução condicional de CHEAT e encerramento/diretrizes OOC. Os separadores também podem ser editados.
- **Efeitos:** quatro descrições independentes para Falha, Sucesso Parcial, Sucesso e Sucesso Crítico. O principal recebe o efeito da categoria obtida pelo código, inclusive quando há CHEAT. Essas descrições não são enviadas ao árbitro auxiliar.

Clique em **Salvar textos dos modelos**. Os textos ficam salvos por conta, para todos os chats dessa conta. Os padrões são em inglês e podem ser substituídos por textos no idioma que você preferir. Espaços, quebras de linha e campos vazios são preservados. O limite é de 24.000 caracteres para o auxiliar e 4.000 para cada trecho do principal ou efeito. A interface trata o conteúdo como texto; não executa HTML, código ou templates.

Os campos tracejados e a prévia são **somente leitura** e usam valores de exemplo. O seletor **Resultado da prévia — somente exemplo** permite conferir cada efeito ao editar; não salva resultado, não chama modelos, não sorteia dados e não altera cheats. O código sempre insere persona, abordagem, ação e categoria nos locais indicados, mesmo que todos os textos fixos sejam apagados; o efeito vem do campo editável da categoria obtida e pode ficar vazio. O envelope `((...))`, a estrutura JSON do contexto e seus valores, os identificadores de abordagens, as categorias e sua classificação por margem pertencem ao código. Dados, totais, ficha, DT, bônus e cheats também não podem ser alterados pelo editor de textos. O trecho de CHEAT só é incluído quando o teste registrado possui CHEAT.

O texto do auxiliar é usado em **novas ações**. Alterá-lo não refaz decisões ou rolagens já salvas. Ao regenerar ou continuar uma ação em cache, o código mantém o resultado antigo e monta somente a nota principal com os textos e o efeito atuais. O histórico exibe **Efeito (texto atual)** conforme os textos salvos; editar o efeito não regrava a auditoria nem o significado original guardado no registro. Rascunhos afetam apenas a prévia até salvar. **Restaurar e salvar textos padrão** grava os padrões apenas desses treze campos: preserva conexões, fichas, posição, histórico, resultados e cheats. Contas que já usavam a extensão mantêm todos os nove textos personalizados anteriores e recebem os quatro efeitos padrão sem migração destrutiva.

A validação continua independente do texto editado: o auxiliar precisa retornar `roll` booleano e `reason` com 1–600 caracteres; se houver teste, deve retornar abordagem válida, DT inteira de −2 a 8, bônus inteiro de 0 a 4 e `action` com 1–400 caracteres. Um prompt editado que não produza esse contrato interrompe o turno, sem inventar resultado. A precedência de comandos OOC reconhecidos pelo código, o sorteio e a classificação continuam definidos pelas regras da extensão; as instruções narrativas editadas orientam os modelos.

### Cheats

Há quatro botões: **Falha**, **Sucesso Parcial**, **Sucesso** e **Sucesso Crítico**. Apenas um pode ficar ativo por chat. Enquanto estiver ativo, **toda nova rolagem solicitada recebe obrigatoriamente esse resultado**. O botão permanece ativo até você clicar nele para desligar ou escolher outro.

O código continua sorteando os quatro dados normalmente e mostra o total natural no histórico. O cheat substitui somente a categoria e seu efeito; o registro e a instrução ao narrador identificam **CHEAT**. A IA auxiliar não recebe o estado do cheat. Conversa mundana ou OOC que dispense teste não produz rolagem. Regenerar uma resposta conserva o resultado anterior, inclusive o estado de cheat que aquele teste tinha.

## Regras desta adaptação

O teste é `4dF + abordagem salva + bônus contextual` contra a DT definida antes do sorteio. Cada dado vale −1, 0 ou +1. A fonte é `crypto.getRandomValues`; rejeitar o byte 255 evita viés de módulo.

| Comparação | Resultado | Efeito padrão na narrativa (editável) |
|---|---|---|
| Total abaixo da DT | Falha | O objetivo não é atingido. |
| Total igual à DT | Sucesso Parcial | O objetivo é parcialmente atingido, sem custo obrigatório. |
| DT +1 ou +2 | Sucesso | O objetivo é atingido. |
| DT +3 ou mais | Sucesso Crítico | O objetivo é atingido com um benefício adicional. |

A escala de DT usada pela extensão é: **−2 Terrível, −1 Ruim, 0 Medíocre, 1 Razoável, 2 Bom, 3 Ótimo, 4 Excelente, 5 Soberbo, 6 Fantástico, 7 Épico, 8 Lendário**. São os nomes adotados por esta adaptação. A IA considera o mundo e o risco; DT 2 representa um desafio significativo comum. Bônus contextuais são inteiros de 0 a 4 e precisam de fundamento na situação; penalidades negativas não são aceitas. A IA escolhe a abordagem pelo modo de agir e não pode escolher seu valor numérico.

Esta é uma adaptação universal de **Fate Accelerated**, com resultados narrativos simplificados conforme as regras acima. Não implementa pontos Fate, invocações, façanhas, estresse, combate tático nem as quatro ações completas do SRD. O empate como objetivo parcialmente atingido é uma alteração deliberada.

## OOC, contexto e fluxo

Instruções entre `((...))` têm precedência. Por exemplo, `Eu negocio ((Ele aceita))` não gera teste. Comandos inequívocos como `((Sem rolagem))` são reconhecidos pelo código. Perguntas, condições e OOC estético seguem para a IA auxiliar com instrução explícita de respeitá-los, sem tratar uma pergunta como resultado imposto.

O auxiliar recebe seu papel, a descrição da persona, a ficha salva, o histórico textual completo do ramo atual até o turno realmente usado pelo prompt e a última mensagem da persona, identificada separadamente. Julga somente essa ação atual. Não deve testar NPCs, ações passadas ou fatos já resolvidos. Caminhar normalmente e conversar sem intenção incerta ou risco são ações sem teste. O texto da história é contexto narrativo, não autorização para modificar o contrato da extensão.

O interceptor obrigatório suspende o modelo principal. Faz **uma chamada auxiliar**, valida a decisão, sorteia no código e persiste o registro. Só então acrescenta uma nota OOC curta como última mensagem `user` do prompt montado, depois do histórico e dos blocos do preset. Não há chamada auxiliar depois do sorteio. O modelo principal recebe o resultado e seu significado e é instruído a não refazer nem reclassificar o teste. A nota aparece no **Prompt Breakdown** como RPG Dice.

As instruções e os efeitos **padrão** para a IA auxiliar e para o narrador estão em **inglês** e podem ser editados nas configurações. O padrão orienta o auxiliar a escrever `action` e `reason` em inglês. A nota final usa abordagens e categorias em inglês; o efeito usa o texto atual configurado, inclusive ao reutilizar registros antigos. A interface e os identificadores de fichas/resultados salvos permanecem em português. Nomes, descrições, histórico, OOC e ações originais são preservados no idioma em que foram fornecidos; textos de decisões antigas também são preservados.

O histórico e o resultado são salvos por usuário e chat. A chave de uma ação inclui chat, persona, ID da mensagem e seu texto. A mesma ação reutiliza sua decisão em regenerações, continuações, swipes e reenvios, mesmo após trocar ficha, modelo ou cheat. Editar o texto cria uma nova ação no envio normal. Regenerar/continuar sem uma decisão anterior não cria um teste retroativo. Rascunhos de prompt (`dry run`), impersonação e gerações quietas não rolam. Um ramo criado como novo chat tem armazenamento próprio.

## Falhas e cancelamento

O auxiliar tem limite de 110 segundos; o interceptor, 120. Cancelar o turno no Lumiverse cancela a chamada auxiliar. Falha de conexão, JSON inválido, atributo/DT/bônus fora do contrato, histórico sem identificação de origem ou erro de gravação interrompem o turno principal e exibem aviso. **Nenhum resultado é inventado** e erros não são cacheados. Tente enviar novamente; para continuar conscientemente sem testes, desabilite RPG Dice nas configurações.

Uma decisão já gravada antes de um cancelamento tardio continua salva e será reutilizada. A gravação usa arquivo temporário e renomeação no armazenamento do host. O processamento é serializado por usuário para evitar decisões ou alterações concorrentes conflitantes. Salvar configurações ou cheats durante uma análise pode aguardar essa análise; o cancelamento do turno continua disponível no Lumiverse.

## Privacidade, permissões e limites

O perfil auxiliar recebe o histórico completo, incluindo a última mensagem e a descrição da persona. Escolha um provedor apropriado para seu conteúdo. A extensão não salva nem envia chaves à interface: usa o gerenciamento de conexões do Lumiverse. Guarda IDs de perfil/modelo, textos de prompt personalizados, fichas, posição do dado e registros de decisão/rolagem no armazenamento do usuário. Não altera mensagens ou fichas do Lumiverse.

As permissões são: `generation` para a chamada e os perfis; `interceptor` para suspender/injetar o prompt; `personas` e `chats` para o contexto; `chat_mutation` porque a API atual exige essa permissão inclusive para **ler** `chat.getMessages`; `ui_panels` para o widget flutuante. O código não usa operações de edição/exclusão de chat.

A qualidade do julgamento semântico depende do modelo auxiliar. A extensão valida o contrato e determina os resultados no código. Históricos maiores que a janela do provedor falham explicitamente, sem corte silencioso. Presets devem incluir histórico com IDs de origem. A posição final foi verificada nos requests HTTP dos adapters OpenAI e Anthropic atuais; extensões com prioridade posterior ou regex personalizadas que removam texto podem modificar a nota. Prefills continuam no prompt original; a nota OOC vem depois deles, portanto não funciona como continuação literal de um prefill terminal.

## Desenvolvimento e validação

```powershell
bun install --frozen-lockfile
bun run check
```

`check` executa TypeScript, os testes da extensão e compila `dist`. Há testes de regras, parser/limites, OOC, contexto, ficha, isolamento, cache, falhas/cancelamento, cheats persistentes e interface. Os testes de textos cobrem defaults legados, preservação dos nove textos antigos, salvar/recarregar/reset por conta, limites, uso do texto editado no request auxiliar e na nota principal, quatro efeitos em resultados naturais/CHEAT, slots protegidos e replay com efeito atual sem rerrolar nem regravar o registro. A integração DOM verifica os treze editores, seletor de prévia sem execução, histórico com efeito salvo, rascunhos e os fallbacks da interface. A validação da 1.0.4 usa `check`; o canal de integração do host permanece o da 1.0.3. O teste do runtime real usa um clone separado do Lumiverse e dados fictícios:

```powershell
git clone --depth 1 https://github.com/prolix-oc/Lumiverse.git scratch/Lumiverse
cd scratch/Lumiverse
bun install --production
cd ../..
bun run test:host
```

Para conferir a instalação e atualização pela URL pública, defina `RPG_DICE_INSTALL_URL` para a URL do repositório antes de `bun run test:host`. `LUMIVERSE_SOURCE` pode apontar para outro clone. O script cria uma pasta nova em `scratch/host-fixture-*`, usa o instalador e o backend Spindle reais em subprocesso, SQLite, o pipeline completo de geração e endpoints HTTP locais com respostas fictícias. Verifica OpenAI e Anthropic, auxiliar antes do principal, modelos separados, nota final depois do footer do preset, textos editados nos requests reais dos adapters, histórico/auditoria, reset só dos textos e regeneração com texto atual sem nova chamada auxiliar. Não usa credenciais, chats ou serviços de IA reais. Os relatórios locais ficam na fixture e não fazem parte da publicação.

O código original da extensão usa a licença MIT. O material Fate é creditado e licenciado separadamente em [NOTICE](NOTICE). Não há vínculo oficial com Evil Hat Productions ou Lumiverse.

