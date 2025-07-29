/**
 * CDN 获取器
 * 
 * 提供从CDN获取外部依赖的功能，支持：
 * - 多种CDN源（ESM.sh, unpkg, skypack等）
 * - 自动版本解析
 * - 缓存机制
 * - 失败重试
 * - 依赖解析
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

/**
 * CDN 配置
 */
export const CDN_PROVIDERS = {
  ESM_SH: {
    name: 'esm.sh',
    baseUrl: 'https://esm.sh',
    template: 'https://esm.sh/{package}@{version}',
    supports: ['esm', 'cjs', 'umd'],
    features: ['typescript-defs', 'subpath-imports', 'node-polyfills']
  },
  UNPKG: {
    name: 'unpkg',
    baseUrl: 'https://unpkg.com',
    template: 'https://unpkg.com/{package}@{version}',
    supports: ['esm', 'cjs', 'umd'],
    features: ['file-browser', 'package-info']
  },
  SKYPACK: {
    name: 'skypack',
    baseUrl: 'https://cdn.skypack.dev',
    template: 'https://cdn.skypack.dev/{package}@{version}',
    supports: ['esm'],
    features: ['optimized-esm', 'typescript-defs']
  },
  JSDELIVR: {
    name: 'jsdelivr',
    baseUrl: 'https://cdn.jsdelivr.net',
    template: 'https://cdn.jsdelivr.net/npm/{package}@{version}',
    supports: ['esm', 'cjs', 'umd'],
    features: ['file-browser', 'package-stats']
  }
};

/**
 * CDN 获取器类
 */
export class CDNFetcher {
  constructor(options = {}) {
    this.options = {
      timeout: 10000,
      retries: 3,
      cache: new Map(),
      preferredCDN: 'ESM_SH',
      fallbackCDNs: ['UNPKG', 'SKYPACK', 'JSDELIVR'],
      enableCache: true,
      enableRetry: true,
      ...options
    };
    
    this.stats = {
      requests: 0,
      hits: 0,
      misses: 0,
      errors: 0,
      retries: 0
    };
  }

  /**
   * 获取包的CDN URL
   * 
   * @param {string} packageName - 包名
   * @param {string} version - 版本号，默认为 'latest'
   * @param {object} options - 选项
   * @returns {string} CDN URL
   */
  getPackageUrl(packageName, version = 'latest', options = {}) {
    const {
      cdnProvider = this.options.preferredCDN,
      format = 'esm',
      subpath = null
    } = options;

    const provider = CDN_PROVIDERS[cdnProvider];
    if (!provider) {
      throw new Error(`Unknown CDN provider: ${cdnProvider}`);
    }

    let url = provider.template
      .replace('{package}', packageName)
      .replace('{version}', version);

    // 处理子路径
    if (subpath) {
      url += `/${subpath}`;
    }

    // 处理带有子路径的包名（如 three/examples/jsm/controls/OrbitControls.js）
    const parts = packageName.split('/');
    if (parts.length > 1) {
      if (parts[0].startsWith('@')) {
        // scoped package: @scope/package/subpath
        const scope = parts[0];
        const pkg = parts[1];
        const subPath = parts.slice(2).join('/');
        const basePackage = `${scope}/${pkg}`;
        
        url = provider.template
          .replace('{package}', basePackage)
          .replace('{version}', version);
        
        if (subPath) {
          url += `/${subPath}`;
        }
      } else {
        // 普通包: package/subpath
        const pkg = parts[0];
        const subPath = parts.slice(1).join('/');
        
        url = provider.template
          .replace('{package}', pkg)
          .replace('{version}', version);
        
        if (subPath) {
          url += `/${subPath}`;
        }
      }
    }

    return url;
  }

