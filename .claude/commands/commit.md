
**功能**：自动分析 Git 变更，生成符合 Conventional Commits 规范的提交信息，并执行 `git add` + `git commit` + `git push`。

**核心逻辑**：

1. 运行 `git status --short` 和 `git diff` 分析所有变更。
2. 根据文件路径判断变更类型（`feat`/`fix`/`docs`/`test`/`refactor`）和影响范围（`backend`/`h5`/`admin`）。
3. 生成规范的提交信息（如 `fix(backend): 修复 OAuth state 被多用户共享问题`）。
4. 执行 `git add . && git commit -m "<message>" && git push`。

**防护机制**：

- 检测暂存区是否包含 `.env`、`application-prod.yml` 或含 `secret`/`password` 的文件，若存在则警告。

**示例输出**：
fix(backend): 修复指定表头不排序的问题
* 1. 点击表头可以排序