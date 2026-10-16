# RPG Dice para Lumiverse

RPG Dice 2.0 usa testes automáticos com dois dados de dez faces, uma ficha com seis atributos e skills por persona, um árbitro auxiliar e resolução determinística no código. Inclui dado flutuante, histórico do chat e cheats persistentes.

## Instalar

No gerenciador de extensões **Spindle** do Lumiverse, escolha instalar por URL:

```text
https://github.com/luizram17/Lumiverse-RPG-Dice
```

Conceda as permissões solicitadas. O repositório inclui os arquivos de runtime `dist/backend.js` e `dist/frontend.js`; para desenvolvimento local, compile antes de instalar uma versão modificada. A interface foi mantida compatível com hosts que não oferecem a aba nativa de configurações, o widget flutuante ou o seletor nativo de modelos.

## Atualização 2.0 e migração

A versão 2.0 troca as antigas abordagens de Fate Accelerated por seis atributos e skills. A migração arquiva as fichas Fate anteriores em `legacyPersonas` por ID de persona e inicia cada nova ficha com os seis atributos em zero e a lista de skills vazia. Os valores antigos não são convertidos em atributos nem sobrescritos.

Textos de prompt personalizados são preservados. Os campos já existentes, incluindo `mainBeforeApproach`, continuam salvos; esse campo agora separa a persona do resumo de atributo e modificadores. A migração acrescenta o novo campo editável `refereeContract`. Os padrões estão em inglês e podem ser escritos em qualquer idioma. O árbitro recebe `refereeSystem` e, em seguida, `refereeContract`, separados por duas quebras de linha. O código valida o esquema da decisão e aplica as regras 2d10 independentemente do texto: o contrato efetivo do código prevalece sobre instruções personalizadas incompatíveis.

Registros anteriores permanecem no histórico como foram gravados e são identificados como **Legado 4dF**. A tela mostra os dados, atributo, bônus legado, total e DT originais sem aplicar a fórmula 2d10 a eles. Rolagens novas exibem os dois dados, atributo, skill escolhida, bônus original e aplicado, total e DT.

## Configurar e usar

1. Cadastre um perfil de conexão no Lumiverse; a chave fica guardada pelo próprio host.
2. Abra **Configurações → RPG Dice** ou a aba **Dados / RPG Dice** na lateral. Escolha o perfil auxiliar e o modelo. Se o provedor não oferecer catálogo, digite o ID do modelo.
3. Escolha uma persona e ajuste seus atributos e skills. Os atributos são **STRENGTH, DEXTERITY, CONSTITUTION, INTELLIGENCE, CHARISMA** e **WISDOM**. Todos começam em zero. A ficha pertence ao ID estável da persona nesta conta.
4. Habilite os testes, salve e converse normalmente. O modelo e a conexão principais continuam independentes.

Atributos e bônus de skills aceitam inteiros assinados seguros, sem teto de jogo. A quantidade de skills não é limitada. Cada skill tem ID estável, nome, descrição e bônus. Ao editar uma ficha, os rascunhos ficam isolados por persona; trocar a persona ou receber uma atualização do histórico não descarta o que ainda não foi salvo.

O auxiliar escolhe o atributo e pode indicar skills candidatas com relevância `full` ou `partial`. O código seleciona no máximo uma skill: usa a de maior bônus entre as `full`; se nenhuma `full` foi indicada, usa a de maior bônus entre as `partial` e aplica metade do bônus. Em caso de empate, mantém a primeira candidata na resposta do auxiliar. Metades fracionárias são mantidas, inclusive para bônus negativos. Sem skill candidata, o bônus de skill é zero.

O dado **⚄** fica com opacidade de 60% em repouso e se destaca ao passar o mouse ou receber foco. Arraste para movê-lo; clique para abrir o histórico e os cheats. A posição fica salva para a conta e limitada à tela. O histórico pertence ao chat aberto. Resultados antigos continuam usando os textos de efeito atuais quando reapresentados, sem mudar a rolagem gravada.

## Regras 2d10

O teste é `2d10 + atributo + bônus aplicado da skill` contra uma DT inteira positiva. Não existe bônus contextual separado. O código usa uma fonte aleatória criptográfica e resolve o resultado sem pedir à IA uma classificação pós-rolagem.

