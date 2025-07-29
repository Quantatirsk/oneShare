#!/usr/bin/env node
/**
 * TSX 编译器 - 使用原生 esbuild 编译 TypeScript/React 代码
 * 
 * 输入格式 (通过 stdin):
 * {
 *   "code": "const App = () => <div>Hello</div>;",
 *   "libraries": ["react", "react-dom"],
 *   "options": {
 *     "target": "es2020",
 *     "format": "esm",
 *     "minify": false,
 *     "sourceMap": false,
 *     "jsx": "automatic"
 *   }
 * }
 * 
 * 输出格式 (通过 stdout):
 * {
 *   "success": true,
 *   "compiledCode": "...",
 *   "sourceMap": "...",
 *   "dependencies": ["react"],
 *   "assets": [],
 *   "error": null
 * }
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';
import prettier from 'prettier';
import { createVirtualFileSystemPlugin } from './plugins/virtual-fs.js';
import { createDynamicImportPlugin } from './plugins/dynamic-import.js';
import { createLibraryResolvePlugin } from './plugins/library-resolve.js';
import { ASTAutoFixer } from './ast/auto-fix.js';
import { ImportFixer } from './ast/import-fixer.js';
import { TSXParser } from './ast/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 验证修复后的代码语法
 * @param {string} code - 修复后的代码
 * @param {string} stage - 修复阶段名称
 * @returns {Promise<object>} 验证结果
 */
async function validateFixedCode(code, stage = '未知阶段') {
  try {
    const parser = new TSXParser();
    const parseResult = parser.parse(code, `${stage}-validation.tsx`);
    
    if (parseResult.success) {
      return {
        isValid: true,
        stage,
        message: `${stage}代码语法验证通过`
      };
    } else {
      return {
        isValid: false,
        stage,
        error: parseResult.errors?.map(e => e.message).join(', ') || '解析失败',
        message: `${stage}代码语法验证失败`
      };
    }
  } catch (error) {
    return {
      isValid: false,
      stage,
      error: error.message,
      message: `${stage}代码验证异常`
    };
  }
}

/**
 * 判断是否应该回滚到原始代码
 * @param {array} stages - 修复阶段信息
 * @returns {boolean} 是否应该回滚
 */
function shouldRollbackToOriginal(stages) {
  // 如果没有任何修复成功，直接回滚
  const successfulStages = stages.filter(s => s.success && s.fixesApplied > 0);
  if (successfulStages.length === 0) {
    return true;
  }
  
  // 如果最终验证失败，但有成功的修复，根据修复类型决定
  const hasImportFixes = stages.some(s => s.stage === 'import_fix' && s.success && s.fixesApplied > 0);
  const hasAstFixes = stages.some(s => s.stage === 'ast_fix' && s.success && s.fixesApplied > 0);
  
  // 如果只有样式修复失败，可以保留；但如果导入或AST修复后验证失败，应该回滚
  if (hasImportFixes || hasAstFixes) {
    const finalValidationFailed = stages.some(s => s.stage === 'final_validation' && !s.success);
    return finalValidationFailed;
  }
  
  return false;
}

/**
 * 格式化JavaScript代码
 * 保持中文字符和可读性
 */
async function formatCode(code, options = {}) {
  try {
    const formatOptions = {
      parser: 'babel',
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      useTabs: false,
      printWidth: 100,
      trailingComma: 'es5',
      bracketSpacing: true,
      bracketSameLine: false,
      arrowParens: 'avoid',
      // 保持中文字符不被转义
      htmlWhitespaceSensitivity: 'strict',
      // 自定义配置
      ...options
    };

    return await prettier.format(code, formatOptions);
  } catch (error) {
    // 如果格式化失败，返回原代码
    console.warn('代码格式化失败，返回原代码:', error.message);
    return code;
  }
}

// 默认编译选项
const DEFAULT_OPTIONS = {
  target: 'es2020',
  format: 'esm',
  minify: false,
  sourceMap: false,
  jsx: 'automatic',
  // 可读性选项
  keepNames: true,
  formatCode: true,
  preserveComments: false,
  preserveWhitespace: true,
  humanReadable: true,
  // 自动修复选项
  enableAutoFix: true,
  enableImportFix: false,
  autoFixAttempts: 2
};

