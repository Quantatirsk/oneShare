/**
 * AST 分析器
 * 
 * 提供AST代码分析功能，支持：
 * - 导入/导出分析
 * - 组件检测
 * - Hook使用分析
 * - 依赖关系分析
 * - 代码质量检查
 */

import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { TSXParser } from './parser.js';

/**
 * AST 分析器类
 */
export class ASTAnalyzer {
  constructor(options = {}) {
    this.options = {
      enableImportAnalysis: true,
      enableExportAnalysis: true,
      enableComponentAnalysis: true,
      enableHookAnalysis: true,
      enableDependencyAnalysis: true,
      enableQualityChecks: true,
      ...options
    };
    
    this.parser = new TSXParser();
  }

  /**
   * 分析代码
   * 
   * @param {string} code - 源代码
   * @param {string} filename - 文件名
   * @param {object} options - 分析选项
   * @returns {object} 分析结果
   */
  analyze(code, filename = 'unknown', options = {}) {
    // 合并选项
    const analysisOptions = { ...this.options, ...options };
    
    // 解析AST
    const parseResult = this.parser.parse(code, filename);
    if (!parseResult.success) {
      return {
        success: false,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        analysis: null
      };
    }

    const ast = parseResult.ast;
    const analysis = {
      filename,
      imports: [],
      exports: [],
      components: [],
      hooks: [],
      dependencies: [],
      issues: [],
      metrics: {}
    };

    try {
      // 执行各种分析
      if (analysisOptions.enableImportAnalysis) {
        this._analyzeImports(ast, analysis);
      }
      
      if (analysisOptions.enableExportAnalysis) {
        this._analyzeExports(ast, analysis);
      }
      
      if (analysisOptions.enableComponentAnalysis) {
        this._analyzeComponents(ast, analysis);
      }
      
      if (analysisOptions.enableHookAnalysis) {
        this._analyzeHooks(ast, analysis);
      }
      
      if (analysisOptions.enableDependencyAnalysis) {
        this._analyzeDependencies(ast, analysis);
      }
      
      if (analysisOptions.enableQualityChecks) {
        this._performQualityChecks(ast, analysis);
      }

      // 计算指标
      this._calculateMetrics(analysis);

      return {
        success: true,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        analysis
      };

    } catch (error) {
      return {
        success: false,
        errors: [{ type: 'analysis_error', message: error.message }],
        warnings: parseResult.warnings,
        analysis: null
      };
    }
  }

  /**
   * 分析导入语句
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果对象
   */
  _analyzeImports(ast, analysis) {
    traverse.default(ast, {
      ImportDeclaration(path) {
        const importInfo = {
          source: path.node.source.value,
          specifiers: [],
          type: 'import',
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column
        };

        // 分析导入说明符
        path.node.specifiers.forEach(spec => {
          if (t.isImportDefaultSpecifier(spec)) {
            importInfo.specifiers.push({
              type: 'default',
              local: spec.local.name,
              imported: 'default'
            });
          } else if (t.isImportSpecifier(spec)) {
            importInfo.specifiers.push({
              type: 'named',
              local: spec.local.name,
              imported: spec.imported.name
            });
          } else if (t.isImportNamespaceSpecifier(spec)) {
            importInfo.specifiers.push({
              type: 'namespace',
              local: spec.local.name,
              imported: '*'
            });
          }
        });

        analysis.imports.push(importInfo);
      },

      CallExpression(path) {
        // 分析动态导入
        if (t.isImport(path.node.callee)) {
          const importInfo = {
            source: path.node.arguments[0]?.value || 'dynamic',
            specifiers: [],
            type: 'dynamic_import',
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column
          };
          analysis.imports.push(importInfo);
        }
      }
    });
  }

  /**
   * 分析导出语句
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果对象
   */
  _analyzeExports(ast, analysis) {
    const self = this;
    traverse.default(ast, {
      ExportDefaultDeclaration(path) {
        const exportInfo = {
          type: 'default',
          name: self._getExportName(path.node.declaration),
          declaration: path.node.declaration.type,
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column
        };
        analysis.exports.push(exportInfo);
      },

      ExportNamedDeclaration(path) {
        if (path.node.declaration) {
          // 导出声明
          const exportInfo = {
            type: 'named_declaration',
            name: self._getDeclarationName(path.node.declaration),
            declaration: path.node.declaration.type,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column
          };
          analysis.exports.push(exportInfo);
        } else {
          // 导出说明符
          path.node.specifiers.forEach(spec => {
            const exportInfo = {
              type: 'named',
              name: spec.exported.name,
              local: spec.local.name,
              source: path.node.source?.value,
              line: path.node.loc?.start.line,
              column: path.node.loc?.start.column
            };
            analysis.exports.push(exportInfo);
          });
        }
      }
    });
  }

