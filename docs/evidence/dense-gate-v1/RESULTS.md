# 高事实密度与保底自主检索对照

每种子120个项目、每项目12条分阶段交错记录；四种子共5760条记录，每条含事实、修订或有来源标记的干扰。长记录包含重复潮汐观测以检验末尾摘录。不是30 MiB体积测试。每模型64题×4组，共512个评分结果；固定4096字节原格式检索预算，compact转换后不增加证据。

## 结果

| 模型 | 方案 | JSON严格正确 | 事实正确 | 输入token | 输出token | 调用 | 费用USD |
|---|---|---:|---:|---:|---:|---:|---:|
| deepseek-flash | baseline | 44/64 | 44/64 | 81042 | 1771 | 64 | 0.026438 |
| deepseek-flash | compact | 43/64 | 43/64 | 64630 | 1728 | 64 | 0.021463 |
| deepseek-flash | model-choice | 31/64 | 31/64 | 54467 | 1983 | 108 | 0.019892 |
| deepseek-flash | guarded-choice | 43/64 | 43/64 | 62638 | 2030 | 96 | 0.021227 |
| deepseek-v4-pro | baseline | 42/64 | 44/64 | 80978 | 2083 | 64 | 0.115140 |
| deepseek-v4-pro | compact | 44/64 | 44/64 | 64566 | 2375 | 64 | 0.094632 |
| deepseek-v4-pro | model-choice | 30/64 | 30/64 | 51649 | 2501 | 105 | 0.078081 |
| deepseek-v4-pro | guarded-choice | 43/64 | 43/64 | 62523 | 2734 | 97 | 0.101903 |

费用包含全部决策和回答调用，以及失败的保留预付。本轮估算 $0.478775；项目累计 $6.433297 / $10。既定峰值/缓存未命中估算单价，不是实际账单；本轮未生成摘要。

## 检索自身的上限

64题中必要来源ID齐全 52/64；必要短原文或长记录唯一末尾锚点齐全 48/64。无归档需求题的空来源集合视为齐全。来源ID齐全不能证明截取到了所需事实。

- 2027-current-password（current-password）：来源ID齐全=false，缺失ID=["2027-87-8"]。
- 2027-tail-anchor（tail-anchor）：来源ID齐全=true，缺失ID=[]。
- 2027-alias-hop（alias-hop）：来源ID齐全=false，缺失ID=["2027-1-10"]。
- 2027-alias-rule（alias-rule）：来源ID齐全=false，缺失ID=["2027-35-7"]。
- 3253-current-password（current-password）：来源ID齐全=false，缺失ID=["3253-87-8"]。
- 3253-tail-anchor（tail-anchor）：来源ID齐全=true，缺失ID=[]。
- 3253-alias-hop（alias-hop）：来源ID齐全=false，缺失ID=["3253-1-10"]。
- 3253-alias-rule（alias-rule）：来源ID齐全=false，缺失ID=["3253-35-7"]。
- 4591-current-password（current-password）：来源ID齐全=false，缺失ID=["4591-87-8"]。
- 4591-tail-anchor（tail-anchor）：来源ID齐全=true，缺失ID=[]。
- 4591-alias-hop（alias-hop）：来源ID齐全=false，缺失ID=["4591-1-10"]。
- 4591-alias-rule（alias-rule）：来源ID齐全=false，缺失ID=["4591-35-7"]。
- 6829-current-password（current-password）：来源ID齐全=false，缺失ID=["6829-87-8"]。
- 6829-tail-anchor（tail-anchor）：来源ID齐全=true，缺失ID=[]。
- 6829-alias-hop（alias-hop）：来源ID齐全=false，缺失ID=["6829-1-10"]。
- 6829-alias-rule（alias-rule）：来源ID齐全=false，缺失ID=["6829-35-7"]。

这些缺陷在模型调用前已经观察到，但保留原题进行评测，没有删除难例。别名需要先找到编号再追踪交接/规则，当前单次词面检索缺少二跳；一些修订被有界预算挤出；长文本可能围绕编号而非末尾事实截取。门控只决定是否调用同一检索器，不能修复缺失证据。

## 门控与逐项退化

