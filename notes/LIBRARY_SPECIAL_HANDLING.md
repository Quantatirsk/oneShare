# 库特殊处理指南

本文档记录了编译服务中对各种 npm 库的特殊处理案例，包括问题描述、解决方案和维护指南。

## 📋 目录

- [概述](#概述)
- [处理流程](#处理流程)
- [特殊处理案例](#特殊处理案例)
  - [CSS 导入处理](#css-导入处理)
  - [Day.js 插件处理](#dayjs-插件处理)
  - [图标库处理](#图标库处理)
  - [默认导入问题](#默认导入问题)
  - [子路径导入问题](#子路径导入问题)
  - [命名导入转换](#命名导入转换)
- [添加新的特殊处理](#添加新的特殊处理)
- [调试和测试](#调试和测试)

## 概述

在 ESM (ECMAScript Modules) 环境中，许多 npm 库存在导入导出的兼容性问题。我们的编译服务 (`compile.js`) 通过一系列转换函数来自动处理这些问题，确保代码能在浏览器中正常运行。

**核心原则：**
- 自动检测和修复常见的导入问题
- 保持用户代码的简洁性，无需手动处理兼容性
- 支持最流行的 React 生态库
- 优先处理高频使用的库

## 处理流程

### 转换管道执行顺序

```javascript
const transformCode = (code) => {
  // 1. 首先处理CSS导入（必须在其他转换之前）
  let transformedCode = transformCSSImports(code);
  
  // 2. 应用所有导入转换
  transformedCode = transformDayjsImports(transformedCode);
  transformedCode = transformClassnamesImports(transformedCode);
  transformedCode = transformUuidImports(transformedCode);
  transformedCode = transformLucideImports(transformedCode);
  transformedCode = transformHeroiconsImports(transformedCode);
  transformedCode = transformReactToastifyImports(transformedCode);
  transformedCode = transformHookformResolversImports(transformedCode);
  transformedCode = transformReactLibrariesImports(transformedCode);
  
  return transformedCode;
};
```

### CDN 映射配置

所有支持的库都在 `SPECIAL_CDN_MAPPINGS` 中配置对应的 CDN 地址：

```javascript
const SPECIAL_CDN_MAPPINGS = {
  // React 相关
  'react/jsx-runtime': 'https://esm.sh/react@latest/jsx-runtime',
  'react-dom/client': 'https://esm.sh/react-dom@latest/client',
  
  // 工具库
  'dayjs': 'https://esm.sh/dayjs@latest',
  'classnames': 'https://esm.sh/classnames@latest',
  'uuid': 'https://esm.sh/uuid@latest',
  'lodash': 'https://esm.sh/lodash@latest',
  
  // UI 库
  'react-toastify': 'https://esm.sh/react-toastify@latest',
  'qrcode.react': 'https://esm.sh/qrcode.react@latest',
  // ... 更多库
};
```

## 特殊处理案例

### CSS 导入处理

**问题：** ESM 模块中不能直接导入 CSS 文件，会报 MIME 类型错误。

**解决方案：** `transformCSSImports` 函数

**支持的库：**
```javascript
const cssImportMappings = {
  'react-toastify/dist/ReactToastify.css': {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/react-toastify@latest/dist/ReactToastify.css',
    styleId: 'react-toastify-styles'
  },
  'bootstrap/dist/css/bootstrap.min.css': {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/bootstrap@latest/dist/css/bootstrap.min.css',
    styleId: 'bootstrap-styles'
  },
  'antd/dist/reset.css': {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/antd@latest/dist/reset.css',
    styleId: 'antd-reset-styles'
  },
  'react-datepicker/dist/react-datepicker.css': {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/react-datepicker@latest/dist/react-datepicker.css',
    styleId: 'react-datepicker-styles'
  }
};
```

**转换示例：**
```javascript
// 原始代码
import 'react-toastify/dist/ReactToastify.css';
import { toast } from 'react-toastify';

// 转换后
// CSS 样式自动注入
(() => {
  // react-toastify-styles 自动注入
  if (!document.getElementById('react-toastify-styles')) {
    const link = document.createElement('link');
    link.id = 'react-toastify-styles';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/react-toastify@latest/dist/ReactToastify.css';
    document.head.appendChild(link);
  }
})();

import { toast } from 'https://esm.sh/react-toastify@latest';
```

### Day.js 插件处理

**问题：** Day.js 的许多方法（如 `fromNow`）需要额外的插件才能工作。

**解决方案：** `transformDayjsImports` 函数

**插件映射：**
```javascript
const pluginMethodMap = {
  'fromNow': 'relativeTime',
  'toNow': 'relativeTime', 
  'from': 'relativeTime',
  'to': 'relativeTime',
  'quarter': 'quarterOfYear',
  'weekOfYear': 'weekOfYear',
  'isBetween': 'isBetween',
  'utc': 'utc',
  'duration': 'duration',
  // ... 更多方法
};
```

**转换示例：**
```javascript
// 原始代码
import { fromNow, format } from 'dayjs';

// 转换后
import dayjs from 'https://esm.sh/dayjs@latest';
import relativeTimePlugin from 'https://esm.sh/dayjs@latest/plugin/relativeTime';

// 扩展 dayjs 插件
dayjs.extend(relativeTimePlugin);

const fromNow = (date, ...args) => dayjs(date).fromNow(...args);
const format = (date, ...args) => dayjs(date).format(...args);
```

### 图标库处理

#### Lucide React

**问题：** 
1. 图标名称在注释中导致解析失败
2. 不存在的图标需要 fallback 处理

**解决方案：** `transformLucideImports` 函数

**特性：**
- 自动清理导入中的注释
- 验证图标是否存在
- 为不存在的图标提供 fallback
- 支持多行导入和别名

**转换示例：**
```javascript
// 原始代码（带注释）
import { 
  Home, // Home icon
  User as UserIcon, /* User profile icon */
  InvalidIcon // This doesn't exist
} from 'lucide-react';

// 转换后
import { Home, User as UserIcon } from 'https://esm.sh/lucide-react@latest';
import { Origami as InvalidIcon } from 'https://esm.sh/lucide-react@latest';
```

#### Heroicons

**问题：** 子路径导入需要特殊处理。

**解决方案：** `transformHeroiconsImports` 函数

**转换示例：**
```javascript
// 原始代码
import { CalendarDaysIcon } from '@heroicons/react';
import { UserIcon } from '@heroicons/react/24/outline';

// 转换后
import { CalendarDaysIcon } from 'https://esm.sh/@heroicons/react@latest/24/solid';
import { UserIcon } from 'https://esm.sh/@heroicons/react@latest/24/outline';
```

### 默认导入问题

**问题：** 一些库在 ESM 环境下没有默认导出，但开发者习惯用默认导入。

**解决方案：** `transformReactLibrariesImports` 函数

**支持的库：**
```javascript
const defaultToNamedImportMappings = {
  'qrcode.react': 'QRCodeSVG',
  'react-qr-code': 'QRCode',
  'react-barcode': 'Barcode',
  'react-markdown': 'ReactMarkdown',
  'react-syntax-highlighter': 'Prism',
  'react-image-crop': 'ReactCrop',
};
```

**转换示例：**
```javascript
// 原始代码
import QRCode from 'qrcode.react';

// 转换后
import { QRCodeSVG as QRCode } from 'qrcode.react';
```

### 子路径导入问题

**问题：** 包的子路径导入需要正确的 CDN 路径。

**解决方案：** `transformHookformResolversImports` 函数

**转换示例：**
```javascript
// 原始代码
import { yupResolver } from '@hookform/resolvers/yup';
import { zodResolver } from '@hookform/resolvers/zod';

// 转换后
import { yupResolver } from 'https://esm.sh/@hookform/resolvers@latest/yup';
import { zodResolver } from 'https://esm.sh/@hookform/resolvers@latest/zod';
```

### 命名导入转换

**问题：** 一些库被错误地使用命名导入，实际上应该用默认导入。

**解决方案：** `transformClassnamesImports` 函数

**转换示例：**
```javascript
// 原始代码（错误用法）
import { classNames, clsx } from 'classnames';

// 转换后
import classNames from 'https://esm.sh/classnames@latest';
const clsx = classNames;
```

## 添加新的特殊处理

### 1. 识别问题类型

在添加新的特殊处理之前，首先确定问题类型：

- **CSS 导入问题**：添加到 `transformCSSImports` 的 `cssImportMappings`
- **插件依赖问题**：参考 `transformDayjsImports`，创建新的转换函数
- **默认vs命名导入问题**：添加到 `transformReactLibrariesImports` 的 `defaultToNamedImportMappings`
- **子路径导入问题**：参考 `transformHookformResolversImports`，创建新的转换函数
- **注释处理问题**：参考 `transformLucideImports` 的注释清理逻辑

### 2. 添加 CDN 映射

```javascript
// 在 SPECIAL_CDN_MAPPINGS 中添加新库
const SPECIAL_CDN_MAPPINGS = {
  // 现有映射...
  'new-library': 'https://esm.sh/new-library@latest',
};
```

### 3. 创建转换函数（如需要）

```javascript
/**
 * 转换 新库 导入
 * 描述特殊处理的原因和方法
 */
function transformNewLibraryImports(code) {
  // 实现转换逻辑
  return transformedCode;
}
```

### 4. 添加到转换管道

```javascript
const transformCode = (code) => {
  // 现有转换...
  transformedCode = transformNewLibraryImports(transformedCode);
  return transformedCode;
};
```

### 5. 测试验证

创建测试用例验证转换是否正确：

```javascript
// test-new-library.json
{
  "code": "import Something from 'new-library';",
  "libraries": ["react", "new-library"]
}
```

## 调试和测试

### 测试单个库

```bash
# 创建测试文件
echo '{"code": "import Something from \"library-name\";", "libraries": ["react", "library-name"]}' > test.json

# 运行编译测试
cat test.json | node compile.js

# 检查输出和错误
```

### 常见调试技巧

1. **添加调试日志**：
```javascript
console.log(`[LibraryName] Processing: ${importString}`);
```

2. **检查转换结果**：
```javascript
console.log(`[LibraryName] Transformed to: ${result}`);
```

3. **验证正则表达式**：
使用在线正则测试工具验证匹配模式。

4. **测试多种导入方式**：
```javascript
// 测试各种可能的导入格式
import Lib from 'library';
import { method } from 'library';
import Lib, { method } from 'library';
import * as Lib from 'library';
```

### 错误排查指南

**常见错误类型：**

1. **SyntaxError: does not provide an export named 'default'**
   - 解决：添加到 `defaultToNamedImportMappings`

2. **SyntaxError: Expected a JavaScript module script**
   - 解决：添加 CSS 处理

3. **TypeError: method is not a function**
   - 解决：检查插件依赖或方法包装

4. **Module not found**
   - 解决：添加到 `SPECIAL_CDN_MAPPINGS`

## 维护注意事项

1. **性能考虑**：转换函数按使用频率排序，常用的放在前面
2. **向后兼容**：新的转换不应破坏现有功能
3. **测试覆盖**：每个新增的特殊处理都应有对应的测试用例
4. **文档更新**：添加新处理时更新此文档
5. **版本管理**：注意库版本更新可能带来的兼容性变化

---

**最后更新：** 2025-01-07  
**维护者：** Claude Code Team  
**相关文件：** `server/compile_service/node_compiler/compile.js`