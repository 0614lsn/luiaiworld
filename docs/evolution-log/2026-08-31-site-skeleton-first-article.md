---
date: 2026-08-31
trigger: 收尾
status: 待审
targets: [docs/testing/browser-keyboard-validation.md]
---

# 站点骨架与首篇 Codex 架构文章自进化复盘

> 本复盘由未参与本次实现的独立 subagent 执行。它只记录事实、分级与待审提案，
> 不把建议视为已采纳，也不修改产品、plan、report、knowledge、skill 或 rule。

## 结论

- P0：0。
- P1：1。应用内浏览器的 Enter 键盘输入通道在同类验证中至少复现 3 次，
  已达到 LDP 对确定性缺陷的升级门槛。
- P2 观察：6 类、各 1 次，共 6 次；均不立提案。
- 产品修复返工：2 轮。C1 与 C2 的产品问题均被既有测试 / review 防线捕获，
  不自动定性为流程缺陷。
- 本轮唯一提案是新增项目级浏览器键盘验证 playbook，并另立宿主通道根因定位需求。
  不提议直接修改 bundled Browser skill。

## 1. 权威取证链

取证顺序严格按 plan → Git 事实 → report → knowledge 执行。

| 顺序 | 证据 | 结论 |
| --- | --- | --- |
| 1 | docs/development/2026-08-31-site-skeleton-first-article-plan.md | Base 为 4b28bcd2；最终 4 个串行 task；默认自动终审；浏览器不可用不得用结构测试冒充视觉 / 行为验证 |
| 2 | git status / log / diff | main 与 origin/main 同为 f19b851；工作区取证时干净；C1、C2、C3 产品提交依次为 7bee2c5、a5a0004、0964a0f；report、no-ff merge、knowledge 提交顺序成立 |
| 3 | docs/development/2026-08-31-site-skeleton-first-article-report.md | Final Code Head 为 0964a0f；2 轮修复；最终 0 Critical、0 Important、0 INCONCLUSIVE，留档 2 个 Minor |
| 4 | docs/knowledge/2026-08-31-site-skeleton-first-article.md 与 INDEX.md | 主线已同步公开 GitHub；交付结果、坑点与 5c 前遗留状态一致 |

会话 / agent 交接只用于补充“某个操作性失误出现过几次”这类 trace，
不承载 Final、测试结论、合并状态或交付结果的唯一事实。

## 2. 编排度量

| 指标 | 数量 / 结论 |
| --- | --- |
| 最终 task 数 | 4：Task G、Task 1、Task F1、Task F2 |
| execution subagent | 1 |
| implementer subagent | 3：初始实现 1、修复 2 |
| tester subagent | 7 |
| whole-branch reviewer | 4 |
| Candidate 周期 | 3：C1、C2、C3 |
| 产品返工轮次 | 2：C1→C2、C2→C3 |
| 正式 BLOCKED | 0 |
| 用户裁决 / 范围决定 | 4：原 plan 批准、新增 GitHub 要求、公开可见性裁决、修订 plan 批准 |
| 用户对实现行为的纠正 | 0 |
| 跳过阶段 | 0；阶段 0–5a 均有证据，当前文件承接 5b |

### Candidate 问题与处置

| 周期 | 问题 | 处置与结果 |
| --- | --- | --- |
| C1 | T1 为 FAIL；review 记录 3 个 Important。可见问题包括移动端三张图标签不可读、官方开源清单与固定仓库源码归因写宽、朱红小字对比度约 3.67:1 | 独立 F1 implementer 增加局部图示视口、修正归因与颜色；形成 C2，并重新执行完整技术、浏览器、内容与 review |
| C2 | T1 为 FAIL；review 记录 1 个 Important。通用可聚焦容器并不会提供可靠 ArrowRight / End 行为 | 独立 F2 implementer 改为无 JS 的左／中／右原生 fragment 导航；形成 C3 |
| C3 | 产品 regression 全 PASS；IAB 键盘通道不确定；最终 review 留 M1、M2 两个 Minor | 同一 Head 通过 Edge 普通链接控制实验、九组真实 Tab+Enter 与 2500 / 3000ms 观察边界关闭通道不确定；冻结为 Final |

## 3. 有效防线与非流程缺陷

以下问题属于正常的产品缺陷或证据缺口，现有流程按设计把它们捕获并关闭，
不因“出现过 bug”就另立流程 P1：

