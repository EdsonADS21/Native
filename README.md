# Native Infinity — versão 6.8

Depois de atualizar os arquivos, recarregue a extensão em brave://extensions e recarregue as páginas abertas.

## Atendimento enquanto segura

No painel Utensílios, escolha Alt+Insert (padrão), Ctrl+Insert ou Shift+Insert em “Comando para segurar”. Mantenha a combinação pressionada para atender as chamadas que aparecerem. O botão “Segure para atender” também funciona enquanto pressionado com o mouse, toque, Espaço ou Enter. O indicador fica verde durante o atendimento automático.

Soltar a tecla/botão, trocar de aba ou perder o foco interrompe novos atendimentos; não encerra a ligação em andamento. A combinação escolhida fica salva. Soltar Insert ou o modificador (Alt, Ctrl ou Shift) interrompe o atendimento automático. F4 continua disponível para atendimento pontual.

O modo de segurar exige foco no conteúdo de uma página onde a extensão funciona. A API de comandos do Brave/Chrome informa a ativação do atalho global, mas não a liberação da tecla. O comando global existente continua atendendo pontualmente. Não associe a tecla de segurar a um atalho reservado do navegador ou de outra extensão.

## Modo Silencioso

Clique em “Modo Silencioso” no painel para silenciar o áudio das abas Native Infinity e ocultar os avisos flutuantes de chamada da extensão em todas as abas. O estado fica salvo e também se aplica a novas abas Native Infinity. Ao desligar, restaura o estado de áudio anterior de cada aba. O microfone continua tendo seu controle independente.

“Escolher atalho do Modo Silencioso” abre os atalhos da extensão no navegador. Localize “Modo Silencioso”, escolha a combinação desejada e o escopo. Os atalhos anteriores permanecem disponíveis. Esta configuração não altera os diálogos próprios do site.

## Black List

No painel Utensílios da aba Native Infinity, preencha “Black List — adicionar números” com um telefone com DDD por linha e clique em “Adicionar à Black List”. Cada adição mantém os números anteriores e limpa o campo. Os telefones aparecem em “Números salvos”, com um botão “Remover” para desbloquear individualmente. A lista fica salva neste navegador e é compartilhada entre as abas. Aceita números formatados e o prefixo +55. O número enviado como exemplo não é bloqueado automaticamente.

O bloqueio vale para F4, comando global, aviso flutuante e atendimento enquanto segura. A extensão lê o telefone na div com o ícone informado, próxima ao botão de atendimento. Bloqueia somente quando identifica um telefone que está na lista. Quando o telefone estiver ausente ou ambíguo, permite atender; nesse caso, não consegue aplicar o bloqueio. Não rejeita nem encerra chamadas; o atendimento manual pelo próprio site e o toque continuam disponíveis.

Execute `node tests/blacklist.test.cjs` para verificar bloqueio, normalização, carregamento e identificação do telefone. Valide também com chamadas reais de um número bloqueado e outro permitido.

## Verificação

Execute `node tests/behavior.test.cjs` para verificar o ciclo de pressionar/soltar, repetição de tecla, perda de foco, troca de aba, escolha de tecla, modo silencioso, restauração do áudio e novas abas com APIs simuladas.

Validação manual no Brave com o Native Infinity: segurar antes da chegada de uma chamada; soltar antes da próxima; ligar/desligar o modo silencioso durante o toque; testar o atalho global escolhido e o microfone. Esses cenários reais dependem de uma sessão autenticada e de chamadas de teste.

Se Alt+Insert estiver registrado como comando global, o navegador pode consumir o evento antes de ele chegar à página. Nesse caso, o comando global mantém o atendimento pontual; para segurar/soltar, remova a associação global conflitante ou escolha outra combinação no painel.