guarded-choice 读取公开的“后续归档尚未核对”状态说明，遇到它直接检索、不花决策调用；其余题由模型先决定，但直接UNKNOWN和无效决策必须检索后再答。没有读取标准答案或required来源ID。完全自主组可直接弃答。

- deepseek-flash/baseline：相对baseline新增事实错误 []；跳检后答错 []；过期保底0次，UNKNOWN保底0次。
- deepseek-flash/compact：相对baseline新增事实错误 ["2027-visible-arithmetic"]；跳检后答错 []；过期保底0次，UNKNOWN保底0次。
- deepseek-flash/model-choice：相对baseline新增事实错误 ["2027-stale-owner","2027-current-rule","2027-fake-instruction","3253-stale-owner","3253-fake-instruction","4591-stale-owner","4591-current-rule","4591-negative","4591-fake-instruction","6829-visible-arithmetic","6829-current-rule","6829-negative","6829-fake-instruction"]；跳检后答错 ["2027-stale-owner","2027-current-rule","2027-fake-instruction","3253-stale-owner","3253-fake-instruction","4591-stale-owner","4591-current-rule","4591-negative","4591-fake-instruction","6829-current-rule","6829-negative","6829-fake-instruction"]；过期保底0次，UNKNOWN保底0次。
- deepseek-flash/guarded-choice：相对baseline新增事实错误 ["2027-current-rule"]；跳检后答错 []；过期保底24次，UNKNOWN保底6次。
- deepseek-v4-pro/baseline：相对baseline新增事实错误 []；跳检后答错 []；过期保底0次，UNKNOWN保底0次。
- deepseek-v4-pro/compact：相对baseline新增事实错误 ["3253-joint"]；跳检后答错 []；过期保底0次，UNKNOWN保底0次。
- deepseek-v4-pro/model-choice：相对baseline新增事实错误 ["2027-current-rule","2027-negative","2027-joint","2027-fake-instruction","3253-current-rule","3253-negative","3253-joint","3253-fake-instruction","4591-current-rule","4591-negative","4591-joint","4591-cross-entity","6829-negative","6829-fake-instruction"]；跳检后答错 ["2027-visible-arithmetic","2027-current-rule","2027-negative","2027-fake-instruction","3253-visible-arithmetic","3253-current-rule","3253-negative","3253-fake-instruction","4591-visible-arithmetic","4591-current-rule","4591-negative","4591-cross-entity","6829-visible-arithmetic","6829-negative","6829-fake-instruction"]；过期保底0次，UNKNOWN保底0次。
- deepseek-v4-pro/guarded-choice：相对baseline新增事实错误 ["2027-joint","4591-joint"]；跳检后答错 ["3253-visible-arithmetic","4591-visible-arithmetic","6829-visible-arithmetic"]；过期保底24次，UNKNOWN保底12次。

主分数保持JSON协议要求；事实分数额外接受完整裸答案（例如66），不在叙事中搜索标准答案。事实分数不能掩盖输出协议失败。

人工核查：Flash compact在2027-visible-arithmetic答73，预设答案66；该题“当前燃料73，本轮消耗7”存在结算前后措辞歧义，不据此单独断言插件导致计算退化。Pro compact在3253-joint多写单位“票”，事实值正确，但不符合精确答案规范。原题、预设答案及分数均未事后修改。运输中断和JSON解析失败也单独保留，不能全部解释为模型知识错误。

## 范围

这是一轮探索性静态对照。使用相同模型参数并逐题轮换组别顺序；没有重复采样或完整AgentLoop轨迹。多实体、语义改写、两跳、纠错、伪造引文、联合核查及未知信息均纳入；场景仍是程序合成，不能外推到任意任务或统计非劣保证。当前默认和可选插件均未因该试验改动。

复现：node bench/dense-gate.js --build-only（离线）；设置DEEPSEEK_API_KEY后 node bench/dense-gate.js --budget-file <共享授权账本>。node bench/dense-report.js --budget-file <账本> 导出证据；node bench/verify-dense.js 离线审计。

压缩证据保留完整四组输入输出、usage、全部合成源记录、缺失来源、逐题失败、公开新鲜度标签及调用账目。生产门控和检索算法未自动更新。