| Regra | Resultado |
|---|---|
| Os dois dados mostram 10 | Sucesso Crítico natural, independentemente da DT |
| Total igual ou acima da DT | Sucesso |
| Total desde `DT − 4` até abaixo da DT | Sucesso Parcial |
| Total abaixo de `DT − 4` | Falha |

Escala sugerida: **DT 5 trivial, 10 fácil, 15 moderada, 20 difícil, 25 muito difícil, 30 heroica e 35 lendária**. São referências; qualquer DT inteira positiva é válida. A ficha não limita os valores de atributo ou skill.

Se uma ação for mundana, não requerer teste ou tiver resultado definido por instrução OOC, o auxiliar não pede rolagem. Instruções entre `((...))` têm precedência sobre a história. O auxiliar decide antes do sorteio e nunca recebe dados ou resultado para alterá-los depois. Os cheats persistentes podem forçar uma categoria em novas rolagens; a auditoria mantém os dados naturais e marca o resultado forçado como **CHEAT**.

## Textos dos modelos

Na aba de configurações, expanda **Editar textos enviados aos modelos**. Há quatorze campos editáveis:

- **Árbitro auxiliar:** `refereeSystem` contém papel e diretrizes de OOC; `refereeContract` descreve as regras e o formato esperado. O código envia o segundo depois do primeiro, separado por duas quebras de linha. Ambos são editáveis, mas o código sempre valida o esquema e resolve o resultado segundo as regras implementadas.
- **Principal:** oito trechos fixos formam a nota OOC final. A chave `mainBeforeApproach` é preservada por compatibilidade e agora aparece como separador antes do resumo de atributo e modificadores.
- **Efeitos:** quatro descrições independentes para Falha, Sucesso Parcial, Sucesso e Sucesso Crítico. Esses textos só orientam o modelo principal; não alteram a categoria calculada.

Os campos tracejados são exemplos somente leitura. A prévia não chama modelos, não sorteia dados e não altera cheats. A interface trata os textos como texto; não executa HTML, código ou templates. Restaurar os padrões altera somente os textos de prompt; conexões, fichas, histórico e cheats permanecem salvos.

## Histórico, contexto e privacidade

O auxiliar recebe a persona, os seis atributos, as skills, o histórico textual do ramo atual e a ação mais recente. A conexão escolhida pode enviar esse conteúdo ao provedor do modelo auxiliar; escolha um provedor apropriado. A extensão armazena IDs de perfil e modelo, prompts personalizados, fichas, posição do widget e registros de decisão/rolagem no armazenamento do usuário. Não altera mensagens ou fichas do Lumiverse.

O interceptor obrigatório pausa o modelo principal, faz uma chamada ao árbitro, valida sua decisão, sorteia no código e grava o registro. Depois inclui a nota OOC final no prompt do modelo principal. A chave de cada ação inclui chat, persona, ID da mensagem e texto; regenerações e reenvios reutilizam o resultado existente em vez de rolar novamente. A IA principal não pode refazer nem reclassificar o teste.

As permissões são `generation`, `interceptor`, `personas`, `chats`, `chat_mutation` e `ui_panels`. A API atual do Lumiverse exige `chat_mutation` também para ler `chat.getMessages`; a extensão usa essa leitura para montar o contexto e não edita nem exclui conteúdo do chat. Versões do Lumiverse sem interceptores obrigatórios não podem habilitar os testes. O histórico completo e a descrição da persona são enviados ao modelo auxiliar selecionado.

## Desenvolvimento e validação

```powershell
bun install --frozen-lockfile
bun run check
```

`check` valida TypeScript, executa os testes da extensão e compila os bundles de runtime. Os testes de interface DOM podem ser executados explicitamente com:

```powershell
bun test tests/frontend.test.ts
```

O teste de host usa um clone separado do Lumiverse e dados fictícios; configure `RPG_DICE_INSTALL_URL` somente se for verificar a instalação pela URL pública. O código original da extensão usa licença MIT. O material Fate é creditado e licenciado separadamente em [NOTICE](NOTICE). Não há vínculo oficial com Evil Hat Productions ou Lumiverse.
