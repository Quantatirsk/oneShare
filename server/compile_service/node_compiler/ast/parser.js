/**
 * AST 解析器
 * 
 * 提供TSX/TypeScript代码的AST解析功能，支持：
 * - TypeScript语法解析
 * - JSX语法解析
 * - ES模块解析
 * - 错误处理和恢复
 * - 源码位置信息
 */

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

/**
 * 解析器配置
 */
export const PARSER_CONFIG = {
  // 基础TypeScript配置
  typescript: {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    plugins: [
      'typescript',
      'jsx',
      'decorators-legacy',
      'classProperties',
      'objectRestSpread',
      'functionBind',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'dynamicImport',
      'nullishCoalescingOperator',
      'optionalChaining',
      'logicalAssignment',
      'numericSeparator',
      'optionalCatchBinding',
      'throwExpressions',
      'topLevelAwait'
    ]
  },
  
  // 严格TypeScript配置
  strict: {
    sourceType: 'module',
    strictMode: true,
    allowImportExportEverywhere: false,
    allowReturnOutsideFunction: false,
    plugins: [
      'typescript',
      'jsx'
    ]
  },
  
  // JavaScript配置
  javascript: {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    plugins: [
      'jsx',
      'decorators-legacy',
      'classProperties',
      'objectRestSpread',
      'functionBind',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'dynamicImport',
      'nullishCoalescingOperator',
      'optionalChaining',
      'logicalAssignment',
      'numericSeparator',
      'optionalCatchBinding',
      'throwExpressions',
      'topLevelAwait'
    ]
  }
};

/**
 * TSX 解析器类
 */
export class TSXParser {
  constructor(options = {}) {
    this.options = {
      config: 'typescript',
      enableErrorRecovery: true,
      preserveComments: false,
      preserveParens: true,
      ranges: true,
      tokens: false,
      ...options
    };
    
    this.stats = {
      parsedFiles: 0,
      parseErrors: 0,
      parseTime: 0
    };
  }

  /**
   * 解析代码为AST
   * 
   * @param {string} code - 源代码
   * @param {string} filename - 文件名（可选）
   * @param {object} options - 解析选项
   * @returns {object} 解析结果
   */
  parse(code, filename = 'unknown', options = {}) {
    const startTime = Date.now();
    
    try {
      // 合并配置
      const config = {
        ...PARSER_CONFIG[this.options.config],
        ...options
      };
      
      // 添加文件名
      if (filename) {
        config.filename = filename;
      }
      
      // 解析AST
      const ast = parser.parse(code, config);
      
      // 统计信息
      this.stats.parsedFiles++;
      this.stats.parseTime += Date.now() - startTime;
      
      return {
        success: true,
        ast,
        filename,
        parseTime: Date.now() - startTime,
        errors: [],
        warnings: []
      };
      
    } catch (error) {
      this.stats.parseErrors++;
      
      // 尝试错误恢复
      if (this.options.enableErrorRecovery) {
        const recoveryResult = this._attemptErrorRecovery(code, filename, options, error);
        if (recoveryResult.success) {
          return recoveryResult;
        }
      }
      
      return {
        success: false,
        ast: null,
        filename,
        parseTime: Date.now() - startTime,
        errors: [this._formatError(error, filename)],
        warnings: []
      };
    }
  }

  /**
   * 尝试错误恢复
   * 
   * @private
   * @param {string} code - 源代码
   * @param {string} filename - 文件名
   * @param {object} options - 选项
   * @param {Error} originalError - 原始错误
   * @returns {object} 恢复结果
   */
  _attemptErrorRecovery(code, filename, options, originalError) {
    const recoveryStrategies = [
      // 策略1: 使用宽松的JavaScript配置
      () => {
        const config = { ...PARSER_CONFIG.javascript, ...options };
        return parser.parse(code, config);
      },
      
      // 策略2: 移除TypeScript特性
      () => {
        const cleanCode = this._removeTypeScriptFeatures(code);
        const config = { ...PARSER_CONFIG.javascript, ...options };
        return parser.parse(cleanCode, config);
      },
      
      // 策略3: 包装成模块
      () => {
        const wrappedCode = `export default function() {\n${code}\n}`;
        const config = { ...PARSER_CONFIG.typescript, ...options };
        return parser.parse(wrappedCode, config);
      }
    ];

    for (let i = 0; i < recoveryStrategies.length; i++) {
      try {
        const ast = recoveryStrategies[i]();
        return {
          success: true,
          ast,
          filename,
          parseTime: 0,
          errors: [],
          warnings: [{
            type: 'recovery',
            message: `解析错误已恢复，使用策略 ${i + 1}`,
            originalError: this._formatError(originalError, filename)
          }]
        };
      } catch (recoveryError) {
        // 继续下一个策略
      }
    }

    return { success: false };
  }

