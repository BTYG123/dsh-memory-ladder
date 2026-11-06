# 实体关联与长文窗口检索候选

在dense-gate-v1发现检索缺陷后设计的研究原型，使用两个新种子9109/10453，每种子120实体×12条交错记录、16题。新种子来自相同模板，不是独立题型泛化评测。两模型各32题×3组，共192个评分结果。

## 方法

focused仅改变检索：从问题提取明确的ASCII连字符编号；对带数字锚点的明确别名问题，从用户原始记录关联编号。以最多4个编号限定候选池，在实体内计算词频；长文选择包含最多加权问题词的160字符窗口，并保留原始字符区间。再调用原始排序/序列化器，转换为相同compact格式。不使用标准答案、required来源ID、模型调用或MIST专用正则。未识别编号时退回原检索。

该原型会全量扫描候选记录，尚未针对近30 MiB档案优化，也不能解析任意自然语言别名；没有改动生产默认或可选compact入口，不属于已发布包的文件清单。

| 模型 | 方案 | JSON严格正确 | 规范化答案匹配 | 输入token | 输出token | 费用USD |
|---|---|---:|---:|---:|---:|---:|
| deepseek-flash | baseline | 21/32 | 21/32 | 40445 | 880 | 0.013190 |
| deepseek-flash | compact | 20/32 | 20/32 | 32314 | 891 | 0.010763 |
| deepseek-flash | focused | 30/32 | 30/32 | 22016 | 810 | 0.007577 |
| deepseek-v4-pro | baseline | 18/32 | 20/32 | 40413 | 1028 | 0.057416 |
| deepseek-v4-pro | compact | 20/32 | 21/32 | 32282 | 1140 | 0.047127 |
| deepseek-v4-pro | focused | 26/32 | 29/32 | 21984 | 982 | 0.032908 |

| 检索器 | 必要来源ID齐全 | 必要事实片段齐全 |
|---|---:|---:|
| baseline | 26/32 | 24/32 |
| focused | 32/32 | 32/32 |

空required集合视为齐全。来源ID覆盖与事实覆盖不同；后者要求完整必要短原文或长文唯一锚点。所有摘录必须精确对应原文字符区间，离线审计重新生成检索结果并检查。

- deepseek-flash/baseline：相对baseline新增规范化答案错误 []。
- deepseek-flash/compact：相对baseline新增规范化答案错误 ["10453-visible-arithmetic"]。
- deepseek-flash/focused：相对baseline新增规范化答案错误 []。
- deepseek-v4-pro/baseline：相对baseline新增规范化答案错误 []。
- deepseek-v4-pro/compact：相对baseline新增规范化答案错误 []。
- deepseek-v4-pro/focused：相对baseline新增规范化答案错误 ["10453-fuel"]。

本轮API估算 $0.168980；项目累计 $6.433297 / $10，峰值/缓存未命中单价估计，不是账单；没有摘要调用。

## 失败与解释限制

“规范化答案匹配”沿用此前副分数，仅额外接受完整裸答案，不是人工语义裁判。Flash focused两道联合核查多写“票”，事实值正确但精确答案不符；Pro还出现裸数字、输出算式和余额解释差异，全部保留原分数。

复核发现visible-arithmetic题的“当前燃料73，本轮消耗7”措辞可能被解释为已结算或结算前状态；预设答案66保留，但不应把这类差异单独当成插件导致计算退化的确定证据。今后应明确写“消耗前”与“消耗后”。本轮未事后改题或改答案重算。检索覆盖提升不等于回答全对，更不等于不退化保证。