1. C1 的移动图可读性由真实 390×844 浏览器检查发现，证明静态构建和 Node 结构断言
   没有被误当作移动可读性证据。
2. C1 whole-branch review 独立发现来源归因粒度与文字对比度问题；tester / reviewer
   没有参与修复，修复后形成新 Candidate。
3. C2 将 tabindex 当成键盘动作的实现不足被真实浏览器行为和 fresh review 同时阻断，
   随后改为可验证的原生 fragment 导航。
4. C3 的 Node tests 只证明 3 组导航、9 个唯一 target 与关联结构完整；
   report 明确把实际 Tab+Enter、滚动终态和移动布局留给浏览器证据。
5. IAB 通道连普通原生链接都不能 Enter 激活时，团队没有把 click、静态语义或 AI 判断
   冒充键盘 PASS，而是保留不确定性并用有效 Edge 通道补证。
6. 自动终审前完成同一 Final Head 的完整 regression 与 whole-branch review；
   2 个 Minor 进入 report ledger，没有在 Final 后暗改产品。

## 4. P1 立案

### P1-01 — IAB Enter 键盘输入通道重复失效

#### 分级结论

满足 P1。它在同一类“真实键盘激活行为验证”环节至少复现 3 次：

| 次数 | 场景 | Trace |
| --- | --- | --- |
| 1 | C2 technical | 交接 trace 记录 IAB 对普通原生链接也无法用 Enter 激活；权威 report 同期记录键盘动作无法可靠成立 |
| 2 | F2 implementer self-check | plan 的 F2 状态明确保留自动化 Enter concern，而 native click 已能改变局部 scrollLeft；交接 trace 记录普通链接控制同样失败 |
| 3 | C3 technical | report 与 knowledge 明确记录 IAB 连普通链接都无法 Enter 激活，不能据此判断产品失败 |

最终 C3 在 Edge 中先用普通 /articles/ 链接完成有效控制，再对 system、loop、safety
九组链接执行真实 Tab+Enter，均得到 0 < 198.6667 < 666；聚焦等待 2500ms，
平滑滚动等待 3000ms，800ms 过渡帧作废。相同页面与相同 Candidate 在 Edge 通过，
而 IAB 的普通链接控制失败，说明问题更可能位于宿主键盘事件注入、焦点保持或默认激活
动作的通道边界，而不是站点 fragment 实现。这个根因判断仍是推断，尚未完成定位。

三次重复已达到 LDP 的确定性缺陷升级门槛；即使存在 Edge 绕行、没有丢失工作、
最终证据已关闭，也不能继续按 P2 记录。其代价是重复诊断、增加 tester 派发，
并带来把通道故障误判为产品 FAIL 或把 click 误报为键盘 PASS 的风险。

#### 待审提案

- 状态：待审。
- 目标：新增 docs/testing/browser-keyboard-validation.md。
- 边界：只增加项目级测试 playbook；不修改 bundled Browser skill，不把本项目经验
  写成所有浏览器工具的通用规则。宿主通道根因另立独立需求。

建议的具体新增内容：

~~~diff
+++ docs/testing/browser-keyboard-validation.md
+# 浏览器键盘行为验证
+
+## 适用范围
+用于必须证明 Tab、Enter、fragment 定位或滚动终态的真实浏览器验收。
+结构测试只能证明 DOM 关系，不能替代本 playbook。
+
+## 通道控制实验
+1. 记录 Candidate Head、浏览器 / 控制通道和视口。
+2. 先选择页面内普通同源链接，记录 activeElement、目标 URL 与焦点可见性。
+3. 先做 click 控制，再重新聚焦并做真实 Tab+Enter；click 不得替代 Enter。
+4. 普通链接 Enter 失败时，结论为 CHANNEL_INCONCLUSIVE，不得判产品 FAIL 或 PASS。
+5. 切换到独立有效浏览器通道后，使用同一 Head、同一页面和同一断言补证。
+
+## 观察边界
+焦点状态至少稳定观察 2500ms；涉及平滑滚动时至少观察 3000ms。
+800ms 等过渡帧不得作为终态证据。记录 hash、:target、focus、scrollLeft、
+页面根 scrollLeft、console 与截图。
+
+## 产品断言
+只有普通链接控制通过后，才执行产品链接的 Tab+Enter。
+对每个产品链接记录激活前后位置，并确认其他局部视口与页面根不受影响。
+Node / DOM 断言只记为结构证据。
+
+## 根因定位实验
+用同一最小本地页面在 IAB 与 Edge 对照普通链接和 fragment 链接。
+在不修改产品代码的调试层记录 keydown、keyup、click、hashchange 与 activeElement。
+按“键盘事件是否送达 → 焦点是否保留 → 默认 click 是否产生 →
+hash 是否变化 → scroll 是否落稳”定位首个失败边界。
+若首个失败边界属于宿主通道，另立平台问题并附版本、事件 trace 与最小复现；
+未经独立审批不得修改 bundled Browser skill。
~~~

