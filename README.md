# RPG Dice para Lumiverse

Testes automáticos de interpretação com uma IA auxiliar e dados sorteados pelo código. Inclui um pequeno dado flutuante, semitransparente e móvel, histórico do chat e cheats explícitos.

## Instalar

No gerenciador de extensões **Spindle** do Lumiverse, escolha instalar por URL:

```text
https://github.com/luizram17/Lumiverse-RPG-Dice
```

Conceda as permissões solicitadas. O repositório inclui `dist/backend.js` e `dist/frontend.js`; não é necessário compilar para instalar. Para receber a versão **1.0.1**, use a ação de atualização do Spindle e recarregue a página para carregar os arquivos atualizados.

Compatibilidade conferida com **Lumiverse 1.2.5**, fonte `b1a68d9e32e2a2480a0d5ae71422566845f2657b`, e SDK `lumiverse-spindle-types` 0.6.40. O host precisa anunciar `required-interceptors-v1 >= 1`; versões sem esse recurso não podem habilitar os testes. Os runtimes de backend e as permissões são os fornecidos pelo Lumiverse.

## Configurar e usar

1. Cadastre um perfil de conexão no Lumiverse, com sua chave guardada pelo próprio host.
2. Abra **Configurações → RPG Dice** ou a aba **Dados / RPG Dice** na lateral. Escolha o perfil auxiliar e seu modelo no seletor nativo. É possível digitar um ID quando o provedor não oferece catálogo.
3. Escolha cada persona, ajuste suas seis abordagens e salve a ficha. O padrão é **Cuidadoso 3, Astuto 2, Chamativo 2, Enérgico 1, Ágil 1, Furtivo 0**. Cada valor admite inteiros de 0 a 5. Não há distribuição automática ao editar.
4. Habilite os testes, salve e converse normalmente com uma persona selecionada. A conexão e o modelo principais continuam independentes.

A ficha é salva pelo ID da persona, isolada por conta. Trocar o nome preserva os valores; criar outra persona cria outra ficha. A primeira utilização de uma persona salva os valores iniciais.

O dado **⚄** fica com opacidade de 60% em repouso e se destaca ao passar o mouse ou receber foco. Arraste para movê-lo; clique para abrir o histórico e os cheats. A posição fica salva para a conta e limitada à tela. O histórico mostra os quatro dados, soma, abordagem, atributo salvo, bônus, DT, motivo, resultado e eventual CHEAT. Seu conteúdo pertence ao chat aberto.

### Cheats

Há quatro botões: **Falha**, **Sucesso Parcial**, **Sucesso** e **Sucesso Crítico**. Apenas um pode ficar ativo por chat. Enquanto estiver ativo, **toda nova rolagem solicitada recebe obrigatoriamente esse resultado**. O botão permanece ativo até você clicar nele para desligar ou escolher outro.

O código continua sorteando os quatro dados normalmente e mostra o total natural no histórico. O cheat substitui somente a categoria e seu efeito; o registro e a instrução ao narrador identificam **CHEAT**. A IA auxiliar não recebe o estado do cheat. Conversa mundana ou OOC que dispense teste não produz rolagem. Regenerar uma resposta conserva o resultado anterior, inclusive o estado de cheat que aquele teste tinha.

## Regras desta adaptação

O teste é `4dF + abordagem salva + bônus contextual` contra a DT definida antes do sorteio. Cada dado vale −1, 0 ou +1. A fonte é `crypto.getRandomValues`; rejeitar o byte 255 evita viés de módulo.

| Comparação | Resultado | Efeito na narrativa |
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

As instruções escritas pela extensão para a IA auxiliar e para o narrador estão em **inglês**. O auxiliar é orientado a escrever `action` e `reason` em inglês. A nota final usa abordagens, resultados e significados em inglês, inclusive ao reutilizar registros antigos. A interface e os identificadores de fichas/resultados salvos permanecem em português. Nomes, descrições, histórico, OOC e ações originais são preservados no idioma em que foram fornecidos; textos de decisões antigas também são preservados.