- deepseek-flash/baseline：{"id":"9109-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"依据最新正式裁决，燃料73为本轮结算余额。\",\"answer\":\"73\"}"}
- deepseek-flash/baseline：{"id":"9109-current-password","expected":"霜-393688","answer":"UNKNOWN","raw":"{\"narrative\":\"缓存仅记录E87最初口令，未提供后续变更或当前口令。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/baseline：{"id":"9109-tail-anchor","expected":"砂-486228","answer":"同一巡航记录内的潮汐","raw":"{\"narrative\":\"原始记录仅含重复的潮汐观测声明，末尾锚点需按原文截取。\",\"answer\":\"同一巡航记录内的潮汐\"}"}
- deepseek-flash/baseline：{"id":"9109-alias-hop","expected":"林9116","answer":"UNKNOWN","raw":"{\"narrative\":\"归档仅记录最初保管员，无后续交接记录。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/baseline：{"id":"9109-alias-rule","expected":"12","answer":"UNKNOWN","raw":"{\"narrative\":\"归档仅含MIST-9109-E35的俗称与最初保管员，未提供通行门槛。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/baseline：{"id":"9109-joint","expected":"林9718|霜-393688|12","answer":"林9718|霜-393688|12票","raw":"{\"narrative\":\"依据正式交接第2次记录，当前保管员为林9718；口令与票数按最新正式修订核对。\",\"answer\":\"林9718|霜-393688|12票\"}"}
- deepseek-flash/baseline：{"id":"10453-current-password","expected":"霜-451480","answer":"UNKNOWN","raw":"{\"narrative\":\"缓存仅记录E87最初口令，未提供后续变更或当前口令。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/baseline：{"id":"10453-tail-anchor","expected":"砂-557460","answer":"UNKNOWN","raw":"{\"narrative\":\"检索到该航路记录，但仅见重复的潮汐观测说明，末尾锚点未显示。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/baseline：{"id":"10453-alias-hop","expected":"林10460","answer":"UNKNOWN","raw":"{\"narrative\":\"归档仅记录最初保管员，无后续交接记录。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/baseline：{"id":"10453-alias-rule","expected":"12","answer":"UNKNOWN","raw":"{\"narrative\":\"归档中仅有俗称与最初保管员记录，未含通行门槛。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/baseline：{"id":"10453-joint","expected":"林11062|霜-451480|12","answer":"林11062|霜-451480|12票","raw":"{\"narrative\":\"依据正式交接第2次记录，林11062为当前保管员；口令与票数取最新正式修订。\",\"answer\":\"林11062|霜-451480|12票\"}"}
- deepseek-flash/compact：{"id":"9109-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"依据最新正式裁决，燃料73为本轮结算余额。\",\"answer\":\"73\"}"}
- deepseek-flash/compact：{"id":"9109-current-password","expected":"霜-393688","answer":"UNKNOWN","raw":"{\"narrative\":\"缓存记录显示 E87 最初口令为藓-338686，但无后续变更记录。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/compact：{"id":"9109-tail-anchor","expected":"砂-486228","answer":"同一巡航记录内的潮汐","raw":"{\"narrative\":\"原始记录仅含重复的潮汐观测声明，末尾锚点需按原文截取。\",\"answer\":\"同一巡航记录内的潮汐\"}"}
- deepseek-flash/compact：{"id":"9109-alias-hop","expected":"林9116","answer":"UNKNOWN","raw":"{\"narrative\":\"归档仅显示最初保管员，缺少后续交接记录。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/compact：{"id":"9109-alias-rule","expected":"12","answer":"UNKNOWN","raw":"{\"narrative\":\"归档仅含MIST-9109-E35的俗称与最初保管员，未提供通行门槛。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/compact：{"id":"9109-joint","expected":"林9718|霜-393688|12","answer":"林9718|霜-393688|12票","raw":"{\"narrative\":\"缓存截止第1次交接，但归档中有第2次正式交接及口令、票数修订。\",\"answer\":\"林9718|霜-393688|12票\"}"}
- deepseek-flash/compact：{"id":"10453-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"依据最新正式裁决，燃料73为本轮结算余额。\",\"answer\":\"73\"}"}
- deepseek-flash/compact：{"id":"10453-current-password","expected":"霜-451480","answer":"UNKNOWN","raw":"{\"narrative\":\"缓存记录显示E87最初口令为藓-388414，但无后续变更证据。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/compact：{"id":"10453-tail-anchor","expected":"砂-557460","answer":"同一巡航记录内的潮汐","raw":"{\"narrative\":\"原始记录末尾锚点已定位。\",\"answer\":\"同一巡航记录内的潮汐\"}"}
- deepseek-flash/compact：{"id":"10453-alias-hop","expected":"林10460","answer":"UNKNOWN","raw":"{\"narrative\":\"归档仅显示最初保管员，无后续交接记录。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-flash/compact：{"id":"10453-alias-rule","expected":"12","raw":"UNKNOWN","error":"Unexpected token 'U', \"UNKNOWN\" is not valid JSON"}
- deepseek-flash/compact：{"id":"10453-joint","expected":"林11062|霜-451480|12","answer":"林11062|霜-451480|12票","raw":"{\"narrative\":\"缓存截止第1次交接，但归档记录显示第2次交接后林11062为当前保管员，口令与票数亦有正式更新。\",\"answer\":\"林11062|霜-451480|12票\"}"}
- deepseek-flash/focused：{"id":"9109-joint","expected":"林9718|霜-393688|12","answer":"林9718|霜-393688|12票","raw":"{\"narrative\":\"以最新正式交接与口令变更为准，缓存截止声明不影响后续原始记录。\",\"answer\":\"林9718|霜-393688|12票\"}"}
- deepseek-flash/focused：{"id":"10453-joint","expected":"林11062|霜-451480|12","answer":"林11062|霜-451480|12票","raw":"{\"narrative\":\"缓存虽截止于第1次交接，但归档中已有第2次交接、口令变更和票数修订的正式记录。\",\"answer\":\"林11062|霜-451480|12票\"}"}
- deepseek-v4-pro/baseline：{"id":"9109-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"最新正式裁决显示当前燃料73，本轮消耗7，结算余额即当前燃料。\",\"answer\":\"73\"}"}
- deepseek-v4-pro/baseline：{"id":"9109-fuel","expected":"282","raw":"282"}
- deepseek-v4-pro/baseline：{"id":"9109-current-rule","expected":"12","raw":"12"}
- deepseek-v4-pro/baseline：{"id":"9109-current-password","expected":"霜-393688","answer":"UNKNOWN","raw":"{\"narrative\":\"历史缓存中仅记录MIST-9109-E87最初访问口令为藓-338686，未提供当前访问口令。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/baseline：{"id":"9109-tail-anchor","expected":"砂-486228","answer":"UNKNOWN","raw":"{\"narrative\":\"历史档案中仅有一条重复的航路记录，未提供末尾锚点原文。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/baseline：{"id":"9109-alias-hop","expected":"林9116","answer":"岑9110","raw":"{\"narrative\":\"历史归档仅记录最初保管员岑9110，未提供后续交接或当前保管人信息。\",\"answer\":\"岑9110\"}"}
- deepseek-v4-pro/baseline：{"id":"9109-alias-rule","expected":"12","answer":"UNKNOWN","raw":"{\"narrative\":\"检索历史档案，未发现苇舟1193874当前通行门槛的票数记录。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/baseline：{"id":"9109-joint","expected":"林9718|霜-393688|12","answer":"林9718|霜-393686|12","raw":"{\"narrative\":\"历史记录显示正式交接第2次后保管员为林9718，口令已变更为霜-393686，通行规则修订为12票。\",\"answer\":\"林9718|霜-393686|12\"}"}
- deepseek-v4-pro/baseline：{"id":"10453-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"最新正式裁决显示燃料73，本轮消耗7，无其他变化。\",\"answer\":\"73\"}"}
- deepseek-v4-pro/baseline：{"id":"10453-current-password","expected":"霜-451480","answer":"UNKNOWN","raw":"{\"narrative\":\"历史缓存中仅记录最初访问口令，未提供当前访问口令的更新信息。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/baseline：{"id":"10453-tail-anchor","expected":"砂-557460","answer":"UNKNOWN","raw":"{\"narrative\":\"历史档案中仅有一条相关事件，内容为重复声明同一巡航记录内的潮汐观测不构成新的出航或资源收支，未提供航路原始记录末尾的锚点原文。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/baseline：{"id":"10453-alias-hop","expected":"林10460","answer":"岑10454","raw":"{\"narrative\":\"历史归档仅记录最初保管员，未提供后续交接或当前保管信息。\",\"answer\":\"岑10454\"}"}
- deepseek-v4-pro/baseline：{"id":"10453-alias-rule","expected":"12","answer":"UNKNOWN","raw":"{\"narrative\":\"检索历史记录，未发现苇舟1369938项目的当前通行门槛票数信息。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/baseline：{"id":"10453-joint","expected":"林11062|霜-451480|12","answer":"林11062|霜-451480|12票","raw":"{\"narrative\":\"历史记录显示正式交接第2次后保管员为林11062，口令已变更为霜-451480，通行规则修订为12票。\",\"answer\":\"林11062|霜-451480|12票\"}"}
- deepseek-v4-pro/compact：{"id":"9109-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"最新正式裁决给出当前燃料73、本轮消耗7，无其他变化，因此结算余额为73。\",\"answer\":\"73\"}"}
- deepseek-v4-pro/compact：{"id":"9109-fuel","expected":"282","raw":"282"}
- deepseek-v4-pro/compact：{"id":"9109-current-password","expected":"霜-393688","answer":"藓-338686","raw":"{\"narrative\":\"历史记录中 MIST-9109-E87 的最初访问口令为藓-338686，且无更新的当前裁决覆盖。\",\"answer\":\"藓-338686\"}"}
- deepseek-v4-pro/compact：{"id":"9109-tail-anchor","expected":"砂-486228","answer":"同一巡航记录内的潮汐观测，不构成新的出航或资源收支。","raw":"{\"narrative\":\"历史记录中仅有一条用户原始记录，内容为重复声明同一巡航记录内的潮汐观测不构成新的出航或资源收支。\",\"answer\":\"同一巡航记录内的潮汐观测，不构成新的出航或资源收支。\"}"}
- deepseek-v4-pro/compact：{"id":"9109-alias-hop","expected":"林9116","answer":"岑9110","raw":"{\"narrative\":\"归档仅记录最初保管员岑9110，无后续交接记录。\",\"answer\":\"岑9110\"}"}
- deepseek-v4-pro/compact：{"id":"9109-alias-rule","expected":"12","answer":"UNKNOWN","raw":"{\"narrative\":\"检索历史记录，仅见E35注册俗称，无任何通行门槛票数信息。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/compact：{"id":"9109-joint","expected":"林9718|霜-393688|12","answer":"林9718|霜-393688|12票","raw":"{\"narrative\":\"核对正式记录：第1287条交接后保管员为林9718；第1047条口令变更为霜-393688；第927条通行要求为12票。\",\"answer\":\"林9718|霜-393688|12票\"}"}
- deepseek-v4-pro/compact：{"id":"10453-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"最新正式裁决给出当前燃料73、本轮消耗7，无其他变化，因此结算余额为73。\",\"answer\":\"73\"}"}
- deepseek-v4-pro/compact：{"id":"10453-current-password","expected":"霜-451480","answer":"藓-388414","raw":"{\"narrative\":\"历史记录中E87最初访问口令为藓-388414，且缓存口令一致，无更新裁决。\",\"answer\":\"藓-388414\"}"}
- deepseek-v4-pro/compact：{"id":"10453-tail-anchor","expected":"砂-557460","answer":"UNKNOWN","raw":"{\"narrative\":\"历史档案中仅有一条用户原始记录，内容为重复声明同一巡航记录内的潮汐观测不构成新的出航或资源收支，未提供其他锚点。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/compact：{"id":"10453-alias-hop","expected":"林10460","answer":"UNKNOWN","raw":"{\"narrative\":\"历史归档仅记录MIST-10453-E1最初保管员为岑10454，未提供后续交接或当前保管人信息。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/compact：{"id":"10453-alias-rule","expected":"12","answer":"UNKNOWN","raw":"{\"narrative\":\"检索历史记录，未发现任何关于项目通行门槛票数的信息。\",\"answer\":\"UNKNOWN\"}"}
- deepseek-v4-pro/focused：{"id":"9109-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"最新正式裁决给出当前燃料73且本轮消耗7，因此结算余额为73。\",\"answer\":\"73\"}"}
- deepseek-v4-pro/focused：{"id":"9109-current-rule","expected":"12","raw":"12"}
- deepseek-v4-pro/focused：{"id":"9109-alias-rule","expected":"12","raw":"12"}
- deepseek-v4-pro/focused：{"id":"10453-visible-arithmetic","expected":"66","answer":"73","raw":"{\"narrative\":\"最新正式裁决给出当前燃料73，本轮消耗7，因此结算余额为73。\",\"answer\":\"73\"}"}
- deepseek-v4-pro/focused：{"id":"10453-fuel","expected":"282","raw":"287 - 18 + 13 = 282","error":"Unexpected non-whitespace character after JSON at position 4 (line 1 column 5)"}
- deepseek-v4-pro/focused：{"id":"10453-current-rule","expected":"12","raw":"12"}

复现：node bench/focused-gate.js --build-only；配置DEEPSEEK_API_KEY后 node bench/focused-gate.js --budget-file <授权账本>。node bench/focused-report.js --budget-file <账本>；node bench/verify-dense.js --focused。协议及所有源文件在调用前注册哈希。
