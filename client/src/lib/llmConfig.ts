/**
 * LLM 配置管理模块
 * 提供统一的 LLM 配置获取和缓存功能
 */

interface LLMConfig {
  default_model: string;
  temperature: number;
  max_tokens: number;
  available: boolean;
}

// 配置缓存
let configCache: LLMConfig | null = null;
let configPromise: Promise<LLMConfig> | null = null;

/**
 * 从后端获取 LLM 配置
 */
async function fetchLLMConfig(): Promise<LLMConfig> {
  try {
    const response = await fetch('/api/llm/config');
    if (!response.ok) {
      throw new Error(`Failed to fetch LLM config: ${response.status}`);
    }
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching LLM config:', error);
    // 返回默认配置
    return {
      default_model: 'google/gemini-2.5-flash-lite',
      temperature: 0.8,
      max_tokens: 32000,
      available: false
    };
  }
}

/**
 * 获取 LLM 配置（异步，带缓存）
 */
export const getLLMConfig = async (): Promise<LLMConfig> => {
  // 如果已有缓存，直接返回
  if (configCache) {
    return configCache;
  }

  // 如果正在请求中，等待请求完成
  if (configPromise) {
    return configPromise;
  }

  // 发起新的请求
  configPromise = fetchLLMConfig().then(config => {
    configCache = config;
    configPromise = null;
    return config;
  }).catch(error => {
    configPromise = null;
    throw error;
  });

  return configPromise;
};

/**
 * 获取默认模型名称（异步）
 */
export const getDefaultModel = async (): Promise<string> => {
  const config = await getLLMConfig();
  return config.default_model;
};

/**
 * 获取默认模型名称（同步，用于初始化）
 * 如果配置未加载，返回 fallback 值
 */
export const getDefaultModelSync = (): string => {
  if (configCache) {
    return configCache.default_model;
  }
  return 'google/gemini-2.5-flash-lite';
};

/**
 * 获取默认温度参数
 */
export const getDefaultTemperature = async (): Promise<number> => {
  const config = await getLLMConfig();
  return config.temperature;
};

/**
 * 获取默认最大 token 数
 */
export const getDefaultMaxTokens = async (): Promise<number> => {
  const config = await getLLMConfig();
  return config.max_tokens;
};

/**
 * 检查 LLM 服务是否可用
 */
export const isLLMAvailable = async (): Promise<boolean> => {
  const config = await getLLMConfig();
  return config.available;
};

/**
 * 清除配置缓存（用于测试或强制重新加载）
 */
export const clearConfigCache = (): void => {
  configCache = null;
  configPromise = null;
};

/**
 * 预加载配置（用于应用启动时）
 */
export const preloadConfig = (): Promise<LLMConfig> => {
  return getLLMConfig();
};