O histórico e o resultado são salvos por usuário e chat. A chave de uma ação inclui chat, persona, ID da mensagem e seu texto. A mesma ação reutiliza sua decisão em regenerações, continuações, swipes e reenvios, mesmo após trocar ficha, modelo ou cheat. Editar o texto cria uma nova ação no envio normal. Regenerar/continuar sem uma decisão anterior não cria um teste retroativo. Rascunhos de prompt (`dry run`), impersonação e gerações quietas não rolam. Um ramo criado como novo chat tem armazenamento próprio.

## Falhas e cancelamento

O auxiliar tem limite de 110 segundos; o interceptor, 120. Cancelar o turno no Lumiverse cancela a chamada auxiliar. Falha de conexão, JSON inválido, atributo/DT/bônus fora do contrato, histórico sem identificação de origem ou erro de gravação interrompem o turno principal e exibem aviso. **Nenhum resultado é inventado** e erros não são cacheados. Tente enviar novamente; para continuar conscientemente sem testes, desabilite RPG Dice nas configurações.

Uma decisão já gravada antes de um cancelamento tardio continua salva e será reutilizada. A gravação usa arquivo temporário e renomeação no armazenamento do host. O processamento é serializado por usuário para evitar decisões ou alterações concorrentes conflitantes. Salvar configurações ou cheats durante uma análise pode aguardar essa análise; o cancelamento do turno continua disponível no Lumiverse.

## Privacidade, permissões e limites

O perfil auxiliar recebe o histórico completo, incluindo a última mensagem e a descrição da persona. Escolha um provedor apropriado para seu conteúdo. A extensão não salva nem envia chaves à interface: usa o gerenciamento de conexões do Lumiverse. Guarda somente IDs de perfil/modelo, fichas, posição do dado e registros de decisão/rolagem no armazenamento do usuário. Não altera mensagens ou fichas do Lumiverse.

As permissões são: `generation` para a chamada e os perfis; `interceptor` para suspender/injetar o prompt; `personas` e `chats` para o contexto; `chat_mutation` porque a API atual exige essa permissão inclusive para **ler** `chat.getMessages`; `ui_panels` para o widget flutuante. O código não usa operações de edição/exclusão de chat.

A qualidade do julgamento semântico depende do modelo auxiliar. A extensão valida o contrato e determina os resultados no código. Históricos maiores que a janela do provedor falham explicitamente, sem corte silencioso. Presets devem incluir histórico com IDs de origem. A posição final foi verificada nos requests HTTP dos adapters OpenAI e Anthropic atuais; extensões com prioridade posterior ou regex personalizadas que removam texto podem modificar a nota. Prefills continuam no prompt original; a nota OOC vem depois deles, portanto não funciona como continuação literal de um prefill terminal.

## Desenvolvimento e validação

```powershell
bun install --frozen-lockfile
bun run check
```

`check` executa TypeScript, os testes da extensão e compila `dist`. Há testes de regras, parser/limites, OOC, contexto, ficha, isolamento, cache, falhas/cancelamento, cheats persistentes e interface. O teste do runtime real usa um clone separado do Lumiverse e dados fictícios:

```powershell
git clone --depth 1 https://github.com/prolix-oc/Lumiverse.git scratch/Lumiverse
cd scratch/Lumiverse
bun install --production
cd ../..
bun run test:host
```

Para conferir a instalação e atualização pela URL pública, defina `RPG_DICE_INSTALL_URL` para a URL do repositório antes de `bun run test:host`. `LUMIVERSE_SOURCE` pode apontar para outro clone. O script cria uma pasta nova em `scratch/host-fixture-*`, usa o instalador e o backend Spindle reais em subprocesso, SQLite, o pipeline completo de geração e endpoints HTTP locais com respostas fictícias. Verifica OpenAI e Anthropic, auxiliar antes do principal, modelos separados, nota final depois do footer do preset, histórico/auditoria e regeneração sem nova chamada auxiliar. Não usa credenciais, chats ou serviços de IA reais. Os relatórios locais ficam na fixture e não fazem parte da publicação.

O código original da extensão usa a licença MIT. O material Fate é creditado e licenciado separadamente em [NOTICE](NOTICE). Não há vínculo oficial com Evil Hat Productions ou Lumiverse.

