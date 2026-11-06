# 高密度档案上的动态检索与余额复核

两模型×两检索器，各90轮、三个独立进程阶段；共360个动态评分。所有轨迹载入相同29.63 MiB容量背景及120实体×12条密集历史（共6440条种子记录），再追加真实Session事件。每10轮真实压缩，每30轮退出进程并恢复。

## 动态结果

| 模型 | 检索器 | JSON严格正确 | 规范化答案匹配 | 输入token | 输出token | 热检索p50 / p95 ms | 费用USD |
|---|---|---:|---:|---:|---:|---:|---:|
| deepseek-flash | compact | 70/90 | 70/90 | 199279 | 6590 | 19.3 / 35.9 | 0.067692 |
| deepseek-flash | focused | 88/90 | 88/90 | 191752 | 7113 | 143.9 / 797.1 | 0.066061 |
| deepseek-v4-pro | compact | 66/90 | 66/90 | 215956 | 8245 | 19.7 / 36.0 | 0.317712 |
| deepseek-v4-pro | focused | 88/90 | 88/90 | 202216 | 8045 | 143.5 / 842.8 | 0.298783 |

- deepseek-flash-compact：压缩9/9，独立进程3，原文直接检索核对3次，窗口超出0次，最终档案30.77 MiB。
- deepseek-flash-focused：压缩9/9，独立进程3，原文直接检索核对3次，窗口超出0次，最终档案30.77 MiB。
- deepseek-v4-pro-compact：压缩9/9，独立进程3，原文直接检索核对3次，窗口超出0次，最终档案30.77 MiB。
- deepseek-v4-pro-focused：压缩9/9，独立进程3，原文直接检索核对3次，窗口超出0次，最终档案30.77 MiB。

- deepseek-flash-focused 相对本次compact轨迹新增规范化错误：[75,79]。
- deepseek-v4-pro-focused 相对本次compact轨迹新增规范化错误：[]。

## 余额措辞复核

独立种子24179，3组数值×明确“消耗前/消耗后已结算”两种表述×4种上下文（无检索、原格式、compact、focused）×2模型，共48次。案例和实现先注册哈希；同一组使用相同系统规则。

- deepseek-flash：JSON严格正确24/24，规范化答案匹配18/24。
- deepseek-v4-pro：JSON严格正确24/24，规范化答案匹配24/24。

这支持使用明确措辞，不证明此前含糊问题只有一种正确理解，也没有事后修改此前题目、标准答案或分数。

## 全部失败

