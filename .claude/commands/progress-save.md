**功能**：保存当前开发进度为检查点，包含 Git 状态、编辑文件清单、待办步骤列表及恢复指令。

**核心逻辑**：

1. 记录当前 `git status` 和暂存区文件。
2. 列出正在编辑的文件（如 `src/payment-service.ts`）。
3. 记录已完成和待完成的开发步骤（如 "完成退款导出功能后端"）。
4. 生成恢复指令（如 `加载 src/payment-service.ts 并继续实现导出逻辑`）。

**存储位置**：检查点文件保存在 `docs/progress/checkpoints/`，命名格式为 `checkpoint-YYYYMMDD-HHMMSS.md`。

**使用示例**：

/progress-save "完成登录服务器的配置"
