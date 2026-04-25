# CODEBUDDY.md

This file provides guidance to CodeBuddy when working with code in this repository.

## 项目概述

AYA 是一个开源的 Android 设备控制桌面应用，本质上是 ADB 的 GUI 封装。基于 Electron + React + TypeScript 构建，配合 Kotlin 编写的 Android 端服务。

## 常用命令

```bash
npm i                  # 安装依赖
npm run dev            # 开发模式（同时启动 main、preload、renderer 的热重载）
npm run build          # 生产构建
npm run pack           # 打包可执行文件
npm run adb            # 下载 ADB 工具
npm run server         # 构建 Android 端服务（需要 Java 17 + Android SDK）
npm run scrcpy         # 下载 scrcpy 服务端
npm run lint           # ESLint 检查
npm run format         # Prettier 格式化
npm run gen:pb         # 从 proto 文件生成 Protobuf JS/TS 代码
```

开发环境需要：Node.js 18.x、Java 17、Android SDK。首次开发前需执行 `npm run adb` 和 `npm run scrcpy` 下载外部工具。

## 架构

### Electron 多进程架构

应用分为三个 Vite 构建入口：

- **主进程**（`src/main/`）：Electron 主进程，管理窗口、ADB 连接和设备操作。入口为 `src/main/index.ts`。
- **渲染进程**（`src/renderer/`）：React UI，包含多个独立窗口应用（main、screencast、devices、avd）。每个窗口有自己的 `App.tsx` 和 `store.ts`。
- **预加载脚本**（`src/preload/`）：通过 `contextBridge` 暴露 IPC 接口给渲染进程，定义在 `src/preload/main.ts`。

### IPC 通信模式

主进程通过 `handleEvent` 注册事件处理器（见 `src/main/lib/adb.ts` 底部的 `init()` 函数）。渲染进程通过预加载脚本暴露的 `main.xxx()` 方法调用，接口类型定义在 `src/common/types.ts`。

### ADB 模块

`src/main/lib/adb/` 目录按功能拆分：
- `base.ts` — 基础 shell 操作、ADB 路径管理
- `server.ts` — 通过 Protobuf 与设备端 Kotlin 服务通信（LocalSocket）
- `scrcpy.ts` — 屏幕镜像控制
- `package.ts` / `file.ts` / `shell.ts` / `logcat.ts` — 各自对应应用管理、文件、终端、日志功能
- `fps.ts` / `cpu.ts` — 性能监控

### 状态管理

使用 MobX，每个渲染窗口有独立的 store：
- 主窗口 store 在 `src/renderer/main/store/index.ts`，持有 `devices`、`device`、`panel` 等核心状态，并组合了 `Settings`、`Application`、`File`、`Layout`、`Process`、`Webview` 等子 store。
- screencast、devices、avd 窗口各自有独立的 `store.ts`。

### Android 端服务

`server/server/` 下的 Kotlin 代码编译为 Android 可执行文件，通过 `app_process` 运行。使用 Protobuf（见 `server/server/src/main/proto/wire.proto`）通过 LocalSocket 与主进程通信，提供包管理、文件服务等能力。

### 共享代码

项目使用两个 git 子模块：
- `src/share`（electron-share）— 主进程和渲染进程共享的工具函数、日志、store 基类等
- `src/renderer/icon` — 图标资源

`share` 模块通过 TypeScript 路径别名直接引用，如 `import log from 'share/common/log'`。

### UI 组件

使用自研 `luna-*` 组件库（如 `luna-modal`、`luna-toolbar`、`luna-tab` 等），工具函数使用 `licia` 库。样式使用 SCSS Modules。

### 国际化

语言文件位于 `src/common/langs/`，支持中文（简/繁）、英语、阿拉伯语、俄语、土耳其语、法语、葡萄牙语、西班牙语。

## 代码风格

- TypeScript 严格模式，无分号，单引号（Prettier 配置）
- 路径别名：`src/` 为根目录，`share/` 指向共享子模块
- React 函数组件 + MobX observer 模式
- 所有 IPC 类型在 `src/common/types.ts` 中以 `Ipc` 前缀定义
