# Migração e validação

Origem: `/code/think/vendor/packages/modules/process-bridge/index.cjs`, preservada exatamente em `test/fixtures/original.cjs`. A versão desta extração mantém o nome npm, classe, constantes, erros, callbacks, comandos e políticas existentes.

Não foram criados tipos declarativos, eventos adicionais, adaptadores ou novas políticas de segurança. Este pacote é uma biblioteca de transporte consumida pelo host, como o original; sua conversão não exige adicionar @register.

## Método

1. Executados os cinco testes existentes contra o original antes da conversão. O timeout da fixture foi ampliado de 80 para 1000ms para não depender da velocidade de criação do processo.
2. Convertido o código para CoffeeScript aceito pelo LógosType, preservando retornos undefined onde CoffeeScript teria retorno implícito.
3. Executados os mesmos testes contra o compilado e adicionadas comparações de traços do original e migrado com plataforma/relógio determinísticos.
4. Verificados concorrência fora de ordem, mensagens, comandos de cada runtime, falhas de spawn/escrita, política onExit, timeout, teto/reset de backoff, reinício, filho antigo e stop.

Os testes demonstram equivalência nos casos cobertos, não equivalência formal para toda entrada. Apenas Node é executado como subprocesso real nos testes. Testes determinísticos simulam o lançamento dos demais runtimes.

## Distribuição

`npm run build` compila src para dist. A entrada CommonJS carrega dist; não instala um hook global de extensões. `prepare` gera os artefatos em instalações Git. O compilador fica fixado ao commit acdcc6032ab94219e0d4a4d25b1538fb55fa19cf de ThinkIac/LogosType. Não há dependência de produção.

Para substituir futuramente a cópia incorporada, instale este repositório fixando um commit e mantenha o mesmo require e opções no consumidor. A substituição no runtime completo é uma etapa separada.

## Medição

`node scripts/measure.cjs` compara caracteres Unicode do original com src/index.type, incluindo comentários, espaços e quebras de linha. Também informa o total incluindo o wrapper index.cjs. Documentação, testes, lockfile, ferramentas e código gerado não entram na economia do fonte. O tamanho instalado e o JavaScript gerado são medidas distintas.

| Comparação | Caracteres |
|---|---:|
| Original .cjs | 5138 |
| Fonte .type | 4662 |
| Fonte .type + entrada CommonJS | 4722 |

Economia do fonte: 476 caracteres (9,26%). Incluindo a entrada: 416 (8,10%). Esta comparação mantém os recursos anteriores, sem a expansão funcional feita na extração de mediated-io.

## Resultado local

Build e 20 testes passaram, sem falhas ou ignorados. Destes, 12 comparam traços completos entre original e migrado; os demais verificam contratos, relógio e integração real Node. A instalação do tarball em diretório temporário, sem dependências de desenvolvimento e sem scripts de instalação, passou novamente nos cinco testes de integração. Isso valida o artefato compilado distribuído. CI remota e substituição no runtime ThinkIac não fazem parte dessa evidência local.
