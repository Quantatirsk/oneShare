/**
 * 库解析插件
 * 
 * 提供高级库解析功能，支持：
 * - 智能版本解析
 * - 依赖递归解析
 * - 多CDN支持
 * - 缓存机制
 * - 错误恢复
 * - 别名映射
 */

import { CDNFetcher, getPackageUrl } from '../utils/cdn-fetcher.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 特殊库映射配置
 */
const SPECIAL_LIBRARY_MAPPINGS = {
  // React生态
  'react/jsx-runtime': 'https://esm.sh/react@latest/jsx-runtime',
  'react-dom/client': 'https://esm.sh/react-dom@latest/client',
  'react-dom/server': 'https://esm.sh/react-dom@latest/server',
  
  // 常见的路径别名
  '@react-three/fiber': 'https://esm.sh/@react-three/fiber@latest',
  '@react-three/drei': 'https://esm.sh/@react-three/drei@latest',
  
  // 工具库
  'lodash-es': 'https://esm.sh/lodash-es@latest',
  'date-fns': 'https://esm.sh/date-fns@latest',
  
  // UI库
  '@mui/material': 'https://esm.sh/@mui/material@latest',
  '@chakra-ui/react': 'https://esm.sh/@chakra-ui/react@latest'
};

/**
 * 版本策略
 */
const VERSION_STRATEGIES = {
  LATEST: 'latest',
  EXACT: 'exact',
  RANGE: 'range',
  LTS: 'lts'
};

/**
 * 创建库解析插件
 * 
 * @param {object} options - 插件选项
 * @returns {object} esbuild插件对象
 */
export function createLibraryResolvePlugin(options = {}) {
  const {
    enableCaching = true,
    enableFallback = true,
    preferredCDN = 'ESM_SH',
    fallbackCDNs = ['UNPKG', 'SKYPACK'],
    versionStrategy = VERSION_STRATEGIES.LATEST,
    customMappings = {},
    resolveSubpath = true,
    enableDependencyAnalysis = false,
    debugMode = false
  } = options;

  // 合并映射配置
  const allMappings = { ...SPECIAL_LIBRARY_MAPPINGS, ...customMappings };
  
  // 创建CDN获取器实例
  const cdnFetcher = new CDNFetcher({
    preferredCDN,
    fallbackCDNs,
    enableCache: enableCaching,
    enableRetry: enableFallback
  });

  // 解析缓存
  const resolveCache = new Map();

  return {
    name: 'library-resolve',
    setup(build) {
      // 处理npm包解析
      build.onResolve({ filter: /^[^./]/ }, async (args) => {
        if (debugMode) {
          console.error(`[LibraryResolve] Resolving: ${args.path}`);
        }

        // 跳过虚拟文件
        if (args.path.startsWith('virtual:')) {
          return null;
        }

        // 跳过已经是完整URL的路径
        if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
          return null;
        }

        // 跳过Node.js内置模块
        if (isNodeBuiltin(args.path)) {
          return {
            path: args.path,
            external: true
          };
        }

        // 检查缓存
        const cacheKey = `${args.path}:${versionStrategy}`;
        if (enableCaching && resolveCache.has(cacheKey)) {
          const cachedResult = resolveCache.get(cacheKey);
          if (debugMode) {
            console.error(`[LibraryResolve] Cache hit: ${args.path} -> ${cachedResult.path}`);
          }
          return cachedResult;
        }

        try {
          const resolvedResult = await resolveLibrary(args.path, {
            allMappings,
            cdnFetcher,
            versionStrategy,
            resolveSubpath,
            enableDependencyAnalysis,
            debugMode
          });

          // 缓存结果
          if (enableCaching && resolvedResult) {
            resolveCache.set(cacheKey, resolvedResult);
          }

          return resolvedResult;

        } catch (error) {
          if (debugMode) {
            console.error(`[LibraryResolve] Error resolving ${args.path}:`, error);
          }

          // 返回基本的CDN URL作为fallback
          const fallbackUrl = getPackageUrl(args.path, 'latest', { cdnProvider: preferredCDN });
          return {
            path: fallbackUrl,
            external: true
          };
        }
      });

      // 处理动态导入
      build.onLoad({ filter: /\.js$/, namespace: 'library-resolve' }, async (args) => {
        // 这里可以处理特殊的库加载逻辑
        return null;
      });
    }
  };
}