#### 理由

这个新增文件同时解决两件事：先用普通链接控制实验阻止误判，再用固定观察边界减少
过渡帧造成的假失败；根因定位矩阵把“键盘事件未注入、焦点丢失、默认动作未触发、
导航未发生、滚动未落稳”拆成可证伪边界，而不是继续泛称“浏览器不工作”。

#### Trace 依据

- plan：Task F2 完成状态与 T1 浏览器验收边界。
- Git：0964a0f 增加原生 fragment 导航并明确 Node 测试仍需浏览器 regression。
- report：C3 键盘证据、2500 / 3000ms 观察边界、IAB 与 Edge 的通道结论。
- knowledge：IAB 普通链接控制失败、Edge 绕行与平滑滚动终态经验。
- 协作交接补充：C2 technical、F2 self-check、C3 technical 三次复现位置。

#### 采纳后的验证方式

1. 在同一 Candidate 上按 playbook 完成一次 IAB / Edge 对照，证据包含普通链接控制、
   一个 fragment 链接、activeElement、事件序列、hash 与滚动终态。
2. 人为选择普通链接 Enter 失效的通道时，tester 必须得到 CHANNEL_INCONCLUSIVE，
   且不会将 click 结果写成键盘 PASS。
3. 在有效 Edge 通道中，普通链接控制和产品 Tab+Enter 都能按 2500 / 3000ms
   边界收敛，并生成可回溯截图 / 事件记录。
4. 检查提交 diff 只新增项目 playbook；bundled Browser skill 零改动。

## 5. P2 观察账

这些事件各出现 1 次，没有达到确定性缺陷 3 次门槛，也未造成正式 BLOCKED、
工作丢失或用户对实现行为的纠正，因此只计数，不立提案。

| ID | 次数 | 观察 | 证据与分级理由 |
| --- | ---: | --- | --- |
| P2-01 | 1 | 首次 npm install 中断，留下畸形 lock 与受污染 native binding | report / knowledge 均有记录；现场核对后从 package.json 重建 lock，并以 fresh npm ci、check、build、test 关闭；无第二次复现 |
| P2-02 | 1 | 主控的 report parent 校验表达式失败 | 协作交接补充；最终 report 的 Report Parent 与 Final Code Head 相等，report commit parent 正确；未重复、未造成错误工件 |
| P2-03 | 1 | 合并前 ahead 数使用硬编码，出现一次错误 | 协作交接补充；Git 事实最终显示 merge parents 为 Base 与 report head，main 与 origin/main 一致；未形成错误合并 |
| P2-04 | 1 | git status --short 折叠未跟踪目录，导致一次文件盘点视图不完整 | 协作交接补充；后续通过声明文件集、diff 与精确暂存核对关闭，最终 task commit 与状态一致 |
| P2-05 | 1 | 固定源码深链的行锚不精确 | report M2；固定 commit、文件与事实正确，作为产品 Minor 留档；没有声称精确证据已通过 |
| P2-06 | 1 | Node tests 不能证明真实移动可读性和键盘行为 | plan 与 report 已明确分层；真实浏览器在 C1 / C2 捕获 Node tests 无法捕获的问题，说明防线有效而非流程失效 |

P2 总计：6 类、6 次。M1“官方组件枚举非穷尽”同样是 final review 正常捕获的产品 Minor，
正文未声称穷尽；它留在 report ledger，不作为流程提案。

## 6. 待审状态与职责边界

- P1-01 提案保持待审；用户未明确采纳前，不创建目标 playbook，不改任何 skill / rule。
- 如采纳，应另立一个小型 LDP 需求：先新增项目级 playbook，再做宿主输入通道的独立根因定位。
- 本复盘不建议修改 bundled Browser skill。只有根因定位确认其职责内缺陷且获得新的明确授权后，
  才能另案处理。
- 本文件落盘即完成阶段 5b，不在此等待人工闸门。