- deepseek-flash-compact: {"turn":5,"type":"5","expected":"林20644","answer":"岑20434","raw":"{\"narrative\":\"苇舟2672864对应MIST-20399-E35，其最初保管员为岑20434；无后续交接裁决\",\"answer\":\"岑20434\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":6,"type":"6","expected":"砂-1083670","answer":"UNKNOWN","raw":"{\"narrative\":\"E87航路记录末尾锚点需从原始记录确认\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":9,"type":"9","expected":"林20644|239|12|霜-877962","answer":"林20644|UNKNOWN|12|霜-877962","raw":"{\"narrative\":\"E35保管员为林20644；无余额记录；通行12票；当前口令霜-877962\",\"answer\":\"林20644|UNKNOWN|12|霜-877962\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":14,"type":"4","expected":"藓-755428","answer":"藓-756378","raw":"{\"narrative\":\"E35最初口令历史不变，仍为藓-756378。\",\"answer\":\"藓-756378\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":15,"type":"5","expected":"林21008","answer":"岑20486","raw":"{\"narrative\":\"苇舟2673748对应MIST-20399-E87，最初保管员岑20486；无后续交接裁决，故当前保管员仍为岑20486。\",\"answer\":\"岑20486\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":16,"type":"6","expected":"砂-1084598","answer":"UNKNOWN","raw":"{\"narrative\":\"E119航路原始记录末尾锚点此前未确认，现有证据不足。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":19,"type":"9","expected":"林21008|282|12|霜-879158","answer":"岑20486|UNKNOWN|12|霜-879158","raw":"{\"narrative\":\"E87保管员岑20486；通行12票；口令霜-879158；余额无任何裁决记录，UNKNOWN。\",\"answer\":\"岑20486|UNKNOWN|12|霜-879158\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":25,"type":"5","expected":"林21232","answer":"岑20518","raw":"{\"narrative\":\"苇舟2674292对应MIST-20399-E119，最初保管员岑20518；无后续交接裁决。\",\"answer\":\"岑20518\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":26,"type":"6","expected":"砂-1081176","answer":"UNKNOWN","raw":"{\"narrative\":\"E1航路原始记录末尾锚点未在现有证据中披露。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":29,"type":"9","expected":"林21232|323|12|霜-879894","answer":"岑20518|UNKNOWN|12|霜-879894","raw":"{\"narrative\":\"E119：保管员岑20518（无后续交接）；资源裁决为出航3次后补充13燃料，未给初始余额，故余额UNKNOWN；通行12票（修订后）；当前口令霜-879894。\",\"answer\":\"岑20518|UNKNOWN|12|霜-879894\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":34,"type":"4","expected":"藓-757024","answer":"霜-879894","raw":"{\"narrative\":\"E119最初口令历史不变，仍为霜-879894。\",\"answer\":\"霜-879894\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":36,"type":"6","expected":"砂-1082162","answer":"UNKNOWN","raw":"{\"narrative\":\"E35航路原始记录末尾锚点未在任何正式裁决中披露，无法确定。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":45,"type":"5","expected":"顾20430","answer":"顾20523","raw":"{\"narrative\":\"苇舟2672864即E1，最新正式交接-4由顾20523保管。\",\"answer\":\"顾20523\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":46,"type":"6","expected":"砂-1083670","answer":"UNKNOWN","raw":"{\"narrative\":\"E87航路原始记录末尾锚点无正式裁决披露，证据不足。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":56,"type":"6","expected":"砂-1084598","answer":"UNKNOWN","raw":"{\"narrative\":\"E119航路原始记录末尾锚点此前核查为UNKNOWN，无正式裁决披露。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":66,"type":"6","expected":"砂-1081176","answer":"UNKNOWN","raw":"{\"narrative\":\"E1航路原始记录末尾锚点未在任何正式裁决中披露。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":74,"type":"4","expected":"藓-757024","answer":"霜-879894","raw":"{\"narrative\":\"E119最初访问口令在历史记录中为霜-879894，后续口令裁决不改变最初口令历史。\",\"answer\":\"霜-879894\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":76,"type":"6","expected":"砂-1082162","answer":"UNKNOWN","raw":"{\"narrative\":\"E35航路原始记录末尾锚点无任何正式裁决或记录披露，证据不足。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":85,"type":"5","expected":"顾20554","answer":"顾20647","raw":"{\"narrative\":\"苇舟2672864即E1，最新正式交接-8由顾20647保管。\",\"answer\":\"顾20647\"}","factualCorrect":false}
- deepseek-flash-compact: {"turn":86,"type":"6","expected":"砂-1083670","answer":"UNKNOWN","raw":"{\"narrative\":\"E87航路原始记录末尾锚点无正式裁决披露，证据不足。\",\"answer\":\"UNKNOWN\"}","factualCorrect":false}
- deepseek-flash-focused: {"turn":75,"type":"5","expected":"顾20523","answer":"顾20399","raw":"{\"narrative\":\"苇舟2672286 即 MIST-20399-E1；最新正式交接-0 由顾20399保管，之后无新交接裁决。\",\"answer\":\"顾20399\"}","factualCorrect":false}
- deepseek-flash-focused: {"turn":79,"type":"9","expected":"顾20523|194|9|桥-1244407","answer":"顾20399|198|5|桥-1244339","raw":"{\"narrative\":\"E1 最新状态：交接-0 后保管员顾20399；资源裁决-0 消耗前202、消耗4，余额198；通行裁决-0 为5票；口令裁决-0 为桥-1244339。\",\"answer\":\"顾20399|198|5|桥-1244339\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":5,"type":"5","expected":"林20644","answer":"岑20434","raw":"{\"narrative\":\"根据注册事件，MIST-20399-E35俗称苇舟2672864，最初保管员岑20434；当前无更新交接裁决。\",\"answer\":\"岑20434\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":6,"type":"6","expected":"砂-1083670","answer":"潮汐","raw":"{\"narrative\":\"航路原始记录末尾唯一锚点为“潮汐”，该记录内潮汐观测不构成新的出航或资源收支。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":9,"type":"9","expected":"林20644|239|12|霜-877962","answer":"林20644|UNKNOWN|12|霜-877962","raw":"{\"narrative\":\"E35当前保管员为林20644；余额无记录；通行票数按正式修订为12票；当前口令为霜-877962。\",\"answer\":\"林20644|UNKNOWN|12|霜-877962\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":15,"type":"5","expected":"林21008","answer":"岑20486","raw":"{\"narrative\":\"俗称苇舟2673748对应MIST-20399-E87，历史注册记录最初保管员为岑20486，未见新的正式交接裁决改变该保管关系。\",\"answer\":\"岑20486\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":16,"type":"6","expected":"砂-1084598","answer":"潮汐","raw":"{\"narrative\":\"E119 航路原始记录末尾唯一锚点按记录为“潮汐”。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":19,"type":"9","expected":"林21008|282|12|霜-879158","answer":"林21008|UNKNOWN|12|霜-879158","raw":"{\"narrative\":\"E87 当前保管员为林21008；余额未见正式裁决记录；通行要求为12票；当前口令为霜-879158。\",\"answer\":\"林21008|UNKNOWN|12|霜-879158\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":24,"type":"4","expected":"藓-756416","answer":"藓-756397","raw":"{\"narrative\":\"E87 最初访问口令在历史记录中为藓-756397，且最新口令裁决未改变最初口令历史。\",\"answer\":\"藓-756397\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":25,"type":"5","expected":"林21232","answer":"岑20518","raw":"{\"narrative\":\"根据注册记录，俗称苇舟2674292对应 MIST-20399-E119，最初保管员岑20518；没有更新的正式交接裁决改变该保管关系。\",\"answer\":\"岑20518\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":26,"type":"6","expected":"砂-1081176","answer":"潮汐","raw":"{\"narrative\":\"E1 航路原始记录末尾唯一锚点为潮汐。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":29,"type":"9","expected":"林21232|323|12|霜-879894","answer":"林21232|UNKNOWN|UNKNOWN|UNKNOWN","raw":"{\"narrative\":\"E119 当前保管员为林21232；余额和通行票数无正式裁决记录，当前口令无正式裁决记录。\",\"answer\":\"林21232|UNKNOWN|UNKNOWN|UNKNOWN\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":35,"type":"5","expected":"顾20399","answer":"岑20400","raw":"{\"narrative\":\"俗称苇舟2672286 对应 MIST-20399-E1，历史注册记录最初保管员为岑20400，当前无更新交接裁决。\",\"answer\":\"岑20400\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":36,"type":"6","expected":"砂-1082162","answer":"潮汐","raw":"{\"narrative\":\"E35 航路原始记录末尾唯一锚点为潮汐。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":45,"type":"5","expected":"顾20430","answer":"岑20434","raw":"{\"narrative\":\"俗称苇舟2672864 对应 MIST-20399-E35，最初保管员岑20434，后续无新交接裁决。\",\"answer\":\"岑20434\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":46,"type":"6","expected":"砂-1083670","answer":"潮汐","raw":"{\"narrative\":\"E87 航路原始记录末尾唯一锚点为潮汐。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":49,"type":"9","expected":"顾20430|234|6|桥-1244356","answer":"岑20434|UNKNOWN|UNKNOWN|UNKNOWN","raw":"{\"narrative\":\"E35 当前保管员为岑20434；余额和通行票数无正式裁决记录，当前口令无正式裁决记录。\",\"answer\":\"岑20434|UNKNOWN|UNKNOWN|UNKNOWN\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":55,"type":"5","expected":"顾20461","answer":"岑20486","raw":"{\"narrative\":\"根据注册记录，俗称苇舟2673748对应 MIST-20399-E87，最初保管员为岑20486；当前无更新的正式交接裁决改变该保管关系。\",\"answer\":\"岑20486\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":56,"type":"6","expected":"砂-1084598","answer":"潮汐","raw":"{\"narrative\":\"E119 航路原始记录末尾唯一锚点为潮汐。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":64,"type":"4","expected":"藓-756416","answer":"藓-756397","raw":"{\"narrative\":\"E87 最初访问口令在历史事件中记录为藓-756397。\",\"answer\":\"藓-756397\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":65,"type":"5","expected":"顾20492","answer":"岑20518","raw":"{\"narrative\":\"俗称苇舟2674292对应MIST-20399-E119，历史注册记录最初保管员为岑20518，未见更新交接裁决。\",\"answer\":\"岑20518\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":66,"type":"6","expected":"砂-1081176","answer":"潮汐","raw":"{\"narrative\":\"E1 航路原始记录末尾唯一锚点按历史记录为潮汐。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":75,"type":"5","expected":"顾20523","answer":"岑20400","raw":"{\"narrative\":\"俗称苇舟2672286对应MIST-20399-E1，历史记录其最初保管员为岑20400，未出现新的正式交接裁决。\",\"answer\":\"岑20400\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":76,"type":"6","expected":"砂-1082162","answer":"潮汐","raw":"{\"narrative\":\"E35 航路原始记录末尾唯一锚点为潮汐。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":85,"type":"5","expected":"顾20554","answer":"岑20434","raw":"{\"narrative\":\"俗称苇舟2672864对应MIST-20399-E35，历史记录中最初保管员为岑20434，未见新的正式交接裁决改变该保管关系。\",\"answer\":\"岑20434\"}","factualCorrect":false}
- deepseek-v4-pro-compact: {"turn":86,"type":"6","expected":"砂-1083670","answer":"潮汐","raw":"{\"narrative\":\"E87 航路原始记录末尾唯一锚点为潮汐。\",\"answer\":\"潮汐\"}","factualCorrect":false}
- deepseek-v4-pro-focused: {"turn":19,"type":"9","expected":"林21008|282|12|霜-879158","answer":"林21008|198|12|霜-879158","raw":"{\"narrative\":\"E87 当前保管员为林21008；余额为198；通行要求12票；当前口令为霜-879158。\",\"answer\":\"林21008|198|12|霜-879158\"}","factualCorrect":false}
- deepseek-v4-pro-focused: {"turn":85,"type":"5","expected":"顾20554","answer":"顾20647","raw":"{\"narrative\":\"俗称苇舟2672864对应MIST-20399-E1，最新正式交接-8后保管员为顾20647。\",\"answer\":\"顾20647\"}","factualCorrect":false}

