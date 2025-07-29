/**
 * 导入修复器
 * 
 * 专门处理导入相关的自动修复，支持：
 * - 自动导入检测
 * - 缺失导入补全
 * - 导入路径修复
 * - 导入优化和整理
 * - 动态导入建议
 */

import * as t from '@babel/types';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import { TSXParser } from './parser.js';
import { ASTAnalyzer } from './analyzer.js';

/**
 * 导入类型
 */
export const IMPORT_TYPES = {
  REACT: 'react',
  REACT_DOM: 'react-dom',
  REACT_HOOKS: 'react-hooks',
  COMPONENT: 'component',
  UTILITY: 'utility',
  TYPE: 'type',
  THIRD_PARTY: 'third-party',
  LOCAL: 'local'
};

/**
 * 常见库的导入模式
 */
export const COMMON_IMPORTS = {
  // React相关
  'useState': { from: 'react', type: 'named' },
  'useEffect': { from: 'react', type: 'named' },
  'useCallback': { from: 'react', type: 'named' },
  'useMemo': { from: 'react', type: 'named' },
  'useRef': { from: 'react', type: 'named' },
  'useContext': { from: 'react', type: 'named' },
  'useReducer': { from: 'react', type: 'named' },
  'createContext': { from: 'react', type: 'named' },
  'forwardRef': { from: 'react', type: 'named' },
  'memo': { from: 'react', type: 'named' },
  
  // React DOM
  'createRoot': { from: 'react-dom/client', type: 'named' },
  'hydrateRoot': { from: 'react-dom/client', type: 'named' },
  'render': { from: 'react-dom', type: 'named' },
  
  // 常见第三方库
  'classNames': { from: 'classnames', type: 'default' },
  'clsx': { from: 'clsx', type: 'default' },
  'axios': { from: 'axios', type: 'default' },
  'dayjs': { from: 'dayjs', type: 'default' },
  'lodash': { from: 'lodash', type: 'namespace', as: '_' },
  
  // Lucide图标 - 动态处理
  'Search': { from: 'lucide-react', type: 'named' },
  'Settings': { from: 'lucide-react', type: 'named' },
  'User': { from: 'lucide-react', type: 'named' },
  'Home': { from: 'lucide-react', type: 'named' },
  'Menu': { from: 'lucide-react', type: 'named' }
};

/**
 * 导入修复器类
 */
export class ImportFixer {
  constructor(options = {}) {
    this.options = {
      enableAutoImport: true,
      enableImportOptimization: true,
      enablePathFixing: true,
      preferNamedImports: true,
      sortImports: true,
      groupImports: true,
      removeUnusedImports: true,
      lucideIconsPath: '../data/lucide-icons.json',
      ...options
    };
    
    this.parser = new TSXParser();
    this.analyzer = new ASTAnalyzer();
    
    // 加载Lucide图标列表
    this._loadLucideIcons();
    
    // 导入缓存
    this.importCache = new Map();
    
    // 统计信息
    this.stats = {
      autoImportsAdded: 0,
      importsRemoved: 0,
      importsOptimized: 0,
      pathsFixed: 0
    };
  }

  /**
   * 修复导入问题
   * 
   * @param {string} code - 源代码
   * @param {string} filename - 文件名
   * @param {object} options - 选项
   * @returns {object} 修复结果
   */
  async fixImports(code, filename = 'unknown', options = {}) {
    const fixOptions = { ...this.options, ...options };
    
    try {
      // 解析代码
      const parseResult = this.parser.parse(code, filename);
      if (!parseResult.success) {
        return {
          success: false,
          originalCode: code,
          fixedCode: code,
          fixes: [],
          errors: parseResult.errors
        };
      }

      let ast = parseResult.ast;
      const fixes = [];

      // 分析现有导入
      const analysisResult = this.analyzer.analyze(code, filename);
      if (!analysisResult.success) {
        return {
          success: false,
          originalCode: code,
          fixedCode: code,
          fixes: [],
          errors: analysisResult.errors
        };
      }

      const analysis = analysisResult.analysis;

      // 1. 检测和添加缺失的导入
      if (fixOptions.enableAutoImport) {
        const autoImportFixes = this._addMissingImports(ast, analysis);
        fixes.push(...autoImportFixes);
      }

      // 2. 移除未使用的导入
      if (fixOptions.removeUnusedImports) {
        const removeUnusedFixes = this._removeUnusedImports(ast, analysis);
        fixes.push(...removeUnusedFixes);
      }

      // 3. 优化导入语句
      if (fixOptions.enableImportOptimization) {
        const optimizationFixes = this._optimizeImports(ast);
        fixes.push(...optimizationFixes);
      }

      // 4. 修复导入路径
      if (fixOptions.enablePathFixing) {
        const pathFixes = this._fixImportPaths(ast);
        fixes.push(...pathFixes);
      }

      // 5. 排序和分组导入
      if (fixOptions.sortImports || fixOptions.groupImports) {
        const sortFixes = this._sortAndGroupImports(ast, fixOptions);
        fixes.push(...sortFixes);
      }

      // 生成修复后的代码
      const result = generate.default(ast);
      
      return {
        success: true,
        originalCode: code,
        fixedCode: result.code,
        fixes,
        errors: [],
        stats: this._calculateStats(fixes)
      };

    } catch (error) {
      return {
        success: false,
        originalCode: code,
        fixedCode: code,
        fixes: [],
        errors: [{ type: 'import_fix_error', message: error.message }]
      };
    }
  }

