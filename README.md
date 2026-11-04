# dsh-memory-ladder

> DeepSeek Harness 的分层「睡眠」压缩后端：最新一轮独占窗口的 **1/3**，更早的层级逐层减半（T/6、T/12、T/24…），一次模型调用把将被丢弃的历史重写成一条可追溯的「记忆阶梯」。

[English](README.en.md) | 中文

## 它解决什么

默认压缩策略是「快到窗口上限时，把最老的一段压成摘要」。这在长任务里有两个问题：

1. **触发太晚**：等到 80% 才动手，压缩本身要重放整段历史，请求已经贴着上限。
2. **层级丢失**：压完之后新旧内容混成一个摘要，模型分不清哪些是刚才发生的事、哪些是十轮前的背景。

Memory Ladder 换一种组织方式：**让上下文按新旧分层，每层有各自的预算**——最新一轮永远有最大的空间，越远越薄，最远的只剩一行超链接。

## 策略

设路由模型的上下文窗口为 `T`：

| 层级 | 内容 | 预算 |
|---|---|---|
| 最新一轮 | 上次检查点之后的全部原始消息 | `T/3` |
| 上一轮 | 上一轮压缩出的摘要 | `T/6` |
| 上上轮 | 再往前的摘要 | `T/12` |
| … | 每深一层减半 | `T/(3·2^d)` |

最新一轮与上一轮的比例因此稳定在 **2:1**。

### 一次「睡眠」发生什么

1. 最新一轮的 token 数达到 `T/3`（或模型报告上下文溢出）；
2. 一次模型调用把「旧阶梯 + 本轮原始记录」重写成新阶梯：旧 Tier 0 变成新 Tier 1，逐层下移，最深一层落进归档链接；
3. 事务把被遮蔽的整段历史替换成**一条**用户消息（`surfaceOp: replace`），原始事件仍留在会话日志里，可回放；
4. 本轮从新阶梯继续。

`/compact` 手动命令复用同一条路径，只是跳过阈值判断。

## 实测数据

在真实任务（一次 20 分钟的 CrowdStrike 事件调研）上对比同一策略的两种窗口：

| | 默认 `T/3`（1M 窗口） | 32k 等效窗口 |
|---|---|---|
| 触发线 | 349,525 token | 10,905 token |
| 峰值上下文 | 185,359 token | 32,636 token |
| sleep 次数 | 0 | **10** |
| 会话表面节点 | 266 | 142 |
| 产出 | 41 KB / 23 个来源 | 16 KB / 10 个来源 |

关键结论：**它省的是容量，不是信息本身。** 早期核心事实（推送时刻、受影响设备数、根因编号）跨 10 次睡眠存活，但二级细节会随层级下移被丢弃。完整方法与数据见 [docs/experiment.md](docs/experiment.md)。

## 安装

这是一个 Harness **bundle**：包内自带 `cordis.patch.yml`，会停用官方压缩后端并插入自己的行。

```bash
# 方式一：插件管理器（推荐）
dsh plugin --profile <你的 profile> add dsh-memory-ladder

# 方式二：手动放进 profile 的 node_modules，然后自己在 patch 里加
- id: compaction-basic
  disabled: true
- insert:
    - id: memory-ladder
      name: 'dsh-memory-ladder'
```

> ⚠️ **必须停用 `compaction-basic`**。`ctx.compaction` 只接受一个实现，两个后端同时挂载会在启动时报
> `service "compaction" has been registered`。bundle 的 patch 已包含这一步，手动安装时要自己加。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `newestFraction` | `1/3` | 最新一轮的预算占窗口比例，也就是睡眠触发线 |
| `tierCount` | `6` | 阶梯最多描述多少层 |
| `minTierTokens` | `200` | 更深的层级低于此预算就并进归档链接 |
| `maxSummaryTokens` | `8192` | 睡眠请求的输出上限 |
| `minCompactionTokens` | `512` | 可压缩跨度小于此值直接跳过（避免白花一次模型调用）|
| `summarizationProvider` / `summarizationModel` | 空 | 留空则沿用最近一次路由的 provider/model |
| `auto` | `true` | `false` 只保留手动压缩 |

## 兼容性

- 在 **`@deepseek-ai/dsh@0.2.1-rc.5` + Node 22/24** 上验证通过。
- 继承 `@deepseek-ai/dsh-compaction-basic` 的 `BasicCompactionEngine`：压缩事务（括号锁、收缩校验、表面替换）来自上游，本包只替换触发策略与 `summarize()`。
- `compactRegion()` 是公开契约，相对稳定；构造函数与基类字段属于实现细节，**上游重构可能导致本包失效**。`peerDependencies` 已 pin 到 `0.2.1-rc.5`。

## 已知限制

- **单条超大消息压不动**：一条 5 万 token 的 assistant 输出是不可分割单元，表面压缩无法修复——这是压缩接缝的固有限制，不是本插件引入的。
- **睡眠本身要花一次调用**：若摘要比原文还长，事务会拒绝提交并记录失败；密集睡眠会推高输入成本。
- **不是无损的**：层级会下移，二级细节必然衰减。要无损就调大 `newestFraction`，或者不用本插件。
- **摘要质量取决于模型**：本地无法校验事实是否被忠实保留。

## 开发

```bash
npm test        # 纯逻辑单测：层裁剪、跨度上限、层级预算
```

纯函数在 `lib/pure.js`，`index.js` 与之共用同一份实现，测试覆盖的就是生产代码。

## License

MIT。本包派生自 `@deepseek-ai/dsh-compaction-basic`（MIT），归属声明见 [LICENSE](LICENSE)。