  /**
   * 分析React组件
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果对象
   */
  _analyzeComponents(ast, analysis) {
    const self = this;
    traverse.default(ast, {
      // 函数组件
      FunctionDeclaration(path) {
        if (self._isReactComponent(path.node)) {
          const componentInfo = {
            name: path.node.id.name,
            type: 'function_declaration',
            hasJSX: self._hasJSX(path),
            props: self._analyzeProps(path),
            hooks: [],
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column
          };
          
          // 分析Hook使用
          self._findHooksInComponent(path, componentInfo.hooks);
          
          analysis.components.push(componentInfo);
        }
      },

      // 箭头函数组件
      VariableDeclarator(path) {
        if (t.isArrowFunctionExpression(path.node.init) && 
            self._isReactComponent(path.node.init)) {
          const componentInfo = {
            name: path.node.id.name,
            type: 'arrow_function',
            hasJSX: self._hasJSX(path.get('init')),
            props: self._analyzeProps(path.get('init')),
            hooks: [],
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column
          };
          
          // 分析Hook使用
          self._findHooksInComponent(path.get('init'), componentInfo.hooks);
          
          analysis.components.push(componentInfo);
        }
      }
    });
  }

  /**
   * 分析React Hooks
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果对象
   */
  _analyzeHooks(ast, analysis) {
    const self = this;
    traverse.default(ast, {
      CallExpression(path) {
        if (self._isHookCall(path.node)) {
          const hookInfo = {
            name: self._getHookName(path.node),
            type: self._getHookType(path.node),
            arguments: path.node.arguments.length,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column
          };
          analysis.hooks.push(hookInfo);
        }
      }
    });
  }

  /**
   * 分析依赖关系
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果对象
   */
  _analyzeDependencies(ast, analysis) {
    const dependencies = new Set();
    
    // 从导入语句中提取依赖
    analysis.imports.forEach(imp => {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('/')) {
        // 外部依赖
        const packageName = this._extractPackageName(imp.source);
        dependencies.add(packageName);
      }
    });

