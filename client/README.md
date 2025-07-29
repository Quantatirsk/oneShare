# File Server React Client

现代化的 React 文件服务器客户端，使用 Vite + TypeScript + Tailwind CSS + shadcn/ui 构建。

## 功能特性

- 🎯 **完整的文件管理** - 上传、下载、删除、重命名、移动文件和目录
- 📝 **代码编辑器** - 集成 Monaco Editor，支持多种编程语言语法高亮
- 🎨 **现代化 UI** - 使用 shadcn/ui 组件库和 Tailwind CSS
- 📱 **响应式设计** - 适配桌面和移动设备
- 🚀 **高性能** - Vite 构建工具，快速开发和构建
- 🎪 **拖拽上传** - 支持拖拽文件和目录上传
- ⌨️ **键盘快捷键** - 完整的键盘导航支持
- 📊 **实时进度** - 上传进度和速度显示
- 🔗 **直链分享** - 生成文件直链用于分享

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **shadcn/ui** - 组件库
- **Radix UI** - 无障碍组件基础
- **Monaco Editor** - 代码编辑器
- **Zustand** - 状态管理
- **React Dropzone** - 拖拽上传

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 使用说明

1. 启动开发服务器后，访问 http://localhost:3000
2. 点击设置按钮配置服务器地址和认证令牌
3. 开始使用文件管理功能

## 环境要求

- Node.js 16+
- npm 7+

## 部署

构建后的文件在 `dist` 目录中，可以部署到任何静态文件服务器。