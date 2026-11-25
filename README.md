# Process bridge

Ponte JSONL para processos de longa duração, migrada para [LógosType](https://github.com/ThinkIac/LogosType). Preserva a API de `@thinkiac/module-process-bridge` do ThinkIac. Esta entrega é apenas migração de linguagem e extração de repositório, sem novos recursos.

## Instalação

```sh
npm install ThinkIac/process-bridge#main
```

Para reprodução, substitua `main` pelo hash desejado. Requer Node >=18 e o executável do runtime escolhido instalado no host. O JavaScript compilado acompanha o pacote; o compilador é dependência de desenvolvimento, fixada por commit.

## Uso

```js
const { ProcessBridge } = require('@thinkiac/module-process-bridge');
const bridge = new ProcessBridge({
  name: 'worker', runtime: 'python', main: 'worker.py', cwd: '/projeto',
  timeoutMs: 30000,
  onRegister: events => console.log('Eventos disponíveis:', events),
  onEmit: (event, payload) => console.log(event, payload),
  onLog: (message, source) => console.log(source, message),
  onError: error => console.error(error),
});
async function main() {
  try {
    if (!bridge.start()) throw new Error('Não iniciou');
    console.log(await bridge.call('echo', {value: 7}));
  } finally { bridge.stop(); }
}
main().catch(console.error);
```

Processo Python correspondente (`worker.py`):

```python
import json, sys
for line in sys.stdin:
    call = json.loads(line)
    print(json.dumps({"op": "result", "id": call["id"], "payload": call.get("payload")}), flush=True)
```

Fluxo: `call(event, payload)` → JSON com ID em stdin → processo → resposta JSON com o mesmo ID em stdout → Promise resolvida ou rejeitada. Cada mensagem termina com uma quebra de linha real. stdout é reservado ao protocolo; logs comuns podem ir para stderr.

## Estrutura

- `src/index.type`: implementação fonte, incluindo a integração Node existente.
- `dist/index.cjs`: artefato compilado; não editar manualmente.
- `index.cjs`: entrada CommonJS compatível.
- `test/fixtures/original.cjs`: original preservado para comparação, excluído do pacote instalado.
- `test/`: testes com processos reais Node e comparações determinísticas.
- [Contrato e limites](docs/contracts.md).
- [Migração e validação](docs/migration.md).

## Desenvolvimento

```sh
npm ci
npm test
node scripts/measure.cjs
npm pack
```

Os testes reais executam Node; os comandos dos demais runtimes são comparados com spawn simulado. A CI cobre Node 18/20/22 em Linux e macOS. Nenhuma garantia de execução em QuickJS/ESP32 é feita: esta migração preserva `child_process`, `readline`, streams e timers do Node.

Licença MIT. A cópia incorporada do ThinkIac não é substituída automaticamente.
