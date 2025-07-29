/**
 * 动态导入插件
 * 
 * 提供动态导入功能，支持：
 * - 模块路径解析
 * - 别名路径处理
 * - CDN URL转换
 * - Node.js内置模块处理
 * - 动态导入语句处理
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 创建动态导入插件
 * 
 * @param {object} options - 插件选项
 * @param {function} options.getCDNUrl - 获取CDN URL的函数
 * @param {object} options.aliasMap - 别名映射
 * @param {string[]} options.nodeBuiltins - Node.js内置模块列表
 * @param {boolean} options.enableDynamicImport - 是否启用动态导入处理
 * @returns {object} esbuild插件对象
 */
export function createDynamicImportPlugin(options = {}) {
  const {
    getCDNUrl = null,
    aliasMap = {},
    nodeBuiltins = [
      'fs', 'path', 'http', 'https', 'url', 'crypto', 'os', 'util', 
      'events', 'stream', 'buffer', 'querystring', 'zlib', 'net', 
      'tls', 'child_process', 'cluster', 'dns', 'readline', 'repl'
    ],
    enableDynamicImport = true,
    virtualEntryPath = 'virtual:entry'
  } = options;

  return {
    name: 'dynamic-import',
    setup(build) {
      // 处理所有模块解析
      build.onResolve({ filter: /.*/ }, (args) => {
        // 跳过虚拟入口文件
        if (args.path === virtualEntryPath) {
          return null;
        }

        // 跳过相对路径和绝对路径（本地文件）
        if (isLocalPath(args.path)) {
          return null; // 让 esbuild 使用默认解析
        }

        // 跳过已经是完整URL的导入
        if (isFullUrl(args.path)) {
          return null; // 让 esbuild 使用默认解析
        }

        // 处理别名路径
        const aliasResult = resolveAlias(args.path, aliasMap);
        if (aliasResult) {
          return aliasResult;
        }

        // 处理Node.js内置模块
        if (nodeBuiltins.includes(args.path)) {
          return {
            path: args.path,
            external: true
          };
        }

        // 处理npm包，转换为CDN URL
        if (getCDNUrl && typeof getCDNUrl === 'function') {
          const cdnUrl = getCDNUrl(args.path);
          return {
            path: cdnUrl,
            external: true
          };
        }

        // 默认处理：标记为外部依赖
        return {
          path: args.path,
          external: true
        };
      });

      // 处理动态导入语句
      if (enableDynamicImport) {
        build.onLoad({ filter: /\.(js|jsx|ts|tsx)$/ }, async (args) => {
          // 这里可以处理动态导入语句的转换
          // 目前返回null让esbuild使用默认处理
          return null;
        });
      }
    }
  };
}

/**
 * 检查路径是否为本地路径
 * 
 * @param {string} path - 路径
 * @returns {boolean} 是否为本地路径
 */
function isLocalPath(path) {
  return path.startsWith('./') || 
         path.startsWith('../') || 
         path.startsWith('/') ||
         path.startsWith('file://');
}

/**
 * 检查路径是否为完整URL
 * 
 * @param {string} path - 路径
 * @returns {boolean} 是否为完整URL
 */
function isFullUrl(path) {
  return path.startsWith('https://') || 
         path.startsWith('http://') ||
         path.startsWith('data:') ||
         path.startsWith('blob:');
}

/**
 * 解析别名路径
 * 
 * @param {string} path - 原始路径
 * @param {object} aliasMap - 别名映射
 * @returns {object|null} 解析结果
 */
function resolveAlias(path, aliasMap) {
  // 处理 @/ 别名（通常指向项目根目录）
  if (path.startsWith('@/')) {
    const serverPath = path.replace('@/', '/');
    return {
      path: serverPath,
      external: true
    };
  }

  // 处理 ~/ 别名（通常指向用户目录或项目目录）
  if (path.startsWith('~/')) {
    return {
      path: path,
      external: true
    };
  }

  // 处理 #/ 别名（通常用于内部模块）
  if (path.startsWith('#/')) {
    return {
      path: path,
      external: true
    };
  }

  // 处理自定义别名
  for (const [alias, target] of Object.entries(aliasMap)) {
    if (path.startsWith(alias)) {
      const resolvedPath = path.replace(alias, target);
      return {
        path: resolvedPath,
        external: true
      };
    }
  }

  return null;
}

