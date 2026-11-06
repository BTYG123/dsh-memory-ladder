# Token 精简与模型自主检索对照

固定协议 token-gate-v1；两模型各 54 题 × 四组，共 432 个评分结果。模型选择检索时多一次回答调用，决策、输出、错误及失败预留全部计费。

## 结果

| 模型 | 方案 | 严格正确 / 事实正确 | 输入 token | 输出 token | API 调用 | 估算 USD | 相对原格式输入变化 |
|---|---|---:|---:|---:|---:|---:|---:|
| deepseek-flash | baseline | 54/54 / 54/54 | 88049 | 1265 | 54 | 0.027933 | 0.0% |
| deepseek-flash | compact | 54/54 / 54/54 | 67182 | 1246 | 54 | 0.021650 | -23.7% |
| deepseek-flash | model-choice | 52/54 / 52/54 | 49330 | 1368 | 72 | 0.016441 | -44.0% |
| deepseek-flash | no-recall | 41/54 / 41/54 | 41200 | 1314 | 54 | 0.013937 | -53.2% |
| deepseek-v4-pro | baseline | 47/54 / 51/54 | 87953 | 1462 | 54 | 0.121887 | 0.0% |
| deepseek-v4-pro | compact | 52/54 / 53/54 | 67132 | 1597 | 54 | 0.094938 | -23.7% |
| deepseek-v4-pro | model-choice | 53/54 / 53/54 | 48390 | 1733 | 70 | 0.070737 | -45.0% |
| deepseek-v4-pro | no-recall | 42/54 / 42/54 | 40822 | 1501 | 54 | 0.059829 | -53.6% |

本轮费用估算 $0.427352；项目累计 $5.785542 / $10。按峰值/缓存未命中单价统一计算，非实际账单；缓存命中 token 另存证据，不将命中算成上下文 token 减少。

## 如何比较

- baseline：每题始终注入原始有界检索结果。compact：相同事件、顺序、角色、文本及摘录边界，改用列式 JSON、以会话事件序号代替 UUID；完整 ID 映射保留在审计记录。没有删掉事实或缩小检索预算。
- model-choice：先只给现有上下文，允许一次直接回答或请求检索。选择检索后，用 compact 的完全相同证据重新回答；两次调用全部计入。未让模型改写检索词，以单独检验检索门控。
- no-recall：从不提供检索结果，用于判断已有摘要是否足够。它不是生产配置建议。
- 每模型 30 个历史快照来自 long-native-v2（第30–39、70–79、110–119轮，从0计），所有组复用同样的历史、摘要、问题。baseline 请求与历史原请求逐字核验。本轮是静态请求对照，不是重新推进的完整长任务；共同的历史摘要已在之前计费，没有在这四组重复生成。
- 另有预先固定的4种子×6类新题：现有上下文足够、隐藏口令、过期摘要、最初状态、否定规则、未知信息。新题有少量事实，未装入30 MiB档案；历史快照来自此前近30 MiB档案。标准答案和隐藏需求标签不进入模型输入。
- 各题轮换组别执行顺序；温度0。未多次重复采样，结果不等于统计非劣证明，仍可能受缓存和服务端变化影响。

## 逐项退化与跳检

预注册主分数要求JSON的answer字段。试验中发现部分回答给出了正确裸数字，补充报告事后事实分数：仅接受合法answer或完整裸答案，不在长段落中匹配标准答案。该分数不替换主分数，格式失败单独记录。

- deepseek-flash/baseline：相对 baseline 新增严格错误 []；新增事实错误 []；格式错误 0；检索 0 次；标注有归档核查需求却跳检 0 次，其中严格答错 0 次。
- deepseek-flash/compact：相对 baseline 新增严格错误 []；新增事实错误 []；格式错误 0；检索 0 次；标注有归档核查需求却跳检 0 次，其中严格答错 0 次。
- deepseek-flash/model-choice：相对 baseline 新增严格错误 ["new-811-stale-state","new-1237-stale-state"]；新增事实错误 ["new-811-stale-state","new-1237-stale-state"]；格式错误 0；检索 18 次；标注有归档核查需求却跳检 2 次，其中严格答错 2 次。
- deepseek-flash/no-recall：相对 baseline 新增严格错误 ["new-811-hidden-secret","new-811-stale-state","new-811-original-state","new-947-hidden-secret","new-947-stale-state","new-947-original-state","new-947-negative-rule","new-1061-hidden-secret","new-1061-stale-state","new-1061-original-state","new-1237-hidden-secret","new-1237-stale-state","new-1237-original-state"]；新增事实错误 ["new-811-hidden-secret","new-811-stale-state","new-811-original-state","new-947-hidden-secret","new-947-stale-state","new-947-original-state","new-947-negative-rule","new-1061-hidden-secret","new-1061-stale-state","new-1061-original-state","new-1237-hidden-secret","new-1237-stale-state","new-1237-original-state"]；格式错误 0；检索 0 次；标注有归档核查需求却跳检 0 次，其中严格答错 0 次。
- deepseek-v4-pro/baseline：相对 baseline 新增严格错误 []；新增事实错误 []；格式错误 4；检索 0 次；标注有归档核查需求却跳检 0 次，其中严格答错 0 次。
- deepseek-v4-pro/compact：相对 baseline 新增严格错误 []；新增事实错误 []；格式错误 1；检索 0 次；标注有归档核查需求却跳检 0 次，其中严格答错 0 次。
- deepseek-v4-pro/model-choice：相对 baseline 新增严格错误 []；新增事实错误 []；格式错误 0；检索 16 次；标注有归档核查需求却跳检 4 次，其中严格答错 0 次。
- deepseek-v4-pro/no-recall：相对 baseline 新增严格错误 ["new-811-stale-state","new-811-original-state","new-947-stale-state","new-947-original-state","new-1061-stale-state","new-1061-original-state","new-1237-hidden-secret","new-1237-stale-state","new-1237-original-state"]；新增事实错误 ["new-811-stale-state","new-811-original-state","new-947-stale-state","new-947-original-state","new-1061-stale-state","new-1061-original-state","new-1237-hidden-secret","new-1237-stale-state","new-1237-original-state"]；格式错误 0；检索 0 次；标注有归档核查需求却跳检 0 次，其中严格答错 0 次。

