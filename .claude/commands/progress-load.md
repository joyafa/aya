**功能**：加载指定检查点，恢复 Git 状态和开发上下文。

**核心逻辑**：

1. 读取 `docs/progress/checkpoints/<checkpoint-name>.md`。
2. 自动加载相关源代码文件。
3. 执行检查点中记录的恢复指令，继续未完成的步骤。

**使用示例**：

/progress-load checkpoint-20260210-143000
