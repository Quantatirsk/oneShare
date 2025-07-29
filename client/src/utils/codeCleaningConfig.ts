/**
 * 代码清理配置和调试工具
 */

import { CleaningOptions } from './codeCleaningUtils';

// 全局配置
export interface CodeCleaningGlobalConfig {
  enabled: boolean;                    // 是否启用代码清理
  aggressiveIntroRemoval: boolean;     // 是否激进移除介绍文字
  fallbackToOriginal: boolean;         // 失败时是否降级到原始内容
  debugMode: boolean;                  // 是否启用调试模式
  logPerformance: boolean;            // 是否记录性能指标
  maxContentLength: number;           // 最大处理内容长度
  retryAttempts: number;              // 清理失败时的重试次数
}

// 默认全局配置
const DEFAULT_GLOBAL_CONFIG: CodeCleaningGlobalConfig = {
  enabled: true,
  aggressiveIntroRemoval: true,
  fallbackToOriginal: true,
  debugMode: false,
  logPerformance: false,
  maxContentLength: 100000, // 50KB
  retryAttempts: 2
};

// 全局配置实例
let globalConfig: CodeCleaningGlobalConfig = { ...DEFAULT_GLOBAL_CONFIG };

/**
 * 获取全局配置
 */
export function getGlobalConfig(): CodeCleaningGlobalConfig {
  return { ...globalConfig };
}

/**
 * 更新全局配置
 */
export function updateGlobalConfig(updates: Partial<CodeCleaningGlobalConfig>): void {
  globalConfig = { ...globalConfig, ...updates };
  
  if (globalConfig.debugMode) {
    console.log('🧹 [CodeCleaning] Global config updated:', globalConfig);
  }
}

/**
 * 重置为默认配置
 */
export function resetGlobalConfig(): void {
  globalConfig = { ...DEFAULT_GLOBAL_CONFIG };
  console.log('🧹 [CodeCleaning] Global config reset to defaults');
}

/**
 * 根据全局配置获取清理选项
 */
export function getDefaultCleaningOptions(): CleaningOptions {
  return {
    removeCodeblocks: globalConfig.enabled,
    removeIntroText: globalConfig.enabled && globalConfig.aggressiveIntroRemoval,
    trimWhitespace: globalConfig.enabled,
    preserveStructure: true,
    debugMode: globalConfig.debugMode
  };
}

/**
 * 性能监控接口
 */
export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  contentLength: number;
  success: boolean;
  error?: string;
}

// 性能指标存储
const performanceMetrics: PerformanceMetrics[] = [];
const MAX_METRICS_HISTORY = 100;

/**
 * 开始性能监控
 */
export function startPerformanceMonitor(operation: string, contentLength: number): number {
  const startTime = Date.now();
  
  if (globalConfig.logPerformance && globalConfig.debugMode) {
    console.time(`🧹 [CodeCleaning] ${operation}`);
    console.log(`🧹 [CodeCleaning] Starting ${operation} (${contentLength} chars)`);
  }
  
  return startTime;
}

/**
 * 结束性能监控
 */
export function endPerformanceMonitor(
  operation: string,
  startTime: number,
  contentLength: number,
  success: boolean,
  error?: string
): void {
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const metrics: PerformanceMetrics = {
    operation,
    startTime,
    endTime,
    duration,
    contentLength,
    success,
    error
  };
  
  // 记录指标
  performanceMetrics.push(metrics);
  
  // 保持历史记录在限制范围内
  if (performanceMetrics.length > MAX_METRICS_HISTORY) {
    performanceMetrics.shift();
  }
  
  if (globalConfig.logPerformance) {
    if (globalConfig.debugMode) {
      console.timeEnd(`🧹 [CodeCleaning] ${operation}`);
    }
    
    console.log(`🧹 [CodeCleaning] ${operation} completed:`, {
      duration: `${duration}ms`,
      contentLength,
      success,
      error: error || 'none'
    });
  }
}

/**
 * 获取性能指标
 */
export function getPerformanceMetrics(): PerformanceMetrics[] {
  return [...performanceMetrics];
}

/**
 * 获取性能统计
 */
export function getPerformanceStats(): {
  totalOperations: number;
  successRate: number;
  averageDuration: number;
  averageContentLength: number;
  errorTypes: Record<string, number>;
} {
  const metrics = performanceMetrics;
  
  if (metrics.length === 0) {
    return {
      totalOperations: 0,
      successRate: 0,
      averageDuration: 0,
      averageContentLength: 0,
      errorTypes: {}
    };
  }
  
  const totalOperations = metrics.length;
  const successfulOperations = metrics.filter(m => m.success).length;
  const successRate = (successfulOperations / totalOperations) * 100;
  
  const averageDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations;
  const averageContentLength = metrics.reduce((sum, m) => sum + m.contentLength, 0) / totalOperations;
  
  const errorTypes: Record<string, number> = {};
  metrics
    .filter(m => !m.success && m.error)
    .forEach(m => {
      const errorType = m.error!;
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });
  
  return {
    totalOperations,
    successRate: Math.round(successRate * 100) / 100,
    averageDuration: Math.round(averageDuration * 100) / 100,
    averageContentLength: Math.round(averageContentLength),
    errorTypes
  };
}

/**
 * 清除性能指标
 */
export function clearPerformanceMetrics(): void {
  performanceMetrics.length = 0;
  console.log('🧹 [CodeCleaning] Performance metrics cleared');
}

/**
 * 调试辅助函数 - 启用调试模式
 */
export function enableDebugMode(): void {
  updateGlobalConfig({ debugMode: true, logPerformance: true });
  console.log('🧹 [CodeCleaning] Debug mode enabled');
}

/**
 * 调试辅助函数 - 禁用调试模式
 */
export function disableDebugMode(): void {
  updateGlobalConfig({ debugMode: false, logPerformance: false });
  console.log('🧹 [CodeCleaning] Debug mode disabled');
}

/**
 * 获取调试信息
 */
export function getDebugInfo(): {
  config: CodeCleaningGlobalConfig;
  stats: ReturnType<typeof getPerformanceStats>;
  recentMetrics: PerformanceMetrics[];
} {
  return {
    config: getGlobalConfig(),
    stats: getPerformanceStats(),
    recentMetrics: performanceMetrics.slice(-10) // 最近10次操作
  };
}

/**
 * 环境特定配置
 */
export function configureForEnvironment(env: 'development' | 'production' | 'testing'): void {
  switch (env) {
    case 'development':
      updateGlobalConfig({
        debugMode: true,
        logPerformance: true,
        retryAttempts: 3
      });
      break;
      
    case 'production':
      updateGlobalConfig({
        debugMode: false,
        logPerformance: false,
        retryAttempts: 1,
        fallbackToOriginal: true
      });
      break;
      
    case 'testing':
      updateGlobalConfig({
        debugMode: true,
        logPerformance: true,
        retryAttempts: 1
      });
      break;
  }
  
  console.log(`🧹 [CodeCleaning] Configured for ${env} environment`);
}

/**
 * 导出给开发者的全局调试接口
 */
if (typeof window !== 'undefined') {
  (window as any).__codeCleaningDebug = {
    getConfig: getGlobalConfig,
    updateConfig: updateGlobalConfig,
    resetConfig: resetGlobalConfig,
    enableDebug: enableDebugMode,
    disableDebug: disableDebugMode,
    getStats: getPerformanceStats,
    getDebugInfo,
    clearMetrics: clearPerformanceMetrics
  };
}