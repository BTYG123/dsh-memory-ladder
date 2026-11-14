# 证据包的两个约束

每个 `docs/evidence/*/` 目录都是**某一次真实运行**的冻结记录，包含：

- `SHA256SUMS`：证据文件自身的校验和（**必须匹配，不匹配就是损坏**）
- `summary.json` / `RESULTS.md`：该次运行的读数
- 内部的 protocol hash、fixture hash、逐条答案（**必须匹配**）

## 源码哈希会漂移，这是预期的

证据还记录了**生成它时的源码哈希**。后续版本只要改动 `index.js` 或 `lib/`，
这个哈希必然变化——那不代表证据坏了，只代表**这份证据描述的是更早的版本**。

因此 `bench/verify-*.js` 的处理是：

| 检查项 | 不匹配时 |
|---|---|
| 证据文件校验和、protocol/fixture 哈希、答案逐条核对 | **失败**（真的坏了）|
| 源码哈希 | **告警并继续**（`⚠ source drift`）|

## 当前对应关系

| 证据包 | 测于 |
|---|---|
| `native-v1`、`long-native-v2`、`long-compact-v1`、`token-gate-v1`、`dense-gate-v1`、`focused-gate-v1`、`dynamic-focused-v1`、`capacity-v1` | v0.3.0 及更早 |

v0.4.0 只在阶梯末尾追加 `↳ 原文 [memory:order:a-b]` 指针行，不改检索、排序或压缩策略；
但它确实改变了 `index.js` 的字节，所以这些包的源码哈希会显示漂移。
**读数本身仍然是那次运行的忠实记录**，引用时应注明测于哪个版本。