/**
 * 创建高级动态导入插件
 * 支持更复杂的导入处理逻辑
 * 
 * @param {object} options - 插件选项
 * @returns {object} esbuild插件对象
 */
export function createAdvancedDynamicImportPlugin(options = {}) {
  const {
    getCDNUrl = null,
    aliasMap = {},
    importMap = {},
    transformImport = null,
    enablePolyfill = false,
    polyfillMap = {},
    debugMode = false
  } = options;

  return {
    name: 'advanced-dynamic-import',
    setup(build) {
      // 处理导入映射
      build.onResolve({ filter: /.*/ }, (args) => {
        if (debugMode) {
          console.error(`[AdvancedDynamicImport] Resolving: ${args.path}`);
        }

        // 跳过虚拟文件
        if (args.path.startsWith('virtual:')) {
          return null;
        }

        // 检查导入映射
        if (importMap[args.path]) {
          const mappedPath = importMap[args.path];
          if (debugMode) {
            console.error(`[AdvancedDynamicImport] Mapped ${args.path} -> ${mappedPath}`);
          }
          return {
            path: mappedPath,
            external: true
          };
        }

        // 应用自定义导入转换
        if (transformImport && typeof transformImport === 'function') {
          const transformed = transformImport(args.path, args);
          if (transformed) {
            if (debugMode) {
              console.error(`[AdvancedDynamicImport] Transformed ${args.path} -> ${transformed.path}`);
            }
            return transformed;
          }
        }

        // 处理Polyfill
        if (enablePolyfill && polyfillMap[args.path]) {
          const polyfillPath = polyfillMap[args.path];
          if (debugMode) {
            console.error(`[AdvancedDynamicImport] Polyfill ${args.path} -> ${polyfillPath}`);
          }
          return {
            path: polyfillPath,
            external: true
          };
        }

        // 使用基础插件的逻辑
        return null;
      });
    }
  };
}

/**
 * 创建条件导入插件
 * 根据条件选择不同的导入路径
 * 
 * @param {object} options - 插件选项
 * @returns {object} esbuild插件对象
 */
export function createConditionalImportPlugin(options = {}) {
  const {
    conditions = {},
    environment = 'development',
    platform = 'browser',
    debugMode = false
  } = options;

  return {
    name: 'conditional-import',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        // 检查条件导入
        for (const [pattern, conditionMap] of Object.entries(conditions)) {
          const regex = new RegExp(pattern);
          if (regex.test(args.path)) {
            // 找到匹配的条件
            let selectedPath = args.path;

            // 环境条件
            if (conditionMap[environment]) {
              selectedPath = conditionMap[environment];
            }
            // 平台条件
            else if (conditionMap[platform]) {
              selectedPath = conditionMap[platform];
            }
            // 默认条件
            else if (conditionMap.default) {
              selectedPath = conditionMap.default;
            }

            if (selectedPath !== args.path) {
              if (debugMode) {
                console.error(`[ConditionalImport] ${args.path} -> ${selectedPath} (${environment}/${platform})`);
              }
              return {
                path: selectedPath,
                external: true
              };
            }
          }
        }

        return null;
      });
    }
  };
}

/**
 * 创建导入拦截器插件
 * 可以拦截和修改导入行为
 * 
 * @param {object} options - 插件选项
 * @returns {object} esbuild插件对象
 */
export function createImportInterceptorPlugin(options = {}) {
  const {
    interceptors = [],
    beforeResolve = null,
    afterResolve = null,
    onError = null
  } = options;

  return {
    name: 'import-interceptor',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        try {
          // 执行预处理
          if (beforeResolve && typeof beforeResolve === 'function') {
            const result = beforeResolve(args);
            if (result) return result;
          }

          // 执行拦截器
          for (const interceptor of interceptors) {
            if (typeof interceptor === 'function') {
              const result = interceptor(args);
              if (result) {
                // 执行后处理
                if (afterResolve && typeof afterResolve === 'function') {
                  const finalResult = afterResolve(result, args);
                  return finalResult || result;
                }
                return result;
              }
            }
          }

          return null;
        } catch (error) {
          if (onError && typeof onError === 'function') {
            onError(error, args);
          }
          return null;
        }
      });
    }
  };
}

export default createDynamicImportPlugin;