  /**
   * 添加缺失的导入
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果
   * @returns {array} 修复列表
   */
  _addMissingImports(ast, analysis) {
    const fixes = [];
    const usedIdentifiers = this._findUsedIdentifiers(ast);
    const existingImports = this._getExistingImports(analysis);

    // 检查每个使用的标识符
    for (const identifier of usedIdentifiers) {
      if (!existingImports.has(identifier) && COMMON_IMPORTS[identifier]) {
        const importInfo = COMMON_IMPORTS[identifier];
        
        // 添加导入语句
        this._addImportStatement(ast, identifier, importInfo);
        
        fixes.push({
          type: 'missing_import_added',
          identifier,
          from: importInfo.from,
          importType: importInfo.type
        });
        
        this.stats.autoImportsAdded++;
      }
    }

    // 特殊处理：检查JSX使用但缺少React导入
    const hasJSX = this._hasJSXElements(ast);
    const hasReactImport = analysis.imports.some(imp => imp.source === 'react');
    
    if (hasJSX && !hasReactImport) {
      this._addReactImport(ast);
      fixes.push({
        type: 'react_import_added',
        identifier: 'React',
        from: 'react',
        importType: 'default'
      });
      this.stats.autoImportsAdded++;
    }

    return fixes;
  }

  /**
   * 移除未使用的导入
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果
   * @returns {array} 修复列表
   */
  _removeUnusedImports(ast, analysis) {
    const fixes = [];
    
    // 分析导入使用情况
    const importUsage = this._analyzeImportUsage(ast);
    
    traverse.default(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        let hasUsedSpecifiers = false;
        
        // 检查每个导入说明符的使用情况
        const specifiersToRemove = [];
        
        for (const specifier of path.node.specifiers) {
          const localName = specifier.local.name;
          
          if (!importUsage.has(localName)) {
            specifiersToRemove.push(specifier);
          } else {
            hasUsedSpecifiers = true;
          }
        }
        
        // 移除未使用的说明符
        if (specifiersToRemove.length > 0) {
          specifiersToRemove.forEach(spec => {
            const index = path.node.specifiers.indexOf(spec);
            if (index > -1) {
              path.node.specifiers.splice(index, 1);
              fixes.push({
                type: 'unused_specifier_removed',
                identifier: spec.local.name,
                from: source
              });
              this.stats.importsRemoved++;
            }
          });
        }
        
        // 如果整个导入语句都没有使用，移除它
        if (!hasUsedSpecifiers) {
          path.remove();
          fixes.push({
            type: 'unused_import_removed',
            from: source
          });
          this.stats.importsRemoved++;
        }
      }
    });

    return fixes;
  }

  /**
   * 优化导入语句
   * 
   * @private
   * @param {object} ast - AST对象
   * @returns {array} 修复列表
   */
  _optimizeImports(ast) {
    const fixes = [];
    
    // 合并同源导入
    const importsBySource = new Map();
    const importsToRemove = [];
    
    traverse.default(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        
        if (importsBySource.has(source)) {
          // 合并到现有导入
          const existing = importsBySource.get(source);
          existing.node.specifiers.push(...path.node.specifiers);
          importsToRemove.push(path);
          
          fixes.push({
            type: 'import_merged',
            from: source
          });
          this.stats.importsOptimized++;
        } else {
          importsBySource.set(source, path);
        }
      }
    });
    
    // 移除重复的导入
    importsToRemove.forEach(path => path.remove());

    return fixes;
  }

  /**
   * 修复导入路径
   * 
   * @private
   * @param {object} ast - AST对象
   * @returns {array} 修复列表
   */
  _fixImportPaths(ast) {
    const fixes = [];
    
    traverse.default(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        const fixedPath = this._suggestPathFix(source);
        
        if (fixedPath && fixedPath !== source) {
          path.node.source.value = fixedPath;
          fixes.push({
            type: 'import_path_fixed',
            originalPath: source,
            fixedPath: fixedPath
          });
          this.stats.pathsFixed++;
        }
      }
    });

    return fixes;
  }

  /**
   * 排序和分组导入
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} options - 选项
   * @returns {array} 修复列表
   */
  _sortAndGroupImports(ast, options) {
    const fixes = [];
    
    // 收集所有导入语句
    const imports = [];
    const importsToRemove = [];
    
    traverse.default(ast, {
      ImportDeclaration(path) {
        imports.push({
          node: path.node,
          path: path
        });
        importsToRemove.push(path);
      }
    });
    
    if (imports.length === 0) {
      return fixes;
    }
    
    // 移除原有导入
    importsToRemove.forEach(path => path.remove());
    
    // 分组和排序
    const groupedImports = this._groupImports(imports);
    const sortedImports = this._sortImportsWithinGroups(groupedImports);
    
    // 重新插入到AST开头
    const importNodes = sortedImports.flat().map(imp => imp.node);
    ast.body.unshift(...importNodes);
    
    fixes.push({
      type: 'imports_sorted_and_grouped',
      count: imports.length
    });

    return fixes;
  }

  /**
   * 查找使用的标识符
   * 
   * @private
   * @param {object} ast - AST对象
   * @returns {Set} 使用的标识符集合
   */
  _findUsedIdentifiers(ast) {
    const usedIdentifiers = new Set();
    
    traverse.default(ast, {
      Identifier(path) {
        if (path.isReferencedIdentifier()) {
          usedIdentifiers.add(path.node.name);
        }
      }
    });

    return usedIdentifiers;
  }

  /**
   * 获取现有导入
   * 
   * @private
   * @param {object} analysis - 分析结果
   * @returns {Set} 现有导入集合
   */
  _getExistingImports(analysis) {
    const existingImports = new Set();
    
    analysis.imports.forEach(imp => {
      imp.specifiers.forEach(spec => {
        existingImports.add(spec.local);
      });
    });

    return existingImports;
  }

  /**
   * 检查是否有JSX元素
   * 
   * @private
   * @param {object} ast - AST对象
   * @returns {boolean} 是否有JSX元素
   */
  _hasJSXElements(ast) {
    let hasJSX = false;
    
    traverse.default(ast, {
      JSXElement() {
        hasJSX = true;
      },
      JSXFragment() {
        hasJSX = true;
      }
    });

    return hasJSX;
  }

  /**
   * 添加导入语句
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {string} identifier - 标识符
   * @param {object} importInfo - 导入信息
   */
  _addImportStatement(ast, identifier, importInfo) {
    const astBody = ast.type === 'File' ? ast.program.body : ast.body;
    if (!ast || !astBody) {
      console.warn('AST or AST body is undefined, cannot add import statement');
      return;
    }
    
    let specifier;
    
    switch (importInfo.type) {
      case 'default':
        specifier = t.importDefaultSpecifier(t.identifier(identifier));
        break;
      case 'named':
        specifier = t.importSpecifier(t.identifier(identifier), t.identifier(identifier));
        break;
      case 'namespace':
        specifier = t.importNamespaceSpecifier(t.identifier(importInfo.as || identifier));
        break;
      default:
        specifier = t.importSpecifier(t.identifier(identifier), t.identifier(identifier));
    }
    
    const importDeclaration = t.importDeclaration([specifier], t.stringLiteral(importInfo.from));
    astBody.unshift(importDeclaration);
  }

  /**
   * 添加React导入
   * 
   * @private
   * @param {object} ast - AST对象
   */
  _addReactImport(ast) {
    const astBody = ast.type === 'File' ? ast.program.body : ast.body;
    if (!ast || !astBody) {
      console.warn('AST or AST body is undefined, cannot add React import');
      return false;
    }
    
    // 检查是否已经有React导入
    let hasReactImport = false;
    traverse.default(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === 'react') {
          hasReactImport = true;
        }
      }
    });
    
    if (!hasReactImport) {
      const importDeclaration = t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier('React'))],
        t.stringLiteral('react')
      );
      astBody.unshift(importDeclaration);
      return true;
    }
    
    return false;
  }

  /**
   * 分析导入使用情况
   * 
   * @private
   * @param {object} ast - AST对象
   * @returns {Set} 使用的导入集合
   */
  _analyzeImportUsage(ast) {
    const usedImports = new Set();
    
    traverse.default(ast, {
      Identifier(path) {
        if (path.isReferencedIdentifier() && !path.isBindingIdentifier()) {
          usedImports.add(path.node.name);
        }
      }
    });

    return usedImports;
  }

  /**
   * 建议路径修复
   * 
   * @private
   * @param {string} source - 源路径
   * @returns {string|null} 修复后的路径
   */
  _suggestPathFix(source) {
    // 常见路径修复规则
    const pathFixes = {
      'react-dom': 'react-dom',
      'react-router': 'react-router-dom',
      'styled-components': 'styled-components',
      '@types/react': '@types/react'
    };

    return pathFixes[source] || null;
  }

  /**
   * 分组导入
   * 
   * @private
   * @param {array} imports - 导入列表
   * @returns {object} 分组后的导入
   */
  _groupImports(imports) {
    const groups = {
      builtin: [],
      external: [],
      internal: [],
      relative: []
    };

    imports.forEach(imp => {
      const source = imp.node.source.value;
      
      if (source.startsWith('./') || source.startsWith('../')) {
        groups.relative.push(imp);
      } else if (source.startsWith('@/') || source.startsWith('~/')) {
        groups.internal.push(imp);
      } else {
        groups.external.push(imp);
      }
    });

    return groups;
  }

  /**
   * 在组内排序导入
   * 
   * @private
   * @param {object} groupedImports - 分组的导入
   * @returns {array} 排序后的导入
   */
  _sortImportsWithinGroups(groupedImports) {
    const sortFunction = (a, b) => a.node.source.value.localeCompare(b.node.source.value);
    
    return [
      groupedImports.builtin.sort(sortFunction),
      groupedImports.external.sort(sortFunction),
      groupedImports.internal.sort(sortFunction),
      groupedImports.relative.sort(sortFunction)
    ].filter(group => group.length > 0);
  }

  /**
   * 加载Lucide图标列表
   * 
   * @private
   */
  _loadLucideIcons() {
    try {
      // 这里应该从实际的lucide-icons.json文件加载
      // 暂时使用一些常见图标作为示例
      const commonLucideIcons = [
        'search', 'settings', 'user', 'home', 'menu', 'close', 'check',
        'plus', 'minus', 'edit', 'delete', 'save', 'cancel', 'refresh'
      ];
      
      // 将kebab-case转换为PascalCase并添加到COMMON_IMPORTS
      commonLucideIcons.forEach(iconName => {
        const pascalCase = this._kebabToPascalCase(iconName);
        COMMON_IMPORTS[pascalCase] = {
          from: 'lucide-react',
          type: 'named'
        };
      });
      
    } catch (error) {
      console.warn('Failed to load Lucide icons:', error.message);
    }
  }

  /**
   * kebab-case转PascalCase
   * 
   * @private
   * @param {string} str - kebab-case字符串
   * @returns {string} PascalCase字符串
   */
  _kebabToPascalCase(str) {
    return str.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
  }

  /**
   * 计算统计信息
   * 
   * @private
   * @param {array} fixes - 修复列表
   * @returns {object} 统计信息
   */
  _calculateStats(fixes) {
    const stats = {
      total: fixes.length,
      byType: {}
    };

    fixes.forEach(fix => {
      stats.byType[fix.type] = (stats.byType[fix.type] || 0) + 1;
    });

    return stats;
  }

  /**
   * 获取全局统计信息
   * 
   * @returns {object} 全局统计信息
   */
  getGlobalStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      autoImportsAdded: 0,
      importsRemoved: 0,
      importsOptimized: 0,
      pathsFixed: 0
    };
  }
}

/**
 * 便捷函数：修复导入
 * 
 * @param {string} code - 源代码
 * @param {string} filename - 文件名
 * @param {object} options - 选项
 * @returns {Promise<object>} 修复结果
 */
export async function fixImports(code, filename = 'unknown', options = {}) {
  const fixer = new ImportFixer(options);
  return await fixer.fixImports(code, filename);
}

export default ImportFixer;