## 范围与费用

Host脚本接受正式裁决并维护真值，模型回答不改变裁决；跨项目查询会回看非当前项目，摘要和后续上下文则真实受本轨迹模型输出影响。使用真实Harness Session、TokenMeter、系统提示和压缩事务，经过计费桥接调用模型；不是完整AgentLoop、模型自主裁决或自由跑团叙事评分。没有把合成背景生成视为模型历史生成费用。

compact与focused是同一协议的独立轨迹，摘要会不同；两模型四轨迹并行，未重复采样，不能把差异外推为统计非劣保证或纯序列化因果效果。热检索耗时为本机样本，不含模型调用和每30轮的离线核对。focused仍全量扫描，延迟与CPU代价必须和token一起看；默认入口及可选compact入口未改动。

本轮轨迹估算 $0.750248，余额专项 $0.031304；累计账本 $7.214850 / $10。包含全部摘要、回答、失败保留预付，按既定峰值/缓存未命中价格估计，不是服务商账单。

复现：准备capacity-v1种子后，在三个独立进程依次执行 node bench/dynamic-focused.js --phase 1（随后2、3）--budget-file <共享授权账本>。余额专项：node bench/balance-clarity.js --budget-file <账本>。导出：node bench/dynamic-report.js --budget-file <账本>。离线审计：node bench/verify-dynamic.js。

压缩证据包含完整请求响应、全部新旧密集源记录、Session事件、逐题得分、恢复PID、压缩结果、检索耗时和每次调用usage/费用；不重复提交可重建的30MiB容量背景。其源文件哈希在manifest.seedHash中。