    analysis.dependencies = Array.from(dependencies);
  }

  /**
   * 执行代码质量检查
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果对象
   */
  _performQualityChecks(ast, analysis) {
    const self = this;
    traverse.default(ast, {
      // 检查未使用的导入
      ImportDeclaration(path) {
        const binding = path.scope.getBinding(path.node.specifiers[0]?.local?.name);
        if (binding && !binding.referenced) {
          analysis.issues.push({
            type: 'unused_import',
            message: `未使用的导入: ${path.node.source.value}`,
            line: path.node.loc?.start.line,
            severity: 'warning'
          });
        }
      },

      // 检查组件命名
      FunctionDeclaration(path) {
        if (self._isReactComponent(path.node)) {
          const name = path.node.id.name;
          if (!/^[A-Z]/.test(name)) {
            analysis.issues.push({
              type: 'component_naming',
              message: `React组件应该以大写字母开头: ${name}`,
              line: path.node.loc?.start.line,
              severity: 'warning'
            });
          }
        }
      }
    });
  }

  /**
   * 计算代码指标
   * 
   * @private
   * @param {object} analysis - 分析结果对象
   */
  _calculateMetrics(analysis) {
    analysis.metrics = {
      totalImports: analysis.imports.length,
      totalExports: analysis.exports.length,
      totalComponents: analysis.components.length,
      totalHooks: analysis.hooks.length,
      totalDependencies: analysis.dependencies.length,
      totalIssues: analysis.issues.length,
      codeComplexity: this._calculateComplexity(analysis),
      hookComplexity: this._calculateHookComplexity(analysis)
    };
  }

  // 工具方法

  /**
   * 判断是否为React组件
   * 
   * @private
   * @param {object} node - AST节点
   * @returns {boolean} 是否为React组件
   */
  _isReactComponent(node) {
    // 简单的启发式检查
    const name = node.id?.name || node.key?.name;
    return name && /^[A-Z]/.test(name);
  }

  /**
   * 检查是否包含JSX
   * 
   * @private
   * @param {object} path - AST路径
   * @returns {boolean} 是否包含JSX
   */
  _hasJSX(path) {
    let hasJSX = false;
    path.traverse({
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
   * 分析组件Props
   * 
   * @private
   * @param {object} path - AST路径
   * @returns {array} Props列表
   */
  _analyzeProps(path) {
    const props = [];
    const params = path.node.params || [];
    
    if (params.length > 0) {
      const propsParam = params[0];
      if (t.isObjectPattern(propsParam)) {
        propsParam.properties.forEach(prop => {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            props.push({
              name: prop.key.name,
              type: 'destructured'
            });
          }
        });
      } else if (t.isIdentifier(propsParam)) {
        props.push({
          name: propsParam.name,
          type: 'object'
        });
      }
    }
    
    return props;
  }

  /**
   * 查找组件中的Hooks
   * 
   * @private
   * @param {object} path - AST路径
   * @param {array} hooks - Hooks数组
   */
  _findHooksInComponent(path, hooks) {
    const self = this;
    path.traverse({
      CallExpression(callPath) {
        if (self._isHookCall(callPath.node)) {
          hooks.push({
            name: self._getHookName(callPath.node),
            line: callPath.node.loc?.start.line
          });
        }
      }
    });
  }

  /**
   * 判断是否为Hook调用
   * 
   * @private
   * @param {object} node - AST节点
   * @returns {boolean} 是否为Hook调用
   */
  _isHookCall(node) {
    if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
      return node.callee.name.startsWith('use');
    }
    return false;
  }

  /**
   * 获取Hook名称
   * 
   * @private
   * @param {object} node - AST节点
   * @returns {string} Hook名称
   */
  _getHookName(node) {
    return node.callee.name;
  }

  /**
   * 获取Hook类型
   * 
   * @private
   * @param {object} node - AST节点
   * @returns {string} Hook类型
   */
  _getHookType(node) {
    const name = node.callee.name;
    if (name.startsWith('useState')) return 'state';
    if (name.startsWith('useEffect')) return 'effect';
    if (name.startsWith('useCallback')) return 'callback';
    if (name.startsWith('useMemo')) return 'memo';
    if (name.startsWith('useRef')) return 'ref';
    if (name.startsWith('useContext')) return 'context';
    return 'custom';
  }

  /**
   * 获取导出名称
   * 
   * @private
   * @param {object} declaration - 声明节点
   * @returns {string} 导出名称
   */
  _getExportName(declaration) {
    if (t.isIdentifier(declaration)) {
      return declaration.name;
    }
    if (t.isFunctionDeclaration(declaration)) {
      return declaration.id?.name || 'anonymous';
    }
    if (t.isClassDeclaration(declaration)) {
      return declaration.id?.name || 'anonymous';
    }
    return 'unknown';
  }

  /**
   * 获取声明名称
   * 
   * @private
   * @param {object} declaration - 声明节点
   * @returns {string} 声明名称
   */
  _getDeclarationName(declaration) {
    if (t.isFunctionDeclaration(declaration)) {
      return declaration.id?.name;
    }
    if (t.isClassDeclaration(declaration)) {
      return declaration.id?.name;
    }
    if (t.isVariableDeclaration(declaration)) {
      return declaration.declarations[0]?.id?.name;
    }
    return 'unknown';
  }

  /**
   * 提取包名
   * 
   * @private
   * @param {string} source - 导入源
   * @returns {string} 包名
   */
  _extractPackageName(source) {
    if (source.startsWith('@')) {
      // Scoped package
      const parts = source.split('/');
      return `${parts[0]}/${parts[1]}`;
    } else {
      // Regular package
      return source.split('/')[0];
    }
  }

  /**
   * 计算代码复杂度
   * 
   * @private
   * @param {object} analysis - 分析结果
   * @returns {number} 复杂度分数
   */
  _calculateComplexity(analysis) {
    let complexity = 0;
    complexity += analysis.imports.length * 0.5;
    complexity += analysis.exports.length * 0.5;
    complexity += analysis.components.length * 2;
    complexity += analysis.hooks.length * 1;
    return Math.round(complexity);
  }

  /**
   * 计算Hook复杂度
   * 
   * @private
   * @param {object} analysis - 分析结果
   * @returns {number} Hook复杂度分数
   */
  _calculateHookComplexity(analysis) {
    const hookWeights = {
      state: 1,
      effect: 2,
      callback: 1.5,
      memo: 1.5,
      ref: 0.5,
      context: 1,
      custom: 2
    };

    return analysis.hooks.reduce((total, hook) => {
      return total + (hookWeights[hook.type] || 1);
    }, 0);
  }
}

/**
 * 便捷函数：分析TSX代码
 * 
 * @param {string} code - 源代码
 * @param {string} filename - 文件名
 * @param {object} options - 选项
 * @returns {object} 分析结果
 */
export function analyzeTSX(code, filename = 'unknown', options = {}) {
  const analyzer = new ASTAnalyzer(options);
  return analyzer.analyze(code, filename);
}

/**
 * 便捷函数：快速分析导入
 * 
 * @param {string} code - 源代码
 * @returns {array} 导入列表
 */
export function quickAnalyzeImports(code) {
  const result = analyzeTSX(code, 'unknown', {
    enableImportAnalysis: true,
    enableExportAnalysis: false,
    enableComponentAnalysis: false,
    enableHookAnalysis: false,
    enableDependencyAnalysis: false,
    enableQualityChecks: false
  });
  
  return result.success ? result.analysis.imports : [];
}

export default ASTAnalyzer;