/**
 * 解析单个库
 * 
 * @private
 * @param {string} libraryPath - 库路径
 * @param {object} context - 解析上下文
 * @returns {Promise<object>} 解析结果
 */
async function resolveLibrary(libraryPath, context) {
  const {
    allMappings,
    cdnFetcher,
    versionStrategy,
    resolveSubpath,
    enableDependencyAnalysis,
    debugMode
  } = context;

  // 检查特殊映射
  if (allMappings[libraryPath]) {
    if (debugMode) {
      console.error(`[LibraryResolve] Special mapping: ${libraryPath} -> ${allMappings[libraryPath]}`);
    }
    return {
      path: allMappings[libraryPath],
      external: true
    };
  }

  // 解析包名和子路径
  const { packageName, subpath, version } = parseLibraryPath(libraryPath);
  
  if (debugMode) {
    console.error(`[LibraryResolve] Parsed: ${libraryPath} -> package=${packageName}, subpath=${subpath}, version=${version}`);
  }

  // 解析版本
  let resolvedVersion = version || 'latest';
  if (versionStrategy === VERSION_STRATEGIES.LTS) {
    // 可以在这里实现LTS版本解析逻辑
    resolvedVersion = 'latest';
  }

  // 构建CDN URL
  let cdnUrl;
  if (subpath && resolveSubpath) {
    cdnUrl = cdnFetcher.getPackageUrl(packageName, resolvedVersion, {
      subpath: subpath
    });
  } else {
    cdnUrl = cdnFetcher.getPackageUrl(libraryPath, resolvedVersion);
  }

  // 如果启用依赖分析，可以在这里分析包的依赖
  if (enableDependencyAnalysis) {
    try {
      await analyzeDependencies(packageName, resolvedVersion, cdnFetcher);
    } catch (error) {
      // 依赖分析失败不影响主流程
      if (debugMode) {
        console.warn(`[LibraryResolve] Dependency analysis failed for ${packageName}:`, error);
      }
    }
  }

  return {
    path: cdnUrl,
    external: true
  };
}

/**
 * 解析库路径
 * 
 * @private
 * @param {string} libraryPath - 库路径
 * @returns {object} 解析结果
 */
function parseLibraryPath(libraryPath) {
  // 匹配版本号模式，如 package@1.2.3
  const versionMatch = libraryPath.match(/^(.+?)@(.+)$/);
  if (versionMatch) {
    const [, path, version] = versionMatch;
    const { packageName, subpath } = parsePackageAndSubpath(path);
    return { packageName, subpath, version };
  }

  // 没有版本号，解析包名和子路径
  const { packageName, subpath } = parsePackageAndSubpath(libraryPath);
  return { packageName, subpath, version: null };
}

/**
 * 解析包名和子路径
 * 
 * @private
 * @param {string} path - 路径
 * @returns {object} 解析结果
 */
function parsePackageAndSubpath(path) {
  const parts = path.split('/');
  
  if (parts[0].startsWith('@')) {
    // Scoped package: @scope/package/subpath
    if (parts.length <= 2) {
      return {
        packageName: path,
        subpath: null
      };
    }
    return {
      packageName: `${parts[0]}/${parts[1]}`,
      subpath: parts.slice(2).join('/')
    };
  } else {
    // Regular package: package/subpath
    if (parts.length <= 1) {
      return {
        packageName: path,
        subpath: null
      };
    }
    return {
      packageName: parts[0],
      subpath: parts.slice(1).join('/')
    };
  }
}

