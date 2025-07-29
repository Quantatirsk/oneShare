export interface Template {
  id: string;
  codeLang: string;
  title: string;
  description: string;
  category: 'game' | 'dashboard' | 'utility' | 'creative' | 'business' | 'design' | 'other';
  tags: string[];
  code: string;
  preview?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  // 用户模板扩展字段
  isUserTemplate?: boolean;
  creator?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const TEMPLATE_CATEGORIES = {
  game: {
    label: '游戏',
    icon: '🎮',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  },
  dashboard: {
    label: '仪表板',
    icon: '📊',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  },
  utility: {
    label: '工具',
    icon: '🛠️',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  },
  creative: {
    label: '创意',
    icon: '✨',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
  },
  business: {
    label: '商务',
    icon: '💼',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
  },
  design: {
    label: '设计',
    icon: '🎨',
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200'
  },
  other: {
    label: '其他',
    icon: '📱',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
};

// 默认模板数据
export const TEMPLATES: Template[] = [];

// 模板数据缓存 - 使用更明确的初始化
let templatesCache: Template[] = [];



/**
 * 重新加载模板数据（清除缓存）
 */
export const reloadTemplates = async (): Promise<Template[]> => {
  templatesCache = [];
  return await loadTemplates();
};

/**
 * 根据分类获取模板
 */
export const getTemplatesByCategory = async (category: string): Promise<Template[]> => {
  const templates = await loadTemplates();
  if (category === 'all') return templates;
  return templates.filter(template => template.category === category);
};

/**
 * 根据ID获取模板
 */
export const getTemplateById = async (id: string): Promise<Template | undefined> => {
  const templates = await loadTemplates();
  return templates.find(template => template.id === id);
};


/**
 * 根据Code Language获取模板
 */
export const getTemplatesByCodeLang = async (codeLang: string): Promise<Template[]> => {
  const templates = await loadTemplates();
  return templates.filter(template => template.codeLang === codeLang);
};

/**
 * 获取所有分类
 */
export const getAllCategories = (): string[] => {
  return ['all', ...Object.keys(TEMPLATE_CATEGORIES)];
};

/**
 * 搜索模板
 */
export const searchTemplates = async (query: string): Promise<Template[]> => {
  const templates = await loadTemplates();
  const lowerQuery = query.toLowerCase();

  return templates.filter(template =>
    template.title.toLowerCase().includes(lowerQuery) ||
    template.description.toLowerCase().includes(lowerQuery) ||
    template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
};

/**
 * 根据难度获取模板
 */
export const getTemplatesByDifficulty = async (difficulty: 'beginner' | 'intermediate' | 'advanced'): Promise<Template[]> => {
  const templates = await loadTemplates();
  return templates.filter(template => template.difficulty === difficulty);
};

// === 用户模板管理接口 ===

export interface TemplateCreateRequest {
  codeLang: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  code: string;
  preview?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface TemplateUpdateRequest {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  code?: string;
  preview?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * 获取认证令牌
 */
const getAuthToken = (): string | null => {
  // 从localStorage或其他地方获取认证令牌
  // 这里需要根据实际的认证机制来实现
  // 临时跳过验证逻辑 - 使用服务器配置的AUTH_TOKEN
  return localStorage.getItem('auth_token') || 'your-secret-token';
};

/**
 * 创建API请求头
 */
const getApiHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = token;
  }
  
  return headers;
};

/**
 * 从API获取所有模板（包括系统模板和用户模板）
 */
export const loadTemplatesFromApi = async (): Promise<Template[]> => {
  try {
    const response = await fetch('/api/templates', {
      method: 'GET',
      headers: getApiHeaders(),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      return result.data.templates || [];
    } else {
      throw new Error('API response indicated failure');
    }
  } catch (error) {
    console.error('Failed to load templates from API:', error);
    // 降级到静态模板
    return await loadTemplatesFromFile();
  }
};

/**
 * 从静态文件获取模板（原有方法，用作降级）
 */
export const loadTemplatesFromFile = async (): Promise<Template[]> => {
  try {
    const response = await fetch('./templates.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const templates = data.templates || [];
    
    // 标记为系统模板
    return templates.map((template: Template) => ({
      ...template,
      isUserTemplate: false,
      creator: 'system'
    }));
  } catch (error) {
    console.error('Failed to load templates from file:', error);
    return [];
  }
};

/**
 * 更新的模板加载函数，优先使用API
 */
export const loadTemplates = async (): Promise<Template[]> => {
  if (templatesCache.length > 0) {
    return templatesCache;
  }

  // 优先尝试从API加载
  templatesCache = await loadTemplatesFromApi();
  return templatesCache;
};

/**
 * 创建用户模板
 */
export const createUserTemplate = async (templateData: TemplateCreateRequest): Promise<Template> => {
  const response = await fetch('/api/templates', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(templateData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create template');
  }

  const result = await response.json();
  if (result.success) {
    // 清除缓存以便重新加载
    templatesCache = [];
    return result.data;
  } else {
    throw new Error('Failed to create template');
  }
};

/**
 * 更新用户模板
 */
export const updateUserTemplate = async (templateId: string, templateData: TemplateUpdateRequest): Promise<Template> => {
  const response = await fetch(`/api/templates/${templateId}`, {
    method: 'PUT',
    headers: getApiHeaders(),
    body: JSON.stringify(templateData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update template');
  }

  const result = await response.json();
  if (result.success) {
    // 清除缓存以便重新加载
    templatesCache = [];
    return result.data;
  } else {
    throw new Error('Failed to update template');
  }
};

/**
 * 删除用户模板
 */
export const deleteUserTemplate = async (templateId: string): Promise<void> => {
  const response = await fetch(`/api/templates/${templateId}`, {
    method: 'DELETE',
    headers: getApiHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete template');
  }

  const result = await response.json();
  if (result.success) {
    // 清除缓存以便重新加载
    templatesCache = [];
  } else {
    throw new Error('Failed to delete template');
  }
};

/**
 * 获取用户模板列表
 */
export const getUserTemplates = async (): Promise<Template[]> => {
  try {
    const response = await fetch('/api/templates/user', {
      method: 'GET',
      headers: getApiHeaders(),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      return result.data.templates || [];
    } else {
      throw new Error('API response indicated failure');
    }
  } catch (error) {
    console.error('Failed to load user templates:', error);
    return [];
  }
};

/**
 * 检查用户是否已认证（有权限管理模板）
 */
export const isUserAuthenticated = (): boolean => {
  return getAuthToken() !== null;
};