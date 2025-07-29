/**
 * 虚拟文件系统插件
 * 
 * 提供虚拟文件系统功能，支持：
 * - 虚拟入口文件处理
 * - 内存中的代码处理
 * - 自动React导入
 * - 代码预处理
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { addOptimalReactImport } from '../utils/react-import-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 创建虚拟文件系统插件
 * 
 * @param {string} code - 用户代码
 * @param {object} options - 插件选项
 * @param {function} options.transformCode - 代码转换函数
 * @param {boolean} options.autoImportReact - 是否自动导入React
 * @returns {object} esbuild插件对象
 */
export function createVirtualFileSystemPlugin(code, options = {}) {
  const {
    transformCode = null,
    autoImportReact = true,
    namespace = 'virtual-entry',
    entryPath = 'virtual:entry'
  } = options;

  return {
    name: 'virtual-file-system',
    setup(build) {
      // 处理虚拟入口文件解析
      build.onResolve({ filter: new RegExp(`^${entryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, (args) => {
        return {
          path: args.path,
          namespace: namespace
        };
      });

      // 提供虚拟入口文件内容
      build.onLoad({ filter: /.*/, namespace: namespace }, () => {
        let processedCode = code;

        // 自动添加 React 导入（如果启用且代码中使用了 JSX）
        if (autoImportReact) {
          processedCode = addOptimalReactImport(processedCode);
        }

        // 应用自定义代码转换
        if (transformCode && typeof transformCode === 'function') {
          processedCode = transformCode(processedCode);
        }

        return {
          contents: processedCode,
          loader: 'tsx',
          resolveDir: __dirname
        };
      });

      // 处理虚拟模块的内部导入
      build.onResolve({ filter: /^virtual:/ }, (args) => {
        // 如果是主入口文件，不做处理
        if (args.path === entryPath) {
          return null;
        }

        // 处理其他虚拟模块
        return {
          path: args.path,
          namespace: 'virtual-module'
        };
      });

      // 处理虚拟模块加载
      build.onLoad({ filter: /.*/, namespace: 'virtual-module' }, (args) => {
        // 这里可以扩展支持多个虚拟模块
        // 目前返回空模块
        return {
          contents: '// Virtual module placeholder',
          loader: 'js'
        };
      });
    }
  };
}


/**
 * 创建多文件虚拟文件系统插件
 * 
 * @param {object} files - 文件映射对象 {路径: 内容}
 * @param {object} options - 插件选项
 * @returns {object} esbuild插件对象
 */
export function createMultiFileVirtualPlugin(files, options = {}) {
  const {
    namespace = 'virtual-multi',
    transformCode = null,
    autoImportReact = true
  } = options;

  return {
    name: 'multi-file-virtual-fs',
    setup(build) {
      // 处理虚拟文件解析
      build.onResolve({ filter: /^virtual:/ }, (args) => {
        const virtualPath = args.path.replace(/^virtual:/, '');
        
        if (files[virtualPath] || files[args.path]) {
          return {
            path: args.path,
            namespace: namespace
          };
        }

        return null;
      });

      // 提供虚拟文件内容
      build.onLoad({ filter: /.*/, namespace: namespace }, (args) => {
        const virtualPath = args.path.replace(/^virtual:/, '');
        let content = files[virtualPath] || files[args.path];

        if (!content) {
          return {
            errors: [{
              text: `Virtual file not found: ${args.path}`,
              location: null
            }]
          };
        }

        // 自动添加 React 导入
        if (autoImportReact) {
          content = addOptimalReactImport(content);
        }

        // 应用自定义代码转换
        if (transformCode && typeof transformCode === 'function') {
          content = transformCode(content, virtualPath);
        }

        // 根据文件扩展名确定加载器
        const loader = getLoaderFromPath(virtualPath);

        return {
          contents: content,
          loader: loader,
          resolveDir: __dirname
        };
      });
    }
  };
}

/**
 * 根据文件路径确定esbuild加载器
 * 
 * @param {string} path - 文件路径
 * @returns {string} 加载器类型
 */
function getLoaderFromPath(path) {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.txt')) return 'text';
  
  // 默认为tsx以支持JSX
  return 'tsx';
}

/**
 * 创建代码片段虚拟文件系统插件
 * 用于处理代码片段的编译
 * 
 * @param {string} code - 代码片段
 * @param {object} options - 选项
 * @returns {object} esbuild插件对象
 */
export function createCodeSnippetPlugin(code, options = {}) {
  const {
    wrapInComponent = false,
    componentName = 'CodeSnippet',
    addExports = true
  } = options;

  let processedCode = code;

  // 如果需要包装成组件
  if (wrapInComponent) {
    processedCode = wrapCodeInComponent(processedCode, componentName);
  }

  // 如果需要添加导出
  if (addExports) {
    processedCode = addExportsIfNeeded(processedCode, componentName);
  }

  return createVirtualFileSystemPlugin(processedCode, {
    ...options,
    transformCode: null // 已经在这里处理了
  });
}

/**
 * 将代码包装成React组件
 * 
 * @param {string} code - 原始代码
 * @param {string} componentName - 组件名称
 * @returns {string} 包装后的代码
 */
function wrapCodeInComponent(code, componentName) {
  // 如果代码已经是完整的组件，不需要包装
  if (code.includes('function ') || code.includes('const ') || code.includes('export ')) {
    return code;
  }

  // 如果代码是JSX表达式，包装成组件
  if (code.trim().startsWith('<') && code.trim().endsWith('>')) {
    return `
export default function ${componentName}() {
  return (
    ${code}
  );
}
    `.trim();
  }

  return code;
}

/**
 * 如果需要，添加默认导出
 * 
 * @param {string} code - 代码
 * @param {string} componentName - 组件名称
 * @returns {string} 处理后的代码
 */
function addExportsIfNeeded(code, componentName) {
  // 检查是否已经有导出
  if (code.includes('export ')) {
    return code;
  }

  // 检查是否有函数或组件定义
  const functionMatch = code.match(/function\s+(\w+)/);
  const constMatch = code.match(/const\s+(\w+)\s*=/);

  if (functionMatch) {
    return `${code}\nexport default ${functionMatch[1]};`;
  }

  if (constMatch) {
    return `${code}\nexport default ${constMatch[1]};`;
  }

  return code;
}

export default createVirtualFileSystemPlugin;