/**
 * 检查是否为Node.js内置模块
 * 
 * @private
 * @param {string} moduleName - 模块名
 * @returns {boolean} 是否为内置模块
 */
function isNodeBuiltin(moduleName) {
  const builtins = [
    'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
    'domain', 'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode',
    'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'tls',
    'tty', 'url', 'util', 'vm', 'zlib'
  ];
  return builtins.includes(moduleName);
}

/**
 * 分析包依赖
 * 
 * @private
 * @param {string} packageName - 包名
 * @param {string} version - 版本
 * @param {CDNFetcher} cdnFetcher - CDN获取器
 * @returns {Promise<object>} 依赖分析结果
 */
async function analyzeDependencies(packageName, version, cdnFetcher) {
  try {
    // 获取package.json
    const packageJsonUrl = `https://unpkg.com/${packageName}@${version}/package.json`;
    const response = await cdnFetcher._httpGet(packageJsonUrl);
    
    if (response.success) {
      const packageInfo = JSON.parse(response.content);
      const dependencies = {
        dependencies: packageInfo.dependencies || {},
        peerDependencies: packageInfo.peerDependencies || {},
        devDependencies: packageInfo.devDependencies || {}
      };
      
      return {
        success: true,
        packageName,
        version,
        dependencies
      };
    }
  } catch (error) {
    // 分析失败
  }

  return {
    success: false,
    packageName,
    version,
    error: 'Unable to analyze dependencies'
  };
}

/**
 * 创建高级库解析插件
 * 
 * @param {object} options - 插件选项
 * @returns {object} esbuild插件对象
 */
export function createAdvancedLibraryResolvePlugin(options = {}) {
  const {
    libraryVersions = {},
    customResolvers = {},
    enablePolyfills = false,
    polyfillConfig = {},
    enableBundleAnalysis = false,
    ...baseOptions
  } = options;

  const basePlugin = createLibraryResolvePlugin(baseOptions);

  return {
    name: 'advanced-library-resolve',
    setup(build) {
      // 先运行基础插件
      basePlugin.setup(build);

      // 添加高级解析逻辑
      build.onResolve({ filter: /.*/ }, async (args) => {
        // 检查自定义解析器
        for (const [pattern, resolver] of Object.entries(customResolvers)) {
          const regex = new RegExp(pattern);
          if (regex.test(args.path)) {
            if (typeof resolver === 'function') {
              const result = await resolver(args);
              if (result) return result;
            }
          }
        }

        // 检查固定版本配置
        if (libraryVersions[args.path]) {
          const version = libraryVersions[args.path];
          const url = getPackageUrl(args.path, version);
          return {
            path: url,
            external: true
          };
        }

        return null;
      });

      // Polyfill处理
      if (enablePolyfills) {
        build.onLoad({ filter: /.*/, namespace: 'polyfill' }, (args) => {
          const polyfillCode = polyfillConfig[args.path];
          if (polyfillCode) {
            return {
              contents: polyfillCode,
              loader: 'js'
            };
          }
          return null;
        });
      }
    }
  };
}

/**
 * 创建缓存感知的库解析插件
 * 
 * @param {object} options - 插件选项
 * @returns {object} esbuild插件对象
 */
export function createCacheAwareLibraryResolvePlugin(options = {}) {
  const {
    cacheStrategy = 'memory',
    cacheTTL = 3600000, // 1小时
    enablePersistentCache = false,
    cacheDir = './cache',
    ...baseOptions
  } = options;

  // 实现缓存策略
  let cache;
  if (cacheStrategy === 'memory') {
    cache = new Map();
  } else if (cacheStrategy === 'persistent' && enablePersistentCache) {
    // 可以在这里实现持久化缓存
    cache = new Map(); // 暂时用内存缓存
  }

  return createLibraryResolvePlugin({
    ...baseOptions,
    enableCaching: true,
    customCache: cache
  });
}

export default createLibraryResolvePlugin;