// 预定义的特殊库映射（有特殊路径或版本要求的）
const SPECIAL_CDN_MAPPINGS = {
  'react/jsx-runtime': 'https://esm.sh/react@latest/jsx-runtime',
  'react-dom/client': 'https://esm.sh/react-dom@latest/client',
  'react-dom/server': 'https://esm.sh/react-dom@latest/server',
  // Date/Time libraries
  'dayjs': 'https://esm.sh/dayjs@latest',
  // Utility libraries
  'classnames': 'https://esm.sh/classnames@latest',
  'uuid': 'https://esm.sh/uuid@latest',
  'lodash': 'https://esm.sh/lodash@latest',
  'hex-rgb': 'https://esm.sh/hex-rgb@latest',
  'chalk': 'https://esm.sh/chalk@latest',
  'ms': 'https://esm.sh/ms@latest',
  // Icon libraries - 使用固定的旧版本避免兼容性问题
  '@heroicons/react': 'https://esm.sh/@heroicons/react@1.0.6',
  '@heroicons/react/outline': 'https://esm.sh/@heroicons/react@1.0.6/outline',
  '@heroicons/react/solid': 'https://esm.sh/@heroicons/react@1.0.6/solid',
  '@heroicons/react/24/outline': 'https://esm.sh/@heroicons/react@1.0.6/outline',
  '@heroicons/react/20/solid': 'https://esm.sh/@heroicons/react@1.0.6/solid',
  // UI libraries
  'react-toastify': 'https://esm.sh/react-toastify@latest',
  'react-bootstrap': 'https://esm.sh/react-bootstrap@latest',
  'bootstrap': 'https://esm.sh/bootstrap@latest',
  'react-datepicker': 'https://esm.sh/react-datepicker@latest',
  '@mui/material': 'https://esm.sh/@mui/material@latest',
  '@mui/icons-material': 'https://esm.sh/@mui/icons-material@latest',
  '@mui/system': 'https://esm.sh/@mui/system@latest',
  '@chakra-ui/react': 'https://esm.sh/@chakra-ui/react@latest',
  '@tremor/react': 'https://esm.sh/@tremor/react@latest',
  // QR Code & Barcode libraries
  'qrcode.react': 'https://esm.sh/qrcode.react@latest',
  'react-qr-code': 'https://esm.sh/react-qr-code@latest',
  'react-barcode': 'https://esm.sh/react-barcode@latest',
  // Text & Content libraries
  'react-markdown': 'https://esm.sh/react-markdown@latest',
  'marked': 'https://esm.sh/marked@latest',
  'react-syntax-highlighter': 'https://esm.sh/react-syntax-highlighter@latest',
  'react-image-crop': 'https://esm.sh/react-image-crop@latest',
  // Form libraries
  '@hookform/resolvers': 'https://esm.sh/@hookform/resolvers@latest',
  'react-hook-form': 'https://esm.sh/react-hook-form@latest',
  'formik': 'https://esm.sh/formik@latest',
  // Router
  'react-router-dom': 'https://esm.sh/react-router-dom@latest',
  'react-router': 'https://esm.sh/react-router@latest',
  // Charts
  'chart.js': 'https://esm.sh/chart.js@latest',
  'react-chartjs-2': 'https://esm.sh/react-chartjs-2@latest',
  'recharts': 'https://esm.sh/recharts@latest',
  'd3': 'https://esm.sh/d3@latest',
  // Ant Design mappings
  'antd': 'https://cdn.jsdelivr.net/npm/antd@5.21.4/dist/antd.min.js',
  '@ant-design/icons': 'https://cdn.jsdelivr.net/npm/@ant-design/icons@5.6.1/dist/index.umd.min.js',
  '@ant-design/colors': 'https://cdn.jsdelivr.net/npm/@ant-design/colors@7.1.0/dist/index.umd.min.js'
};

// 加载 Lucide 图标列表
let LUCIDE_ICONS_SET;
try {
  const lucideIconsPath = new URL('../data/lucide-icons.json', import.meta.url);
  const lucideIconsData = readFileSync(lucideIconsPath, 'utf-8');
  const lucideIconsArray = JSON.parse(lucideIconsData);
  LUCIDE_ICONS_SET = new Set(lucideIconsArray);
} catch (error) {
  console.warn('Failed to load lucide icons list:', error.message);
  LUCIDE_ICONS_SET = new Set(); // 空集合作为 fallback
}

// Fallback 图标名称 (PascalCase)
const FALLBACK_ICON = 'Origami';

/**
 * 解析图标导入项，支持别名（如 "Icon as MyIcon"）
 * @param {string} importItem - 单个导入项字符串（已清理注释）
 * @returns {object} { originalName, aliasName, fullImport }
 */
function parseIconImport(importItem) {
  // 去除首尾空格
  const trimmedItem = importItem.trim();
  
  // 如果为空，返回空结果
  if (!trimmedItem) {
    return {
      originalName: '',
      aliasName: '',
      fullImport: ''
    };
  }
  
  // 验证输入：只接受有效的标识符格式
  // 排除包含特殊字符、多行内容、from语句等的无效输入
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*)?$/.test(trimmedItem)) {
    console.warn(`Invalid icon import format detected: "${trimmedItem.substring(0, 50)}${trimmedItem.length > 50 ? '...' : ''}"`);
    return {
      originalName: '',
      aliasName: '',
      fullImport: ''
    };
  }
  
  // 匹配 "IconName as AliasName" 的格式，允许空格
  const aliasMatch = trimmedItem.match(/^(\w+)\s+as\s+(\w+)$/);
  
  if (aliasMatch) {
    return {
      originalName: aliasMatch[1].trim(),
      aliasName: aliasMatch[2].trim(),
      fullImport: trimmedItem
    };
  } else {
    // 没有别名，直接使用原名
    return {
      originalName: trimmedItem,
      aliasName: trimmedItem,
      fullImport: trimmedItem
    };
  }
}

/**
 * 转换 dayjs 导入
 * 将命名导入转换为默认导入，自动配置插件，并提供实例方法的包装函数
 */
function transformDayjsImports(code) {
  // 匹配 import { ... } from 'dayjs' 或 from "dayjs"
  const namedImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]dayjs['"]/g;
  
  return code.replace(namedImportRegex, (match, imports) => {
    // 解析导入的方法名称
    const methods = imports.split(',').map(item => item.trim().replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim());
    
    // 检测需要的插件
    const pluginsNeeded = new Set();
    
    // 需要插件的方法映射
    const pluginMethodMap = {
      'fromNow': 'relativeTime',
      'toNow': 'relativeTime', 
      'from': 'relativeTime',
      'to': 'relativeTime',
      'quarter': 'quarterOfYear',
      'weekOfYear': 'weekOfYear',
      'isoWeek': 'isoWeek',
      'weekday': 'weekday',
      'advancedFormat': 'advancedFormat',
      'customParseFormat': 'customParseFormat',
      'duration': 'duration',
      'isBetween': 'isBetween',
      'isSameOrAfter': 'isSameOrAfter',
      'isSameOrBefore': 'isSameOrBefore',
      'utc': 'utc',
      'timezone': 'timezone'
    };
    
    // 检查每个方法需要什么插件
    methods.forEach(method => {
      // 处理别名情况
      const cleanMethod = method.replace(/\s+as\s+\w+$/, '').trim();
      if (pluginMethodMap[cleanMethod]) {
        pluginsNeeded.add(pluginMethodMap[cleanMethod]);
      }
    });
    
    // 生成导入语句
    let importStatements = [`import dayjs from 'https://esm.sh/dayjs@latest';`];
    
    // 导入需要的插件
    const pluginImports = [];
    const pluginExtensions = [];
    
    Array.from(pluginsNeeded).forEach(plugin => {
      // 使用唯一的插件变量名以避免命名冲突
      const pluginVar = `${plugin}Plugin`;
      pluginImports.push(`import ${pluginVar} from 'https://esm.sh/dayjs@latest/plugin/${plugin}';`);
      pluginExtensions.push(`dayjs.extend(${pluginVar});`);
    });
    
    if (pluginImports.length > 0) {
      importStatements.push(...pluginImports);
      importStatements.push('');
      importStatements.push('// 扩展 dayjs 插件');
      importStatements.push(...pluginExtensions);
      importStatements.push('');
    }
    
    // dayjs 的主要方法都是实例方法，需要先创建实例
    const aliases = methods.map(method => {
      // 处理别名情况（如 format as dayjsFormat）
      const aliasMatch = method.match(/^(\w+)\s+as\s+(\w+)$/);
      if (aliasMatch) {
        const [, original, alias] = aliasMatch;
        // 创建一个接受 dayjs 实例的包装函数
        return `const ${alias} = (date, ...args) => dayjs(date).${original}(...args);`;
      } else {
        // 为常用方法创建包装函数
        return `const ${method} = (date, ...args) => dayjs(date).${method}(...args);`;
      }
    }).join('\n');
    
    const result = importStatements.join('\n') + (aliases ? '\n' + aliases : '');
    return result;
  });
}

