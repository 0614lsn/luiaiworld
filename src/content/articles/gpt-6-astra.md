---
title: "GPT-6 Astra 官方提示指南（中文整理）"
description: "围绕主动性、指令遵循、写作风格、子智能体委派与测试验证，完整整理 OpenAI 的 GPT-6 Astra 提示指南与可复制提示词。"
publishedAt: 2026-09-07
tags: ["GPT-6 Astra", "提示词", "官方文档"]
featured: true
status: published
eyebrow: "OPENAI / PROMPTING GUIDE / 中文整理"
cover:
  kicker: "OPENAI / PROMPTING GUIDE"
  subtitle: "官方文档中文整理 · 五个提示方向"
source:
  label: "OpenAI 官方文档 · 中文整理"
  url: "https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra"
  checkedAt: "2026-09-07"
contentNote: "本文为官方文档的中文整理，正文中的‘我们’指原文作者 OpenAI。资料核对于 2026 年 9 月 7 日，后续版本可能变化。"
---

本文依据 OpenAI 官方文档作中文整理，保留指南结构与完整提示词。正文中的“我们”指原文作者 OpenAI；本文不代表 OpenAI 官方中文发布。

## 简介

GPT-6 Astra 是我们迄今最智能的模型，在计算机使用、网页浏览、软件工程、科学研究和专业工作等领域具备最先进的性能。它擅长跨代码、浏览器和专业软件执行多步骤工作流。在[多项评估](https://openai.com/index/gpt-6-astra/)中，Astra 在大幅减少输出 token 用量的同时取得了更强的结果——尽管其单 token 定价更高，但按任务计算的预估 API 成本反而低于早期模型。

GPT-6 Astra 也是我们迄今对齐程度最高的模型。它擅长审慎行事、尊重任务边界并保持透明沟通。当指令存在解释空间时，它会利用现有上下文填补常规性的空白，并在答案可能改变结果时提出有针对性的问题。它能够吸收新的需求、在被要求时调整方向，并在回答题外问题时仍不失对整体任务的把握。

要基于 Astra 进行开发，请在 [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses) 请求中将 `model` 设置为 `gpt-6-astra`。

## 新增功能

- **异步工具调用：** 在你的应用运行某个工具的同时，GPT-6 Astra 可以继续推理、调用其他工具，或回答请求中彼此独立的部分。在函数或自定义工具上设置 `async: true`，并在工具执行完毕后使用原始 `call_id` 返回结果。你的应用仍然负责实际执行工具并管理待处理的工作。基本用法与开发者自定义等待工具（wait-tool）模式，请参阅[异步工具调用](https://developers.openai.com/api/docs/guides/async-tool-calling)。
- **回合中途引导（Mid-turn steering）：** 你可以在 GPT-6 Astra 工作期间发送额外的用户指令，例如更正或需求变更。通过 WebSocket 连接，Responses API 会保留已完成的工作，并将更新纳入后续延续（continuation）中。事件流程与工具结果的处理方式，请参阅[回合中途引导](https://developers.openai.com/api/docs/guides/steering)。
- **在对话中途调整推理力度且保留缓存：** 添加一个 `configuration_update` 输入项，即可为困难任务提高推理力度，或为常规后续任务降低推理力度，而无需重写原始提示词前缀。更新后的推理力度会一直生效，直到被下一个 `configuration_update` 输入项覆盖。示例与兼容性说明，请参阅[在对话中途更改推理力度](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation)。
- **未对齐监控（Misalignment monitoring）：** 作为我们对 GPT-6 Astra [强化安全防护](https://openai.com/index/path-to-astra/)的一部分，我们的系统会异步监控模型未对齐（misalignment）的情况，并在必要时触发警报。详情请参阅[未对齐监控](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)。
- **限制：** GPT-6 Astra 不支持 `none` 推理力度。在欧盟数据驻留（EU data residency）场景下，GPT-6 Astra 无法使用[快速模式](https://developers.openai.com/api/docs/guides/fast-mode)。

GPT-6 Astra 同样支持 GPT-5.6 已有的各项 API 能力，包括[计算机使用](https://developers.openai.com/api/docs/guides/tools-computer-use)、[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[流式传输](https://developers.openai.com/api/docs/guides/streaming-responses)、[程序化工具调用](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)、[多智能体编排](https://developers.openai.com/api/docs/guides/responses-multi-agent)、[提示缓存](https://developers.openai.com/api/docs/guides/prompt-caching)、[持久化推理](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-across-calls)、[压缩](https://developers.openai.com/api/docs/guides/compaction)和 [pro 模式](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode)。

## 提示词最佳实践

GPT-6 Astra 比此前的模型（如 GPT-5.6 Sol）更智能、更强大，同时也表现出一些行为模式——你可以通过针对你的用例进行提示来加以优化。

### GPT-6 Astra 的行为特点

- [主动性与执行力](#主动性与执行力) – 该模型被设计为更高效的协作者，因此在额外输入可能实质性影响结果时，更倾向于向用户提问。这可能导致它在用户本期望其自行做出合理假设并坚持完成时停下来。
- [指令遵循](#指令遵循) – GPT-6 Astra 在通用指令遵循方面强于我们之前的模型，让你对模型行为拥有更大的控制力。它对技能（skill）及其他文件（如 `AGENTS.md`）中包含的指令可能更为敏感。我们**强烈建议**审查模型可访问的技能及其他文件，排查其中可能影响模型行为的指令。
- [个性与写作风格](#个性与写作风格) – 模型倾向于给出细节丰富、格式化的回复，并可能在多个会话中重复使用某些惯用语。请明确指定你的应用所需的写作风格和结构。
- [子智能体委派](#子智能体委派) – 就你的工作流而言，模型的委派频率可能低于你的预期。请明确指定它应在何时、以何种程度使用子智能体并行工作。
- [测试与验证](#测试与验证) – 对于编码任务，模型倾向于在宣布任务完成前进行充分测试。对于较小的任务，这可能导致测试范围超出实际需要。

### 主动性与执行力

GPT-6 Astra 在长任务中保持连贯性方面普遍优于 GPT-5.6 Sol 及更早的模型。同时，在早期模型会直接做出假设的地方，它更倾向于请求澄清。

若要鼓励模型更自主地工作，可以从下面这段提示词开始：

```text
你应当根据指令和先前的对话上下文推断用户的意图和任务范围。你的职责是偏向行动（bias towards action），并将用户想要的任务贯彻到底。

当用户表达了开展新工作或修复现有问题的意图时，请坚持到用户期望的目标完成为止。自主地朝用户的目标推进（例如：需要时创建隔离的 worktree / 检出、解决合并冲突、执行只读操作、创建草稿 PR 等），除非相关操作明显具有破坏性或不可逆。
```

当用户意图不明确时，模型更倾向于先向用户请求澄清再继续。如果用户的提示已经隐含了授权，可以用下面的提示词让模型坚持完成任务：

```text
当用户的提示表达的是行动请求，例如"能不能……""我想……""帮我……"等类似表述时，将其视为执行工作的指示并采取行动。不要停留在确认能力（例如"可以……"）、提出计划或表示"可以继续"的层面。不要为了节省时间、精力或 token 而满足于无法完全满足用户任务的局部方案或"勉强够用"的方案。如果任务需要持续投入，请完成所有必要的工作，直到预期结果达成为止。
```

可以提示模型：只有在准备好具体、可供审查的结果之后才请求批准。这可以避免模型在完成其力所能及的工作之前就阻塞任务，并且通常能让任务更快完成。

```text
在向用户提出澄清问题之前，你应当先完成上下文中已获授权、且能让拟议行动变得具体可审查的工作。用户批准的应当是一个具体、可审查的结果。例如，在部署变更、写入外部应用、合并 PR 或发布站点之前，先完成所有必需的工作，让用户批准成为最后一步。对于可逆的操作、只读操作、审查或修复，以及本会话早些时候已获授权、或从任务指令中可以强烈推知已获授权的事项，你无需再请求用户许可。

不要因为假设性风险而主动加入警告、免责声明、审批流程或安全/合规检查清单。
```

默认情况下，模型还喜欢在工作中途提出一些非阻塞式的问题，因此请根据你的应用所需的自主程度来调整这些提示词。

### 指令遵循

GPT-6 Astra 能够更好地遵循较长的指令，但对上下文中的信息也可能更敏感。例如，技能文件中含糊或相互冲突的指导可能导致模型暂停并提前阻塞工作。请明确说明用户指令与技能之间的优先级。

```text
用户的指令优先于技能中提供的指导。如果用户的明确指令与技能中的指令冲突，以用户的指令为准。
```

让模型指出导致其暂停或改变方向的技能和具体指令，也有助于提高模型行为的透明度。

```text
如果某项技能导致你请求许可或确认、暂停、留下未完成的工作，或偏离用户的意图，请给出你所读取的 SKILL.md 文件的确切名称和链接，引用其中的相关指令，并简要说明它为何适用。请将技能中的明确要求与你自己对指导的解读区分开来。
```

当你的应用加载了大量技能和 `AGENTS.md` 之类的指令文件时，可以使用这段提示词来发现其中隐蔽和相互冲突的指导。

### 个性与写作风格

GPT-6 Astra 倾向于使用列表、表格和 Markdown 让回复易于浏览。如果你的应用需要格式较少的散文式文本，请明确说明这一偏好。

```text
默认使用清晰、简洁的段落，每段只展开一个主要观点。只有当信息确实具有并列、顺序关系，或用列表更便于比较时才使用列表；除非层级关系无法用行文清晰表达，否则避免嵌套列表。使用平实、简单的语言：常见词汇、具体例子和精确的动词。优先使用主动语态和直接陈述。

务必尽早、清楚地陈述要点，然后再展开读者所需的解释和细节。让每一句都承接上句。充分展开真正重要的论点，并提供足够的支撑使其真正有用。
```

对于技术性沟通，下面这段提示词有助于在使用清晰连贯的语言与保持领域专业度之间取得平衡：

```text
优先使用平实语言而非行话，技术细节的引用以有助于向用户说明观点或展示你的工作为限。以清晰、连贯的方式传达复杂概念，并根据用户提示和上下文所反映的背景知识水平来调整写作深度。
```

若要减少写作中的行话和套话，可以从下面这段提示词开始：

```text
避免使用套话（slop）式的词语或短语，例如在结论中用"Bottom Line:"（要点）、"delve"（深入探究）、"foster"（培育）、"leverage"（借助）、"it's worth noting"（值得注意的是）、"importantly"（重要的是）、"问题？答案。"式问答结构，或"这不是关于 X，而是关于 Y"这类句式，以及"genuinely"（真正地）和带连字符的复合描述词与形容词。不要使用"In short:.."（简而言之）、"The simplest mental model is:..."（最简单的思维模型是……）之类的总结性收尾句。

直接说明你要采取的行动。避免补充说明你不会做什么、什么将保持不变，或你将如何区分或归类结果。不要使用"X，而不是 Y"或"X——而非 Y"这类对比式句法去引入用户并未问及的替代选项。避免使用"exact-head checks""editorial-row layouts"这类生造的复合标签、含糊的限定词和套路化的过渡语；使用平实的动词和介词直接陈述实际关系。
```

### 子智能体委派

GPT-6 Astra 经过了相关训练，能够将工作拆分并委派给并行工作的子智能体。如果你正在自己的 harness（智能体执行框架）中实现多智能体系统，可以使用下面这段提示词来调节 GPT-6 Astra 委派工作的程度：

```text
任何时候，只要你能通过把任务委派给其他智能体来并行化工作（无论你是根智能体还是子智能体），并且这样做有可能节省时间或提升质量，就应当使用协作工具来进行委派。
```

智能体之间的消息可能出现语法或空格错误。使用下面这段提示词可以让智能体间的消息更易读：

```text
你发送给其他智能体的消息以及你的最终回答都可能被人类阅读，因此请确保它们清晰可读。始终在单词和/或数字之间保留适当的空格。
```

模型对关于"如何以及何时将工作委派给子智能体"的提示响应良好，因此请调校这一行为，使其契合你的 harness 和多智能体实现。

### 测试与验证

对于编码任务，请校准某项变更所需的测试和验证程度。这有助于避免对小改动进行不必要的测试或重复检查。

```text
对于可逆、低影响的变更，不要编写那些只是复述实现细节的测试。如果你确实选择用测试来验证工作，请确保这些测试对于验证实现是有意义且必要的。

运行与变更相匹配的测试，并完成必需的检查。一旦通过，只有当出现新的变更、失败或未解决的疑虑时才扩大或重复测试；否则，继续推进直到完成任务。
```

## 迁移快速上手

### 使用 Codex 迁移

Codex 可以借助 [OpenAI Docs 技能](https://github.com/openai/skills/tree/main/skills/.curated/openai-docs)来应用本指南中推荐的更改。

```text codex
$openai-docs migrate this project to GPT-6 Astra
```

要在其他编码智能体中使用该技能，请从 [OpenAI skills 仓库](https://github.com/openai/skills/tree/main/skills/.curated/openai-docs)下载。

### 更新 API 与模型参数

将 `model` 设置为 `gpt-6-astra`，然后检查以下事项：

- **推理力度（reasoning effort）：** 如果你目前使用 `none` 或 `minimal`，请先改用 `low` 并对比结果。否则，保留你当前生效的[推理力度](https://developers.openai.com/api/docs/guides/reasoning#reasoning-effort)。在 Responses 中使用 `reasoning.effort`，在 Chat Completions 中使用 `reasoning_effort`。
- **工具调用：** 请使用 [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses#migrating-from-chat-completions)。GPT-6 Astra 支持 Chat Completions，但工具调用必须使用 Responses。
- **不支持的参数：** 移除 `temperature`、`top_p` 和 `top_logprobs`。如果使用 Chat Completions，还要移除 `logprobs`；如果使用 Responses，则从 `include` 中移除 `message.output_text.logprobs`。
- **快速模式：** 欧盟数据驻留场景请使用标准处理（Standard processing）。GPT-6 Astra 在欧盟数据驻留下不支持 `service_tier: "fast"` 或 `service_tier: "priority"`。GPT-6 Astra 的快速模式不包含延迟 SLA。参见[快速模式兼容性](https://developers.openai.com/api/docs/guides/fast-mode#is-fast-mode-compatible-with-data-residency-zero-data-retention-and-a-baa)。
- **动态更改推理力度：** 如果你的应用会在多次响应之间调整推理力度，请在标准的单智能体请求中使用 `configuration_update` 输入项。保持请求级的 `reasoning.effort` 不变，以便保留用于缓存的提示词前缀。采用该功能前，请先查看[兼容性限制](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation)。
- **提示缓存：** 从 GPT-5.5 或更早版本迁移时，请将 `prompt_cache_retention` 替换为 `prompt_cache_options.ttl` 并设置为 `"30m"`。请查阅[提示缓存的变化](https://developers.openai.com/api/docs/guides/prompt-caching#summary-of-model-differences)，包括缓存边界和缓存写入计费。
- **不必要的审批暂停：** 如果你遇到模型在继续之前反复请求批准的问题，请使用[主动性与执行力](#主动性与执行力)部分的指导来提示模型更自主地执行。另请参阅[提示词最佳实践](#提示词最佳实践)的其余部分，获取关于指令遵循、写作风格、子智能体委派和测试的指导。
