# Frontend Design 来源综合

这份资料记录 `frontend-design` Skill 的外部判断来源与维护边界。它帮助维护者回到原始材料，不是运行时自动生效的规则；当前行为仍以 [`skills/frontend-design/SKILL.md`](../skills/frontend-design/SKILL.md) 及其按需 references 为准。

## 主来源

[`Trystan-SA/claude-design-system-prompt`](https://github.com/Trystan-SA/claude-design-system-prompt) `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`，MIT License，Copyright Trystan Sarrade。

它最有价值的不是某套视觉风格，而是连续关系：先取得真实设计上下文和内容，再作明确美学承诺，把决定压成 tokens、components 与 states，做出真实交互，最后在可见媒介中迭代。内容必须有责任、界面不能靠模板化装饰显得完整、浏览器证据不能被构建成功替代，这些判断构成 Longrein Skill 的主体。

没有吸收固定提问数量、默认生成多个方案、所有任务都做 tweak panel、关键状态一律写入 localStorage、平台专用 deck/prototype 协议等规则。它们只在特定交付形态成立，写入通用 Skill 会把上下文相关判断变成流程税。

## 次来源

[`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) `4857a2c5ef989794751a0f66b8545a4a49566286`，根仓库为 MIT License，Copyright Next Level Builder；其中 `ui-styling` 子树另带 Apache-2.0 License。

它补充了三个具体层面：Primitive → Semantic → Component 的最小 token 责任、交互状态冲突时的优先级，以及触控、键盘、对比度、响应式和加载的数值下限。Longrein 只把这些当作可被项目现实修订的质量基线。

没有复制它的风格、配色、字体、行业规则、CSV 数据库、BM25 排名、Canvas 字体资产、token 生成器、Tailwind/shadcn 安装脚本或 slide 专用验证器。数据库命中只能提供候选风格，不构成产品证据，也不应让无匹配时静默落入通用模板。

## 综合边界

新 Skill 的文字、结构和判断为 Longrein 原创综合，没有搬运上述仓库的原文段落、代码、数据、模板或资产。未来若直接引入来源内容，应重新核对对应 MIT 或 Apache-2.0 条件，并在分发物中保留所需许可证、版权、修改说明与 NOTICE。