/**
 * 转换 classnames 导入
 * classnames 有默认导出，但有时被错误地使用命名导入
 */
function transformClassnamesImports(code) {
  // 匹配 import { classnames, clsx, cn } from 'classnames'
  const namedImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]classnames['"]/g;
  
  return code.replace(namedImportRegex, (_, imports) => {
    console.warn('classnames 应该使用默认导入，自动转换命名导入');
    
    // 解析导入的名称
    const names = imports.split(',').map(item => item.trim());
    
    // 生成默认导入和别名
    const importStatement = `import classNamesDefault from 'https://esm.sh/classnames@latest';`;
    const aliases = names.map(name => {
      // 处理别名情况
      const aliasMatch = name.match(/^(\w+)\s+as\s+(\w+)$/);
      if (aliasMatch) {
        const [, , alias] = aliasMatch;
        return `const ${alias} = classNamesDefault;`;
      } else {
        return `const ${name} = classNamesDefault;`;
      }
    }).join('\n');
    
    return `${importStatement}\n${aliases}`;
  });
}

/**
 * 转换 uuid 导入
 * uuid 只有命名导出，但确保正确的 CDN 路径
 */
function transformUuidImports(code) {
  // 替换 uuid 导入的 CDN 路径，不需要特殊转换，只需要确保正确的映射
  return code.replace(/from\s+['"]uuid['"]/g, `from 'https://esm.sh/uuid@latest'`);
}

/**
 * 转换 Lucide React 图标导入
 * 检查图标是否存在，不存在的使用 fallback 图标
 */
function transformLucideImports(code) {
  // 匹配 import { ... } from 'lucide-react' 或 from "lucide-react"
  // 使用更精确的正则表达式，避免匹配跨越多个语句的内容
  const importRegex = /import\s*\{\s*([^{}]*?)\s*\}\s*from\s*['"]lucide-react['"]/g;
  
  return code.replace(importRegex, (match, imports) => {
    try {
      // 基本验证：确保导入内容不包含明显的错误标志
      if (!imports || typeof imports !== 'string') {
        console.warn('Invalid imports content detected, skipping Lucide transformation');
        return match; // 返回原始匹配，不做转换
      }
      
      // 检查是否包含明显的语法错误标志
      if (imports.includes('from ') || imports.includes('import ') || imports.includes('{') || imports.includes('}')) {
        console.warn(`Malformed Lucide import detected: "${imports.substring(0, 50)}${imports.length > 50 ? '...' : ''}", skipping transformation`);
        return match; // 返回原始匹配，不做转换
      }
      
      // 先清理整个导入字符串中的注释
      let cleanedImports = imports
        // 移除行内注释
        .replace(/\/\/.*$/gm, '')
        // 移除块注释
        .replace(/\/\*.*?\*\//g, '')
        // 清理多余的空格和换行
        .replace(/\s+/g, ' ')
        .trim();
      
      // 如果清理后为空，跳过处理
      if (!cleanedImports) {
        console.warn('Empty Lucide imports after cleaning, skipping transformation');
        return match;
      }
      
      // 解析导入的图标名称，处理别名情况
      const iconImports = cleanedImports.split(',').map(item => parseIconImport(item)).filter(icon => icon.originalName); // 过滤掉无效的导入
      const validIcons = [];
      const fallbackIcons = [];
      
      for (const iconImport of iconImports) {
        const { originalName, aliasName, fullImport } = iconImport;
        
        // 跳过空字符串（已经在parseIconImport中处理）
        if (!originalName || originalName.trim() === '') {
          continue;
        }
        
        // 检查原始图标名称是否存在
        if (LUCIDE_ICONS_SET.has(originalName)) {
          // 图标存在，保持原导入
          validIcons.push(fullImport);
        } else {
          // 图标不存在，使用 fallback 图标
          console.warn(`Lucide icon "${originalName}" not found, using fallback: ${FALLBACK_ICON}`);
          fallbackIcons.push({
            originalName,
            aliasName,
            fullImport
          });
        }
      }
      
      // 生成导入语句
      const importStatements = [];
      
      // 添加有效的图标导入
      if (validIcons.length > 0) {
        importStatements.push(`import { ${validIcons.join(', ')} } from 'https://esm.sh/lucide-react@latest';`);
      }
      
      // 为 fallback 图标创建别名导入
      if (fallbackIcons.length > 0) {
        const fallbackImports = fallbackIcons.map(icon => 
          `import { ${FALLBACK_ICON} as ${icon.aliasName} } from 'https://esm.sh/lucide-react@latest';`
        );
        importStatements.push(...fallbackImports);
      }
      
      return importStatements.join('\n');
      
    } catch (error) {
      console.warn(`Error processing Lucide imports: ${error.message}, skipping transformation`);
      return match; // 返回原始匹配，不做转换
    }
  });
}

/**
 * 转换 Heroicons 导入
 * 简化处理，直接映射到固定的旧版本CDN
 */
function transformHeroiconsImports(code) {
  // 将所有 @heroicons/react 的导入转换为对应的CDN路径（使用1.0.6版本保持兼容性）
  return code
    .replace(/from\s*['"]@heroicons\/react\/outline['"]/g, "from 'https://esm.sh/@heroicons/react@1.0.6/outline'")
    .replace(/from\s*['"]@heroicons\/react\/solid['"]/g, "from 'https://esm.sh/@heroicons/react@1.0.6/solid'")
    .replace(/from\s*['"]@heroicons\/react['"]/g, "from 'https://esm.sh/@heroicons/react@1.0.6'");
}

/**
 * 通用CSS导入处理函数
 * 处理各种库的CSS文件导入
 */
function transformCSSImports(code) {
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
    'antd/dist/antd.css': {
      cdnUrl: 'https://cdn.jsdelivr.net/npm/antd@latest/dist/antd.css',
      styleId: 'antd-styles'
    },
    'react-datepicker/dist/react-datepicker.css': {
      cdnUrl: 'https://cdn.jsdelivr.net/npm/react-datepicker@latest/dist/react-datepicker.css',
      styleId: 'react-datepicker-styles'
    }
  };

  let transformedCode = code;
  const injectedStyles = [];

  // 检查并处理各种CSS导入
  Object.entries(cssImportMappings).forEach(([cssPath, config]) => {
    const cssImportRegex = new RegExp(`import\\s+['"]${cssPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}['"];?\\s*`, 'g');
    
    if (cssImportRegex.test(transformedCode)) {
      // 移除CSS导入
      transformedCode = transformedCode.replace(cssImportRegex, '');
      
      // 添加到注入列表
      injectedStyles.push(config);
    }
  });

  // 如果有CSS需要注入，生成注入代码
  if (injectedStyles.length > 0) {
    const styleInjectionCode = injectedStyles.map(({ cdnUrl, styleId }) => `
  // ${styleId} 自动注入
  if (!document.getElementById('${styleId}')) {
    const link = document.createElement('link');
    link.id = '${styleId}';
    link.rel = 'stylesheet';
    link.href = '${cdnUrl}';
    document.head.appendChild(link);
  }`).join('');

    const fullInjectionCode = `
// CSS 样式自动注入
(() => {${styleInjectionCode}
})();
`;
    
    transformedCode = fullInjectionCode + transformedCode;
  }

  return transformedCode;
}

/**
 * 转换 react-toastify 导入
 * 移除 CSS 导入并处理组件导入，同时注入必要的样式
 */
function transformReactToastifyImports(code) {
  // 转换组件导入
  let transformedCode = code.replace(
    /from\s+['"]react-toastify['"]/g, 
    `from 'https://esm.sh/react-toastify@latest'`
  );
  
  return transformedCode;
}

/**
 * 转换 marked 导入
 * marked 使用命名导出，没有默认导出
 */
function transformMarkedImports(code) {
  // 匹配 marked 的各种导入形式
  const importRegex = /import\s*(?:(?:\{\s*([^}]+)\s*\})|([\w$]+))\s*from\s*['"]marked['"]/g;
  
  return code.replace(importRegex, (match, namedImports, defaultImport) => {
    if (defaultImport) {
      // 如果是默认导入，转换为命名导入
      console.warn('marked 应该使用命名导入，自动转换默认导入');
      // 将默认导入转换为命名导入
      return `import { marked as ${defaultImport} } from 'https://esm.sh/marked@latest';`;
    } else if (namedImports) {
      // 保持命名导入不变
      return `import { ${namedImports} } from 'https://esm.sh/marked@latest';`;
    }
    return match;
  });
}

/**
 * 转换 react-markdown 导入
 * react-markdown 使用默认导出，并且有特殊的依赖结构
 */
function transformReactMarkdownImports(code) {
  // 匹配 react-markdown 的各种导入形式
  const importRegex = /import\s*(?:(?:\{\s*([^}]+)\s*\})|([\w$]+))\s*from\s*['"]react-markdown['"]/g;
  
  return code.replace(importRegex, (match, namedImports, defaultImport) => {
    if (namedImports) {
      // 如果是命名导入，转换为默认导入
      console.warn('react-markdown 应该使用默认导入，自动转换命名导入');
      // 为每个命名导入创建别名
      const names = namedImports.split(',').map(item => item.trim());
      const importStatement = `import ReactMarkdown from 'https://esm.sh/react-markdown@latest';`;
      const aliases = names.map(name => {
        const aliasMatch = name.match(/^(\w+)\s+as\s+(\w+)$/);
        if (aliasMatch) {
          const [, , alias] = aliasMatch;
          return `const ${alias} = ReactMarkdown;`;
        } else {
          return `const ${name} = ReactMarkdown;`;
        }
      }).join('\n');
      return `${importStatement}\n${aliases}`;
    } else if (defaultImport) {
      // 保持默认导入不变
      return `import ${defaultImport} from 'https://esm.sh/react-markdown@latest';`;
    }
    return match;
  });
}

/**
 * 转换 @hookform/resolvers 导入
 * 处理子路径导入如 @hookform/resolvers/yup, @hookform/resolvers/zod 等
 */
function transformHookformResolversImports(code) {
  // 匹配 @hookform/resolvers 的各种导入
  const importRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]@hookform\/resolvers(?:\/([^'"]+))?['"]/g;
  
  return code.replace(importRegex, (match, imports, subpath) => {
    // 如果有子路径，保持原样
    if (subpath) {
      return `import { ${imports} } from 'https://esm.sh/@hookform/resolvers@latest/${subpath}';`;
    } else {
      // 如果没有子路径，使用主包
      return `import { ${imports} } from 'https://esm.sh/@hookform/resolvers@latest';`;
    }
  });
}

/**
 * 智能导入修复器
 * 检测并自动修复常见的导入问题，提供清晰的警告信息
 */
function transformSmartImportFixer(code) {
  const warnings = [];
  let transformedCode = code;
  
  // 已知的导入问题映射
  const importFixes = {
    'hex-rgb': {
      type: 'default-only',
      defaultName: 'hexRgb',
      autoFix: true,
      description: 'hex-rgb只有默认导出，已自动转换为默认导入'
    },
    'chalk': {
      type: 'default-only',
      defaultName: 'chalk', 
      autoFix: true,
      description: 'chalk只有默认导出，已自动转换为默认导入'
    },
    'ms': {
      type: 'default-only',
      defaultName: 'ms',
      autoFix: true,
      description: 'ms只有默认导出，已自动转换为默认导入'
    },
  };
  
  // 检测并修复错误的命名导入
  Object.entries(importFixes).forEach(([packageName, config]) => {
    if (config.autoFix && config.type === 'default-only') {
      const namedImportRegex = new RegExp(
        `import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*['"]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
        'g'
      );
      
      transformedCode = transformedCode.replace(namedImportRegex, (match, imports) => {
        // 解析导入的名称
        const names = imports.split(',').map(item => item.trim());
        
        // 生成默认导入
        const cdnUrl = getPackageCDNUrl(packageName);
        const importStatement = `import ${config.defaultName} from '${cdnUrl}';`;
        
        // 为每个命名导入创建别名
        const aliases = names.map(name => {
          const aliasMatch = name.match(/^(\w+)\s+as\s+(\w+)$/);
          if (aliasMatch) {
            const [, , alias] = aliasMatch;
            return `const ${alias} = ${config.defaultName};`;
          } else {
            return `const ${name} = ${config.defaultName};`;
          }
        }).join('\n');
        
        // 记录警告信息
        warnings.push({
          type: 'import-fix',
          packageName,
          originalImport: match,
          description: config.description,
          suggestion: `使用 "import ${config.defaultName} from '${packageName}'" 代替`
        });
        
        console.warn(`🔧 ${config.description}: ${packageName}`);
        
        return `${importStatement}\n${aliases}`;
      });
    }
  });
  
  // 将警告信息附加到代码中（作为注释，方便调试）
  if (warnings.length > 0) {
    const warningComments = warnings.map(w => 
      `// 自动修复: ${w.description}`
    ).join('\n');
    transformedCode = `${warningComments}\n${transformedCode}`;
  }
  
  return transformedCode;
}

/**
 * 转换 @tremor/react 导入
 * 提供组件名称修正建议
 */
function transformTremorImports(code) {
  // @tremor/react 组件名称映射
  const componentMappings = {
    'PieChart': 'DonutChart', // PieChart 不存在，应该使用 DonutChart
    'LineChart': 'LineChart', // 确认存在
    'BarChart': 'BarChart',   // 确认存在
    'AreaChart': 'AreaChart'  // 确认存在
  };
  
  // 检测并修正组件名称
  Object.entries(componentMappings).forEach(([incorrectName, correctName]) => {
    if (incorrectName !== correctName) {
      // 匹配错误的组件导入
      const incorrectImportRegex = new RegExp(
        `import\\s*\\{\\s*([^}]*\\b${incorrectName}\\b[^}]*)\\s*\\}\\s*from\\s*['"]@tremor/react['"]`,
        'g'
      );
      
      code = code.replace(incorrectImportRegex, (match, imports) => {
        console.warn(`🔧 @tremor/react: ${incorrectName} 不存在，已自动替换为 ${correctName}`);
        
        // 替换组件名称
        const correctedImports = imports.replace(
          new RegExp(`\\b${incorrectName}\\b`, 'g'), 
          `${correctName} as ${incorrectName}`
        );
        
        return `import { ${correctedImports} } from '@tremor/react'`;
      });
    }
  });
  
  return code;
}

/**
 * 转换有默认导入问题的React库
 * 一些库在ESM环境下只有命名导出，需要特殊处理
 */
function transformReactLibrariesImports(code) {
  // 需要特殊处理的库映射：默认导入 -> 命名导入
  const defaultToNamedImportMappings = {
    'qrcode.react': 'QRCodeSVG',        // import QR from 'qrcode.react' -> import { QRCodeSVG as QR } from 'qrcode.react'
    'react-qr-code': 'QRCode',          // import QR from 'react-qr-code' -> import { QRCode as QR } from 'react-qr-code'
    'react-barcode': 'Barcode',         // import Barcode from 'react-barcode' -> import { Barcode } from 'react-barcode'
    // react-markdown 使用默认导出，不需要特殊处理
    // 'react-markdown': 'ReactMarkdown',  // 已移除，使用专门的转换函数
    'react-syntax-highlighter': 'Prism', // import SyntaxHighlighter from 'react-syntax-highlighter' -> import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
    'react-image-crop': 'ReactCrop',    // import ReactCrop from 'react-image-crop' -> import { ReactCrop } from 'react-image-crop'
    // Heroicons只有命名导出，禁止默认导入
    '@heroicons/react': null,           // 禁止默认导入
    '@heroicons/react/outline': null,   // 禁止默认导入
    '@heroicons/react/solid': null      // 禁止默认导入
  };
  
  let transformedCode = code;
  
  Object.entries(defaultToNamedImportMappings).forEach(([packageName, namedExport]) => {
    if (namedExport === null) {
      // 对于Heroicons，移除任何默认导入（因为它们只有命名导出）
      const defaultImportRegex = new RegExp(
        `import\\s+([\\w$]+)\\s+from\\s+['"]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
        'g'
      );
      
      transformedCode = transformedCode.replace(defaultImportRegex, () => {
        console.warn(`Removed invalid default import from ${packageName} - only named imports are supported`);
        return ''; // 移除默认导入
      });
    } else {
      // 匹配默认导入: import Something from 'package'
      const defaultImportRegex = new RegExp(
        `import\\s+([\\w$]+)\\s+from\\s+['"]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
        'g'
      );
      
      transformedCode = transformedCode.replace(defaultImportRegex, (match, importName) => {
        // 转换为命名导入
        return `import { ${namedExport} as ${importName} } from '${packageName}'`;
      });
    }
  });
  
  return transformedCode;
}

/**
 * 将包名转换为 CDN URL
 * 支持任意 npm 包的自动转换
 */
function getPackageCDNUrl(packageName) {
  // 检查是否有特殊映射
  if (SPECIAL_CDN_MAPPINGS[packageName]) {
    return SPECIAL_CDN_MAPPINGS[packageName];
  }
  
  // 处理带有子路径的包导入（如 three/examples/jsm/controls/OrbitControls.js）
  const parts = packageName.split('/');
  if (parts.length > 1) {
    // 检查是否是 scoped package（以 @ 开头）
    if (parts[0].startsWith('@')) {
      // scoped package: @scope/package/subpath -> https://esm.sh/@scope/package@latest/subpath
      const scope = parts[0];
      const pkg = parts[1];
      const subpath = parts.slice(2).join('/');
      return subpath ? `https://esm.sh/${scope}/${pkg}@latest/${subpath}` : `https://esm.sh/${scope}/${pkg}@latest`;
    } else {
      // 普通包: package/subpath -> https://esm.sh/package@latest/subpath
      const pkg = parts[0];
      const subpath = parts.slice(1).join('/');
      return `https://esm.sh/${pkg}@latest/${subpath}`;
    }
  }
  
  // 对于所有其他包，使用 esm.sh 的通用格式
  return `https://esm.sh/${packageName}@latest`;
}

/**
 * 创建编译插件组合
 * 结合虚拟文件系统、动态导入和库解析插件
 */
function createCompilePlugins(code, options = {}) {
  const {
    enableAdvancedResolve = true,
    debugMode = false,
    customLibraryMappings = {},
    enableCaching = true,
    isAutoFixed = false  // 新增：标识代码是否已经过自动修复
  } = options;

  // 创建代码转换函数，组合多个转换器
  const transformCode = (code) => {
    // 首先处理CSS导入（必须在其他转换之前）
    let transformedCode = transformCSSImports(code);
    
    // 应用所有导入转换
    transformedCode = transformDayjsImports(transformedCode);
    transformedCode = transformClassnamesImports(transformedCode);
    transformedCode = transformUuidImports(transformedCode);
    transformedCode = transformLucideImports(transformedCode);
    transformedCode = transformHeroiconsImports(transformedCode);
    transformedCode = transformReactToastifyImports(transformedCode);
    transformedCode = transformMarkedImports(transformedCode);
    transformedCode = transformReactMarkdownImports(transformedCode);
    transformedCode = transformHookformResolversImports(transformedCode);
    transformedCode = transformTremorImports(transformedCode);
    transformedCode = transformReactLibrariesImports(transformedCode);
    // 智能导入修复 - 处理常见的导入错误
    transformedCode = transformSmartImportFixer(transformedCode);
    return transformedCode;
  };

  // 创建虚拟文件系统插件
  const virtualFsPlugin = createVirtualFileSystemPlugin(code, {
    transformCode,
    autoImportReact: !isAutoFixed, // 如果已经自动修复过，禁用React自动导入
    namespace: 'virtual-entry',
    entryPath: 'virtual:entry'
  });

  const plugins = [virtualFsPlugin];

  // 如果启用高级解析，使用库解析插件
  if (enableAdvancedResolve) {
    const libraryResolvePlugin = createLibraryResolvePlugin({
      enableCaching,
      enableFallback: true,
      preferredCDN: 'ESM_SH',
      fallbackCDNs: ['UNPKG', 'SKYPACK'],
      versionStrategy: 'latest',
      customMappings: {
        ...SPECIAL_CDN_MAPPINGS,
        ...customLibraryMappings
      },
      resolveSubpath: true,
      enableDependencyAnalysis: false,
      debugMode
    });
    
    plugins.push(libraryResolvePlugin);
  } else {
    // 使用简单的动态导入插件
    const dynamicImportPlugin = createDynamicImportPlugin({
      getCDNUrl: getPackageCDNUrl,
      aliasMap: {
        '@/': '/',
        '~/': '~/',
        '#/': '#/'
      },
      nodeBuiltins: [
        'fs', 'path', 'http', 'https', 'url', 'crypto', 'os', 'util', 
        'events', 'stream', 'buffer', 'querystring', 'zlib', 'net', 
        'tls', 'child_process', 'cluster', 'dns', 'readline', 'repl'
      ],
      enableDynamicImport: true,
      virtualEntryPath: 'virtual:entry'
    });
    
    plugins.push(dynamicImportPlugin);
  }

  return plugins;
}

/**
 * 执行编译
 */
async function compile(inputData) {
  try {
    const { code, libraries = [], options = {} } = inputData;
    
    // 验证输入
    if (!code || typeof code !== 'string') {
      throw new Error('代码内容不能为空');
    }

    // 合并编译选项
    const compileOptions = { ...DEFAULT_OPTIONS, ...options };
    
    // 预处理代码：应用自动修复
    let processedCode = code;
    const autoFixResults = {
      applied: false,
      fixes: [],
      warnings: [],
      stages: [] // 记录修复阶段信息
    };

    if (compileOptions.enableAutoFix || compileOptions.enableImportFix) {
      console.error('🔧 开始预编译修复阶段...');
      
      try {
        // 阶段1：应用AST自动修复（优先处理语法和导入问题）
        if (compileOptions.enableAutoFix) {
          console.error('📝 阶段1: 应用AST自动修复...');
          const autoFixer = new ASTAutoFixer({
            enableReactFixes: true,
            enableImportFixes: true,
            enableStyleFixes: true,
            maxFixAttempts: compileOptions.autoFixAttempts
          });
          
          const autoFixResult = await autoFixer.autoFix(processedCode, 'compile-input.tsx');
          
          if (autoFixResult.success) {
            if (autoFixResult.fixes.length > 0) {
              // 验证修复后的代码语法
              const validationResult = await validateFixedCode(autoFixResult.fixedCode, 'AST修复');
              
              if (validationResult.isValid) {
                processedCode = autoFixResult.fixedCode;
                autoFixResults.fixes.push(...autoFixResult.fixes);
                autoFixResults.applied = true;
                autoFixResults.stages.push({
                  stage: 'ast_fix',
                  success: true,
                  fixesApplied: autoFixResult.fixes.length,
                  message: `AST修复成功: ${autoFixResult.fixes.length}个修复`
                });
                console.error(`✅ AST修复成功: ${autoFixResult.fixes.length}个修复`);
              } else {
                // 修复导致语法错误，回滚
                autoFixResults.warnings.push({
                  type: 'fix_validation_failed',
                  message: `AST修复导致语法错误，已回滚: ${validationResult.error}`
                });
                autoFixResults.stages.push({
                  stage: 'ast_fix',
                  success: false,
                  message: `AST修复失败并回滚: ${validationResult.error}`
                });
                console.error(`❌ AST修复导致语法错误，已回滚: ${validationResult.error}`);
              }
            } else {
              autoFixResults.stages.push({
                stage: 'ast_fix',
                success: true,
                fixesApplied: 0,
                message: 'AST修复: 未发现需要修复的问题'
              });
              console.error('ℹ️  AST修复: 未发现需要修复的问题');
            }
          } else {
            // 安全处理AST错误信息
            const astErrorMessages = autoFixResult.errors?.map(error => 
              typeof error === 'string' ? error : 
              error?.message || 
              JSON.stringify(error)
            ).join(', ') || 'unknown error';
            
            autoFixResults.warnings.push({
              type: 'ast_fix_failed',
              message: `AST修复失败: ${astErrorMessages}`
            });
            autoFixResults.stages.push({
              stage: 'ast_fix',
              success: false,
              message: `AST修复失败: ${astErrorMessages}`
            });
            console.error(`❌ AST修复失败: ${astErrorMessages}`);
          }
        }

        // 阶段2：应用导入修复（优化和整理导入）
        if (compileOptions.enableImportFix) {
          console.error('📦 阶段2: 应用导入修复...');
          const importFixer = new ImportFixer({
            enableAutoImport: true,
            removeUnusedImports: true,
            sortImports: true
          });
          
          const importFixResult = await importFixer.fixImports(processedCode, 'compile-input.tsx');
          
          if (importFixResult.success) {
            if (importFixResult.fixes.length > 0) {
              // 验证修复后的代码语法
              const validationResult = await validateFixedCode(importFixResult.fixedCode, '导入修复');
              
              if (validationResult.isValid) {
                processedCode = importFixResult.fixedCode;
                autoFixResults.fixes.push(...importFixResult.fixes);
                autoFixResults.applied = true;
                autoFixResults.stages.push({
                  stage: 'import_fix',
                  success: true,
                  fixesApplied: importFixResult.fixes.length,
                  message: `导入修复成功: ${importFixResult.fixes.length}个修复`
                });
                console.error(`✅ 导入修复成功: ${importFixResult.fixes.length}个修复`);
              } else {
                // 修复导致语法错误，回滚
                autoFixResults.warnings.push({
                  type: 'import_fix_validation_failed',
                  message: `导入修复导致语法错误，已回滚: ${validationResult.error}`
                });
                autoFixResults.stages.push({
                  stage: 'import_fix',
                  success: false,
                  message: `导入修复失败并回滚: ${validationResult.error}`
                });
                console.error(`❌ 导入修复导致语法错误，已回滚: ${validationResult.error}`);
              }
            } else {
              autoFixResults.stages.push({
                stage: 'import_fix',
                success: true,
                fixesApplied: 0,
                message: '导入修复: 未发现需要修复的问题'
              });
              console.error('ℹ️  导入修复: 未发现需要修复的问题');
            }
          } else {
            // 安全处理错误信息
            const errorMessages = importFixResult.errors?.map(error => 
              typeof error === 'string' ? error : 
              error?.message || 
              JSON.stringify(error)
            ).join(', ') || 'unknown error';
            
            autoFixResults.warnings.push({
              type: 'import_fix_failed',
              message: `导入修复失败: ${errorMessages}`
            });
            autoFixResults.stages.push({
              stage: 'import_fix',
              success: false,
              message: `导入修复失败: ${errorMessages}`
            });
            console.error(`❌ 导入修复失败: ${errorMessages}`);
          }
        }
        
        // 阶段3：最终验证修复后的代码
        if (autoFixResults.applied) {
          console.error('🔍 阶段3: 最终验证修复后的代码...');
          const finalValidation = await validateFixedCode(processedCode, '最终验证');
          
          if (finalValidation.isValid) {
            console.error('✅ 修复后的代码通过最终验证');
            autoFixResults.stages.push({
              stage: 'final_validation',
              success: true,
              message: '修复后的代码通过最终验证'
            });
          } else {
            console.error(`❌ 修复后的代码未通过最终验证: ${finalValidation.error}`);
            autoFixResults.warnings.push({
              type: 'final_validation_failed',
              message: `修复后的代码未通过最终验证: ${finalValidation.error}`
            });
            autoFixResults.stages.push({
              stage: 'final_validation',
              success: false,
              message: `修复后的代码未通过最终验证: ${finalValidation.error}`
            });
            
            // 考虑是否要回滚到原始代码
            const shouldRollback = shouldRollbackToOriginal(autoFixResults.stages);
            if (shouldRollback) {
              console.error('⏪ 回滚到原始代码');
              processedCode = code;
              autoFixResults.applied = false;
              autoFixResults.warnings.push({
                type: 'rollback_to_original',
                message: '由于修复后代码验证失败，已回滚到原始代码'
              });
            }
          }
        }
        
        
      } catch (fixError) {
        // 自动修复失败，记录警告但继续编译原代码
        console.error(`❌ 修复阶段异常: ${fixError.message}`);
        autoFixResults.warnings.push({
          type: 'autofix_error',
          message: `自动修复失败: ${fixError.message}`
        });
        autoFixResults.stages.push({
          stage: 'error',
          success: false,
          message: `修复异常: ${fixError.message}`
        });
      }
    }
    
    // 准备 esbuild 配置
    const buildOptions = {
      entryPoints: ['virtual:entry'],
      bundle: true,
      write: false,
      target: compileOptions.target,
      format: compileOptions.format,
      minify: compileOptions.minify,
      sourcemap: compileOptions.sourceMap,
      jsx: compileOptions.jsx,
      platform: 'browser',
      // 保持代码可读性的配置
      keepNames: compileOptions.keepNames !== false, // 保持函数和类名
      legalComments: compileOptions.preserveComments ? 'inline' : 'none', // 保留法律注释
      charset: 'utf8', // 使用UTF-8编码，保持中文字符
      treeShaking: !compileOptions.humanReadable, // 人类可读模式下关闭tree shaking
      define: {
        'process.env.NODE_ENV': '"development"'
      },
      plugins: createCompilePlugins(processedCode, { 
        isAutoFixed: autoFixResults.applied 
      }),
      loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
        '.jsx': 'jsx',
        '.js': 'js'
      }
    };

    // 执行编译
    const result = await build(buildOptions);
    
    // 检查编译结果
    if (!result.outputFiles || result.outputFiles.length === 0) {
      throw new Error('编译未产生输出文件');
    }

    const outputFile = result.outputFiles[0];
    let compiledCode = new TextDecoder().decode(outputFile.contents);
    
    // 格式化编译后的代码以保持可读性
    // 根据用户配置决定是否格式化
    if (compileOptions.formatCode && !compileOptions.minify && compileOptions.humanReadable) {
      try {
        const formatOptions = {
          parser: 'babel',
          // 保持中文字符和可读性
          printWidth: compileOptions.preserveWhitespace ? 120 : 80,
          tabWidth: 2,
          useTabs: false,
          semi: true,
          singleQuote: false,
          trailingComma: 'es5',
          bracketSpacing: true,
          bracketSameLine: false,
          arrowParens: 'avoid',
          // 保持空白和注释
          htmlWhitespaceSensitivity: compileOptions.preserveWhitespace ? 'strict' : 'ignore'
        };
        
        compiledCode = await formatCode(compiledCode, formatOptions);
      } catch (formatError) {
        console.warn('代码格式化失败，使用原始输出:', formatError.message);
      }
    }
    
    // 查找 source map
    let sourceMap = null;
    if (compileOptions.sourceMap && result.outputFiles.length > 1) {
      const sourceMapFile = result.outputFiles.find(file => 
        file.path.endsWith('.map'));
      if (sourceMapFile) {
        sourceMap = new TextDecoder().decode(sourceMapFile.contents);
      }
    }

    // 提取依赖列表
    const dependencies = libraries.filter(lib => 
      code.includes(lib) || code.includes(`from "${lib}"`) || code.includes(`from '${lib}'`)
    );

    // 合并警告信息
    const allWarnings = [
      ...(result.warnings?.map(w => w.text) || []),
      ...autoFixResults.warnings.map(w => w.message)
    ];

    // 返回成功结果
    return {
      success: true,
      compiledCode,
      sourceMap,
      dependencies,
      assets: [],
      error: null,
      warnings: allWarnings,
      fixedCode: autoFixResults.applied ? processedCode : null, // 添加修复后的代码
      autoFix: autoFixResults.applied ? {
        applied: true,
        fixesCount: autoFixResults.fixes.length,
        fixes: autoFixResults.fixes,
        stages: autoFixResults.stages,
        warnings: autoFixResults.warnings
      } : { 
        applied: false,
        stages: autoFixResults.stages,
        warnings: autoFixResults.warnings
      }
    };

  } catch (error) {
    // 返回错误结果
    return {
      success: false,
      compiledCode: null,
      sourceMap: null,
      dependencies: [],
      assets: [],
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * 主函数 - 处理输入输出
 */
async function main() {
  try {
    let inputData = '';
    
    // 读取 stdin 输入
    if (process.stdin.isTTY) {
      // 如果是 TTY，可能是测试模式
      inputData = process.argv[2] || '{}';
    } else {
      // 从 stdin 读取
      for await (const chunk of process.stdin) {
        inputData += chunk;
      }
    }

    // 解析输入 JSON
    let parsedInput;
    try {
      parsedInput = JSON.parse(inputData);
    } catch (parseError) {
      throw new Error(`输入JSON解析失败: ${parseError.message}`);
    }

    // 执行编译
    const result = await compile(parsedInput);
    
    // 输出结果 - 使用 stringify 函数确保安全编码
    console.log(JSON.stringify(result, (_, value) => {
      if (typeof value === 'string') {
        // 确保字符串中的特殊字符被正确转义
        return value;
      }
      return value;
    }, 0));
    
    // 设置退出码
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    // 输出错误结果
    const errorResult = {
      success: false,
      compiledCode: null,
      sourceMap: null,
      dependencies: [],
      assets: [],
      error: error.message,
      stack: error.stack
    };
    
    console.log(JSON.stringify(errorResult, null, 0));
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { compile, createCompilePlugins, getPackageCDNUrl, SPECIAL_CDN_MAPPINGS };