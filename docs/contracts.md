# Contrato preservado

## Construção e API

`new ProcessBridge(options)` exige `name`, `runtime` e `main` verdadeiros. Ausência lança TypeError. `cwd` usa `process.cwd()`, `timeoutMs` usa 30000 e `spawn` usa `child_process.spawn`. Valores falsos de cwd/timeoutMs/spawn preservam os fallbacks antigos.

`start()` retorna booleano. Runtime desconhecido chama `onError` e retorna false. Falha síncrona de spawn chama `onError`, solicita reinício e retorna false. O retorno true indica spawn criado, não prontidão da aplicação. `pid` lê o PID atual ou undefined.

`call(event, payload)` retorna Promise. IDs são strings sequenciais por instância. Sem stdin gravável, rejeita. Falha de escrita remove a chamada pendente e rejeita. Timeout remove apenas a chamada afetada. Resultado atrasado sem ID pendente não resolve outra chamada.

`rejectAll(reason)` rejeita e limpa pendências. `stop()` cancela o último timer de reinício, rejeita pendências, mata o filho e limpa a referência. A instância parada não inicia novamente; crie outra instância.

## Runtimes

| runtime | comando e argumentos |
|---|---|
| python / python3 | python3 main |
| node | node main |
| deno | deno run --allow-all main |
| ruby | ruby main |
| bun | bun main |
| rust | executa main diretamente |

`spawn` recebe `{cwd, stdio: ['pipe','pipe','pipe']}`. Não há shell intermediário.

## Mensagens

| Direção | op | Campos |
|---|---|---|
| Host → processo | event | id, event, payload |
| Processo → host | result | id, payload |
| Processo → host | error | id, message |
| Processo → host | register | events (array; inválido vira array vazio) |
| Processo → host | emit | event, payload |
| Processo → host | log | message |

JSON sintaticamente inválido é ignorado. Operação desconhecida é ignorada. O contrato espera objetos de mensagem; não foi adicionada validação para JSON escalar/null.

`onRegister(events)`, `onEmit(event,payload)`, `onLog(message,source)` e `onError(error)` são opcionais. Fontes de log: lifecycle, stderr e process. Os callbacks são síncronos e seus retornos não são aguardados. `onExit({code,signal}) === true` impede reinício; exceção em onExit é encaminhada a onError.

## Reinício

Fechamento do filho atual rejeita todas as chamadas pendentes. Sem stop ou política onExit que assuma controle, agenda reinício após 500ms, duplicando até 30000ms. Receber result restaura backoff a 500ms, inclusive para ID desconhecido. O timer de reinício usa unref quando disponível. Fechamento de um filho antigo é ignorado.

## Limites herdados

Não há sandbox, autorização, limite de tamanho de mensagem, fila com controle de pressão, retry das chamadas, espera de prontidão nem confirmação assíncrona de encerramento. O host é responsável por essas políticas. Deno mantém --allow-all por compatibilidade. Chamadas repetidas de start e scheduleRestart não receberam novas proteções nesta migração. O transporte continua específico de Node; portabilidade futura exige trabalho separado.