“标注有归档核查需求”表示可见记录不含完整原始证据；未知题直接回答UNKNOWN可能仍符合证据不足应弃答的规则，所以跳检数不等于错误数。正确率、实际错误与逐项退化应分开看。

- deepseek-flash/model-choice: {"id":"new-811-stale-state","expected":"洛811","answer":"UNKNOWN","retrieved":false}
- deepseek-flash/model-choice: {"id":"new-1237-stale-state","expected":"洛1237","answer":"UNKNOWN","retrieved":false}
- deepseek-flash/no-recall: {"id":"new-811-hidden-secret","expected":"苔-30026","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-811-stale-state","expected":"洛811","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-811-original-state","expected":"岑811","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-947-hidden-secret","expected":"苔-35058","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-947-stale-state","expected":"洛947","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-947-original-state","expected":"岑947","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-947-negative-rule","expected":"不可以","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-1061-hidden-secret","expected":"苔-39276","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-1061-stale-state","expected":"洛1061","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-1061-original-state","expected":"岑1061","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-1237-hidden-secret","expected":"苔-45788","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-1237-stale-state","expected":"洛1237","answer":"UNKNOWN"}
- deepseek-flash/no-recall: {"id":"new-1237-original-state","expected":"岑1237","answer":"UNKNOWN"}
- deepseek-v4-pro/baseline: {"id":"new-811-visible","expected":"68"}
- deepseek-v4-pro/baseline: {"id":"new-811-hidden-secret","expected":"苔-30026","answer":"UNKNOWN"}
- deepseek-v4-pro/baseline: {"id":"new-947-visible","expected":"68"}
- deepseek-v4-pro/baseline: {"id":"new-947-hidden-secret","expected":"苔-35058","answer":"UNKNOWN"}
- deepseek-v4-pro/baseline: {"id":"new-1061-visible","expected":"68"}
- deepseek-v4-pro/baseline: {"id":"new-1061-hidden-secret","expected":"苔-39276","answer":"UNKNOWN"}
- deepseek-v4-pro/baseline: {"id":"new-1237-visible","expected":"68"}
- deepseek-v4-pro/compact: {"id":"new-947-hidden-secret","expected":"苔-35058","answer":"UNKNOWN"}
- deepseek-v4-pro/compact: {"id":"new-1061-visible","expected":"68"}
- deepseek-v4-pro/model-choice: {"id":"new-811-hidden-secret","expected":"苔-30026","answer":"UNKNOWN","retrieved":true}
- deepseek-v4-pro/no-recall: {"id":"new-811-hidden-secret","expected":"苔-30026","answer":"UNKNOWN"}
- deepseek-v4-pro/no-recall: {"id":"new-811-stale-state","expected":"洛811","answer":"岑811"}
- deepseek-v4-pro/no-recall: {"id":"new-811-original-state","expected":"岑811","answer":"UNKNOWN"}
- deepseek-v4-pro/no-recall: {"id":"new-947-hidden-secret","expected":"苔-35058","answer":"UNKNOWN"}
- deepseek-v4-pro/no-recall: {"id":"new-947-stale-state","expected":"洛947","answer":"岑947"}
- deepseek-v4-pro/no-recall: {"id":"new-947-original-state","expected":"岑947","answer":"UNKNOWN"}
- deepseek-v4-pro/no-recall: {"id":"new-1061-hidden-secret","expected":"苔-39276","answer":"UNKNOWN"}
- deepseek-v4-pro/no-recall: {"id":"new-1061-stale-state","expected":"洛1061","answer":"岑1061"}
- deepseek-v4-pro/no-recall: {"id":"new-1061-original-state","expected":"岑1061","answer":"UNKNOWN"}
- deepseek-v4-pro/no-recall: {"id":"new-1237-hidden-secret","expected":"苔-45788","answer":"UNKNOWN"}
- deepseek-v4-pro/no-recall: {"id":"new-1237-stale-state","expected":"洛1237","answer":"岑1237"}
- deepseek-v4-pro/no-recall: {"id":"new-1237-original-state","expected":"岑1237","answer":"UNKNOWN"}

## 使用边界

生产默认检索行为保持不变。紧凑格式另提供可选入口 dsh-memory-ladder/compact，其完整动态轨迹见 ../long-compact-v1/RESULTS.md；自主检索仅保留实验驱动。未在完整AgentLoop验证自主检索，未证明任意长期级联状态不退化，也未测自由叙事质量；不能仅凭平均节省率上线。

复现：配置 DEEPSEEK_API_KEY，先准备 long-native-v2 记录，再运行 node bench/token-gate.js --budget-file <共享授权账本>；node bench/token-gate-report.js --budget-file <账本>。已有结果会按题目和组别续跑，注册源代码变化会拒绝继续。

离线核验：node bench/verify-token-gate.js。压缩证据包含全部请求响应、usage、题目、原历史请求、ID映射、每组失败及本试验调用账目；不导出整个私有预算文件。