  /**
   * 移除TypeScript特性（简单的正则替换）
   * 
   * @private
   * @param {string} code - 源代码
   * @returns {string} 清理后的代码
   */
  _removeTypeScriptFeatures(code) {
    return code
      // 移除类型注解
      .replace(/:\s*[A-Za-z][A-Za-z0-9<>|&\[\]]*(\s*=\s*[^,;]+)?/g, '')
      // 移除泛型
      .replace(/<[A-Za-z][A-Za-z0-9<>|&\[\],\s]*>/g, '')
      // 移除接口定义
      .replace(/interface\s+\w+\s*{[^}]*}/g, '')
      // 移除类型别名
      .replace(/type\s+\w+\s*=\s*[^;]+;/g, '')
      // 移除枚举
      .replace(/enum\s+\w+\s*{[^}]*}/g, '');
  }

  /**
   * 格式化错误信息
   * 
   * @private
   * @param {Error} error - 错误对象
   * @param {string} filename - 文件名
   * @returns {object} 格式化的错误信息
   */
  _formatError(error, filename) {
    return {
      type: 'parse_error',
      message: error.message,
      filename,
      line: error.loc?.line,
      column: error.loc?.column,
      pos: error.pos,
      code: error.code,
      stack: error.stack
    };
  }

  /**
   * 批量解析多个文件
   * 
   * @param {array} files - 文件列表 [{code, filename}]
   * @param {object} options - 解析选项
   * @returns {array} 解析结果列表
   */
  parseMultiple(files, options = {}) {
    return files.map(file => {
      return this.parse(file.code, file.filename, options);
    });
  }

  /**
   * 获取统计信息
   * 
   * @returns {object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.parsedFiles > 0 ? 
        ((this.stats.parsedFiles - this.stats.parseErrors) / this.stats.parsedFiles) : 0,
      averageParseTime: this.stats.parsedFiles > 0 ? 
        (this.stats.parseTime / this.stats.parsedFiles) : 0
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      parsedFiles: 0,
      parseErrors: 0,
      parseTime: 0
    };
  }
}

/**
 * 便捷函数：解析TSX代码
 * 
 * @param {string} code - 源代码
 * @param {string} filename - 文件名
 * @param {object} options - 选项
 * @returns {object} 解析结果
 */
export function parseTSX(code, filename = 'unknown', options = {}) {
  const parser = new TSXParser(options);
  return parser.parse(code, filename);
}

/**
 * 便捷函数：解析JavaScript代码
 * 
 * @param {string} code - 源代码
 * @param {string} filename - 文件名
 * @param {object} options - 选项
 * @returns {object} 解析结果
 */
export function parseJS(code, filename = 'unknown', options = {}) {
  const parser = new TSXParser({ config: 'javascript', ...options });
  return parser.parse(code, filename);
}

/**
 * 便捷函数：严格解析TypeScript代码
 * 
 * @param {string} code - 源代码
 * @param {string} filename - 文件名
 * @param {object} options - 选项
 * @returns {object} 解析结果
 */
export function parseTS(code, filename = 'unknown', options = {}) {
  const parser = new TSXParser({ config: 'strict', ...options });
  return parser.parse(code, filename);
}

/**
 * AST工具函数
 */
export const ASTUtils = {
  // 导出traverse和generate供外部使用
  traverse,
  generate: generate.default,
  types: t,

  /**
   * 生成代码
   * 
   * @param {object} ast - AST对象
   * @param {object} options - 生成选项
   * @returns {object} 生成结果
   */
  generateCode(ast, options = {}) {
    const defaultOptions = {
      retainLines: false,
      compact: false,
      minified: false,
      sourceMaps: false,
      ...options
    };

    try {
      const result = generate.default(ast, defaultOptions);
      return {
        success: true,
        code: result.code,
        map: result.map
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: null,
        map: null
      };
    }
  },

  /**
   * 克隆AST节点
   * 
   * @param {object} node - AST节点
   * @returns {object} 克隆的节点
   */
  cloneNode(node) {
    return t.cloneNode(node);
  },

  /**
   * 深度克隆AST
   * 
   * @param {object} ast - AST对象
   * @returns {object} 克隆的AST
   */
  cloneAST(ast) {
    return t.cloneDeep(ast);
  }
};

export default TSXParser;