  /**
   * 从CDN获取包内容
   * 
   * @param {string} packageName - 包名
   * @param {string} version - 版本号
   * @param {object} options - 选项
   * @returns {Promise<object>} 获取结果
   */
  async fetchPackage(packageName, version = 'latest', options = {}) {
    this.stats.requests++;
    
    const cacheKey = `${packageName}@${version}`;
    
    // 检查缓存
    if (this.options.enableCache && this.options.cache.has(cacheKey)) {
      this.stats.hits++;
      return this.options.cache.get(cacheKey);
    }
    
    this.stats.misses++;

    // 尝试从首选CDN获取
    let result = await this._fetchFromCDN(packageName, version, this.options.preferredCDN, options);
    
    // 如果失败，尝试备用CDN
    if (!result.success && this.options.fallbackCDNs.length > 0) {
      for (const cdnProvider of this.options.fallbackCDNs) {
        result = await this._fetchFromCDN(packageName, version, cdnProvider, options);
        if (result.success) {
          break;
        }
      }
    }

    // 缓存成功的结果
    if (result.success && this.options.enableCache) {
      this.options.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * 从指定CDN获取包
   * 
   * @private
   * @param {string} packageName - 包名
   * @param {string} version - 版本号
   * @param {string} cdnProvider - CDN提供商
   * @param {object} options - 选项
   * @returns {Promise<object>} 获取结果
   */
  async _fetchFromCDN(packageName, version, cdnProvider, options) {
    const url = this.getPackageUrl(packageName, version, {
      cdnProvider,
      ...options
    });

    const result = {
      success: false,
      url,
      content: null,
      headers: null,
      error: null,
      cdnProvider,
      packageName,
      version
    };

    try {
      const response = await this._httpGet(url);
      result.success = response.success;
      result.content = response.content;
      result.headers = response.headers;
      result.error = response.error;
    } catch (error) {
      this.stats.errors++;
      result.error = error.message;
    }

    return result;
  }

  /**
   * HTTP GET 请求
   * 
   * @private
   * @param {string} url - URL
   * @returns {Promise<object>} 响应
   */
  async _httpGet(url) {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout: this.options.timeout,
        headers: {
          'User-Agent': 'CDN-Fetcher/1.0'
        }
      };

      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              content: data,
              headers: res.headers,
              statusCode: res.statusCode
            });
          } else {
            resolve({
              success: false,
              content: null,
              headers: res.headers,
              statusCode: res.statusCode,
              error: `HTTP ${res.statusCode}: ${res.statusMessage}`
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          content: null,
          headers: null,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          content: null,
          headers: null,
          error: `Request timeout (${this.options.timeout}ms)`
        });
      });

      req.end();
    });
  }

  /**
   * 获取包的版本信息
   * 
   * @param {string} packageName - 包名
   * @returns {Promise<object>} 版本信息
   */
  async getPackageVersions(packageName) {
    // 使用 unpkg 的 package info API
    const url = `https://unpkg.com/${packageName}/package.json`;
    
    try {
      const response = await this._httpGet(url);
      if (response.success) {
        const packageInfo = JSON.parse(response.content);
        return {
          success: true,
          latest: packageInfo.version,
          packageInfo
        };
      }
    } catch (error) {
      // 继续尝试其他方法
    }

    // 备用方法：使用 registry API
    try {
      const registryUrl = `https://registry.npmjs.org/${packageName}`;
      const response = await this._httpGet(registryUrl);
      if (response.success) {
        const registryInfo = JSON.parse(response.content);
        return {
          success: true,
          latest: registryInfo['dist-tags'].latest,
          versions: Object.keys(registryInfo.versions),
          packageInfo: registryInfo.versions[registryInfo['dist-tags'].latest]
        };
      }
    } catch (error) {
      // 失败
    }

    return {
      success: false,
      error: 'Unable to fetch package version information'
    };
  }

  /**
   * 批量获取多个包
   * 
   * @param {array} packages - 包列表 [{name, version?, options?}]
   * @returns {Promise<object>} 批量获取结果
   */
  async fetchPackages(packages) {
    const results = {};
    const promises = packages.map(async (pkg) => {
      const { name, version = 'latest', options = {} } = pkg;
      const result = await this.fetchPackage(name, version, options);
      results[name] = result;
      return result;
    });

    await Promise.all(promises);
    
    return {
      success: true,
      results,
      stats: this.getStats()
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.options.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * 获取统计信息
   * 
   * @returns {object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.options.cache.size,
      hitRate: this.stats.requests > 0 ? (this.stats.hits / this.stats.requests) : 0
    };
  }

  /**
   * 设置选项
   * 
   * @param {object} newOptions - 新选项
   */
  setOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }
}

/**
 * 默认CDN获取器实例
 */
export const defaultCDNFetcher = new CDNFetcher();

/**
 * 便捷函数：获取包URL
 * 
 * @param {string} packageName - 包名
 * @param {string} version - 版本号
 * @param {object} options - 选项
 * @returns {string} CDN URL
 */
export function getPackageUrl(packageName, version = 'latest', options = {}) {
  return defaultCDNFetcher.getPackageUrl(packageName, version, options);
}

/**
 * 便捷函数：获取包内容
 * 
 * @param {string} packageName - 包名
 * @param {string} version - 版本号
 * @param {object} options - 选项
 * @returns {Promise<object>} 获取结果
 */
export function fetchPackage(packageName, version = 'latest', options = {}) {
  return defaultCDNFetcher.fetchPackage(packageName, version, options);
}

export default CDNFetcher;