# 库特殊处理快速参考

> 快速查找表：当遇到特定库的导入问题时，可以快速定位解决方案。

## 🔍 快速诊断

### 根据错误信息定位问题

| 错误信息 | 问题类型 | 解决方案 |
|---------|---------|---------|
| `does not provide an export named 'default'` | 默认导入问题 | 添加到 `defaultToNamedImportMappings` |
| `Expected a JavaScript-or-Wasm module script but...MIME type of "text/css"` | CSS导入问题 | 添加到 `cssImportMappings` |
| `method is not a function` | 插件依赖问题 | 检查方法是否需要插件支持 |
| `Module not found` | CDN路径问题 | 添加到 `SPECIAL_CDN_MAPPINGS` |

## 📚 已支持的库列表

### ✅ CSS 自动处理
```javascript
'react-toastify/dist/ReactToastify.css'     // ✅
'bootstrap/dist/css/bootstrap.min.css'      // ✅  
'antd/dist/reset.css'                       // ✅
'antd/dist/antd.css'                        // ✅
'react-datepicker/dist/react-datepicker.css' // ✅
```

### ✅ 默认导入自动修复
```javascript
'qrcode.react'           → { QRCodeSVG }      // ✅
'react-qr-code'          → { QRCode }         // ✅  
'react-barcode'          → { Barcode }        // ✅
'react-markdown'         → { ReactMarkdown }  // ✅
'react-syntax-highlighter' → { Prism }       // ✅
'react-image-crop'       → { ReactCrop }     // ✅
```

### ✅ Day.js 插件自动加载
```javascript
fromNow, toNow, from, to         → relativeTime    // ✅
quarter                          → quarterOfYear   // ✅
weekOfYear                       → weekOfYear      // ✅
isBetween                        → isBetween       // ✅
isSameOrAfter, isSameOrBefore    → isSameOrAfter/Before // ✅
utc                              → utc             // ✅
timezone                         → timezone        // ✅
duration                         → duration        // ✅
```

### ✅ 图标库智能处理
```javascript
'lucide-react'           // 图标验证 + fallback + 注释清理  ✅
'@heroicons/react'       // 子路径自动处理               ✅
'@heroicons/react/24/outline'  // 具体路径保持           ✅
'@heroicons/react/20/solid'    // 具体路径保持           ✅
```

### ✅ 子路径导入处理
```javascript
'@hookform/resolvers/yup'        // ✅
'@hookform/resolvers/zod'        // ✅
'@hookform/resolvers/joi'        // ✅
'dayjs/plugin/relativeTime'      // ✅
'dayjs/plugin/duration'          // ✅
```

### ✅ 命名导入自动转换
```javascript
'classnames' // { classNames } → classNames (default)  ✅
'uuid'       // 确保正确的CDN路径                      ✅
```

## 🚀 所有支持的库 CDN 映射

### React 生态
```
react, react-dom, react/jsx-runtime, react-dom/client, react-dom/server
```

### UI 组件库
```
react-bootstrap, bootstrap, react-datepicker, react-toastify
@mui/material, @mui/icons-material, @mui/system
@chakra-ui/react, antd, @ant-design/icons, @ant-design/colors
```

### 表单处理
```
react-hook-form, formik, @hookform/resolvers
```

### 路由
```
react-router-dom, react-router
```

### 图表库
```
chart.js, react-chartjs-2, recharts, d3
```

### QR码和条形码
```
qrcode.react, react-qr-code, react-barcode
```

### 文本和内容
```
react-markdown, react-syntax-highlighter, react-image-crop
```

### 图标库
```
@heroicons/react, lucide-react
```

### 工具库
```
dayjs, classnames, uuid, lodash
```

## 🛠️ 添加新库的步骤

### 1. 快速添加（仅CDN映射）
```javascript
// 在 SPECIAL_CDN_MAPPINGS 中添加
'new-library': 'https://esm.sh/new-library@latest'
```

### 2. CSS导入问题
```javascript
// 在 cssImportMappings 中添加
'new-library/dist/style.css': {
  cdnUrl: 'https://cdn.jsdelivr.net/npm/new-library@latest/dist/style.css',
  styleId: 'new-library-styles'
}
```

### 3. 默认导入问题
```javascript
// 在 defaultToNamedImportMappings 中添加
'new-library': 'CorrectExportName'
```

### 4. 复杂转换（需要新函数）
```javascript
function transformNewLibraryImports(code) {
  // 自定义转换逻辑
  return transformedCode;
}

// 添加到转换管道
transformedCode = transformNewLibraryImports(transformedCode);
```

## 🧪 测试模板

```bash
# 基本测试
echo '{"code": "import Lib from \"library-name\";", "libraries": ["react", "library-name"]}' > test.json
cat test.json | node compile.js

# CSS测试  
echo '{"code": "import \"library/style.css\";", "libraries": ["library"]}' > test.json
cat test.json | node compile.js

# 复杂导入测试
echo '{"code": "import Lib, { method } from \"library\"; import \"library/style.css\";", "libraries": ["library"]}' > test.json
cat test.json | node compile.js
```

---

📖 **详细文档：** [LIBRARY_SPECIAL_HANDLING.md](./LIBRARY_SPECIAL_HANDLING.md)  
🔧 **源代码：** `server/compile_service/node_compiler/compile.js`