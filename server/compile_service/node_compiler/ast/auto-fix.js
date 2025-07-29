/**
 * 自动修复系统
 * 
 * 基于AST的主动式代码修复，支持：
 * - 自动导入补全
 * - 语法错误修复
 * - React组件规范化
 * - Hook使用修复
 * - TypeScript类型修复
 * - 代码风格统一
 */

import * as t from '@babel/types';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TSXParser } from './parser.js';
import { ASTAnalyzer } from './analyzer.js';


/**
 * 修复规则类型
 */
export const FIX_TYPES = {
  // 导入相关
  MISSING_IMPORT: 'missing_import',
  UNUSED_IMPORT: 'unused_import',
  WRONG_IMPORT_PATH: 'wrong_import_path',
  
  // React相关
  MISSING_REACT_IMPORT: 'missing_react_import',
  COMPONENT_NAMING: 'component_naming',
  HOOK_RULES: 'hook_rules',
  PROP_TYPES: 'prop_types',
  
  // TypeScript相关
  TYPE_ANNOTATION: 'type_annotation',
  INTERFACE_NAMING: 'interface_naming',
  
  // 语法相关
  SEMICOLON: 'semicolon',
  QUOTES: 'quotes',
  TRAILING_COMMA: 'trailing_comma',
  
  // JSX相关
  JSX_FRAGMENT: 'jsx_fragment',
  JSX_KEY_PROP: 'jsx_key_prop',
  
  // 常见错误
  UNDEFINED_VARIABLE: 'undefined_variable',
  UNREACHABLE_CODE: 'unreachable_code',
  
  // Lucide图标相关
  MISSING_LUCIDE_IMPORT: 'missing_lucide_import'
};

/**
 * 修复优先级
 */
export const FIX_PRIORITY = {
  CRITICAL: 0,    // 阻止编译的错误
  HIGH: 1,        // 运行时错误
  MEDIUM: 2,      // 最佳实践违反
  LOW: 3          // 代码风格
};

/**
 * AST自动修复器
 */
export class ASTAutoFixer {
  constructor(options = {}) {
    this.options = {
      enableReactFixes: true,
      enableTypescriptFixes: true,
      enableStyleFixes: true,
      enableImportFixes: true,
      maxFixAttempts: 5,
      preserveFormatting: true,
      ...options
    };
    
    this.parser = new TSXParser();
    this.analyzer = new ASTAnalyzer();
    
    // 修复统计
    this.stats = {
      totalFixes: 0,
      fixesByType: {},
      successfulFixes: 0,
      failedFixes: 0
    };
    
    // 修复规则注册表
    this.fixRules = new Map();
    
    // 加载Lucide图标列表
    this.lucideIcons = this._loadLucideIcons();
    
    this._registerDefaultRules();
  }

  /**
   * 自动修复代码
   * 
   * @param {string} code - 源代码
   * @param {string} filename - 文件名
   * @param {object} options - 修复选项
   * @returns {object} 修复结果
   */
  async autoFix(code, filename = 'unknown', options = {}) {
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
          errors: parseResult.errors,
          cannotFix: true
        };
      }

      let ast = parseResult.ast;
      let currentCode = code;
      const appliedFixes = [];
      
      // 多轮修复 - 增强版本
      const roundDetails = []; // 记录每轮详情
      let consecutiveNoFix = 0; // 连续无修复计数
      
      for (let attempt = 0; attempt < fixOptions.maxFixAttempts; attempt++) {
        const roundStart = Date.now();
        const roundInfo = {
          round: attempt + 1,
          startTime: roundStart,
          issuesFound: 0,
          fixesAttempted: 0,
          fixesSuccessful: 0,
          fixesFailed: 0,
          codeChanged: false,
          error: null
        };
        
        try {
          // 分析代码问题
          const analysisResult = this.analyzer.analyze(currentCode, filename);
          if (!analysisResult.success) {
            roundInfo.error = 'Analysis failed';
            roundDetails.push(roundInfo);
            break;
          }

          // 查找需要修复的问题
          const issues = this._findFixableIssues(ast, analysisResult.analysis);
          roundInfo.issuesFound = issues.length;
          
          if (issues.length === 0) {
            consecutiveNoFix++;
            roundInfo.error = 'No issues found';
            roundDetails.push(roundInfo);
            break; // 没有更多问题需要修复
          } else {
            consecutiveNoFix = 0; // 重置计数
          }

          // 按优先级排序并应用智能分组
          const groupedIssues = this._groupAndPrioritizeIssues(issues, attempt);
          
          // 应用修复 - 使用智能策略
          let fixApplied = false;
          let fixesInThisRound = 0;
          const maxFixesThisRound = this._calculateMaxFixesForRound(attempt, groupedIssues);
          
          for (const issue of groupedIssues) {
            if (fixesInThisRound >= maxFixesThisRound) {
              break;
            }
            
            roundInfo.fixesAttempted++;
            
            
            // 评估修复风险
            const riskAssessment = this._assessFixRisk(issue, currentCode, appliedFixes);
            if (riskAssessment.isHighRisk && attempt < 2) {
              // 前两轮跳过高风险修复
              continue;
            }
            
            
            const fixResult = this._applyFix(ast, issue);
            if (fixResult.success) {
              // 质量验证
              const qualityCheck = this._validateFixQuality(issue, fixResult, currentCode);
              
              appliedFixes.push({
                ...issue,
                applied: true,
                newCode: fixResult.newCode,
                quality: qualityCheck,
                round: attempt + 1,
                riskLevel: riskAssessment.riskLevel,
                executionTime: Date.now() - roundStart
              });
              
              fixApplied = true;
              fixesInThisRound++;
              roundInfo.fixesSuccessful++;
              roundInfo.codeChanged = true;
              
              this.stats.totalFixes++;
              this.stats.successfulFixes++;
              this.stats.fixesByType[issue.type] = 
                (this.stats.fixesByType[issue.type] || 0) + 1;
              
            } else {
              appliedFixes.push({
                ...issue,
                applied: false,
                error: fixResult.error,
                round: attempt + 1,
                riskLevel: riskAssessment.riskLevel,
                executionTime: Date.now() - roundStart
              });
              roundInfo.fixesFailed++;
              this.stats.failedFixes++;
            }
          }
          
          // 如果这轮有修复应用，重新生成代码并验证
          if (fixApplied) {
            const generateResult = generate.default(ast);
            const newCode = generateResult.code;
            
            // 代码质量检查
            const codeQuality = this._assessCodeQuality(newCode, currentCode);
            roundInfo.codeQuality = codeQuality;
            
            currentCode = newCode;
          }

          if (!fixApplied) {
            consecutiveNoFix++;
            if (consecutiveNoFix >= 2) {
              roundInfo.error = 'Consecutive rounds without fixes';
              roundDetails.push(roundInfo);
              break; // 连续两轮无修复，避免无限循环
            }
          }

          // 重新解析修复后的代码
          const newParseResult = this.parser.parse(currentCode, filename);
          if (!newParseResult.success) {
            // 修复导致了新的错误，智能回滚
            const rollbackCode = this._smartRollback(appliedFixes, code);
            currentCode = rollbackCode;
            roundInfo.error = 'Parse failed after fixes, rolled back';
            roundInfo.codeChanged = true;
            roundDetails.push(roundInfo);
            break;
          }
          ast = newParseResult.ast;
          
        } catch (roundError) {
          roundInfo.error = roundError.message;
        }
        
        roundInfo.endTime = Date.now();
        roundInfo.duration = roundInfo.endTime - roundInfo.startTime;
        roundDetails.push(roundInfo);
      }

      // 生成增强的统计报告
      const enhancedStats = this._generateEnhancedStats(appliedFixes, roundDetails);
      
      return {
        success: true,
        originalCode: code,
        fixedCode: currentCode,
        fixes: appliedFixes,
        errors: [],
        cannotFix: false,
        stats: enhancedStats,
        rounds: roundDetails,
        performance: this._getPerformanceMetrics(roundDetails),
        quality: this._getOverallQuality(appliedFixes)
      };

    } catch (error) {
      return {
        success: false,
        originalCode: code,
        fixedCode: code,
        fixes: [],
        errors: [{ type: 'autofix_error', message: error.message }],
        cannotFix: true
      };
    }
  }

  /**
   * 查找可修复的问题
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果
   * @returns {array} 问题列表
   */
  _findFixableIssues(ast, analysis) {
    const issues = [];

    // React相关问题
    if (this.options.enableReactFixes) {
      issues.push(...this._findReactIssues(ast, analysis));
    }

    // TypeScript相关问题
    if (this.options.enableTypescriptFixes) {
      issues.push(...this._findTypescriptIssues(ast, analysis));
    }

    // 导入相关问题
    if (this.options.enableImportFixes) {
      issues.push(...this._findImportIssues(ast, analysis));
    }

    // 代码风格问题
    if (this.options.enableStyleFixes) {
      issues.push(...this._findStyleIssues(ast, analysis));
    }

    return issues;
  }

  /**
   * 查找React相关问题
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果
   * @returns {array} React问题列表
   */
  _findReactIssues(ast, analysis) {
    const issues = [];

    // 检查组件命名
    analysis.components.forEach(component => {
      if (!/^[A-Z]/.test(component.name)) {
        issues.push({
          type: FIX_TYPES.COMPONENT_NAMING,
          priority: FIX_PRIORITY.MEDIUM,
          message: `组件名应该以大写字母开头: ${component.name}`,
          location: { line: component.line, column: component.column },
          data: { componentName: component.name, suggestedName: this._capitalizeFirst(component.name) }
        });
      }
    });

    // 检查missing React import
    const hasJSX = analysis.components.some(comp => comp.hasJSX);
    const hasReactImport = analysis.imports.some(imp => imp.source === 'react');
    
    // 检查是否使用了React命名空间（如React.FC）
    let usesReactNamespace = false;
    let reactNamespaceUsages = [];
    
    traverse.default(ast, {
      MemberExpression(path) {
        if (path.node.object.type === 'Identifier' && path.node.object.name === 'React') {
          usesReactNamespace = true;
          reactNamespaceUsages.push(path.node.property.name);
        }
      },
      // 也检查TSTypeReference中的React使用（如React.FC<Props>）
      TSTypeReference(path) {
        if (path.node.typeName.type === 'TSQualifiedName' && 
            path.node.typeName.left.type === 'Identifier' && 
            path.node.typeName.left.name === 'React') {
          usesReactNamespace = true;
          reactNamespaceUsages.push(path.node.typeName.right.name);
        }
      }
    });
    
    if ((hasJSX || usesReactNamespace) && !hasReactImport) {
      const usageDetails = reactNamespaceUsages.length > 0 
        ? ` (使用了: ${reactNamespaceUsages.join(', ')})` 
        : '';
      
      issues.push({
        type: FIX_TYPES.MISSING_REACT_IMPORT,
        priority: FIX_PRIORITY.CRITICAL,
        message: usesReactNamespace 
          ? `使用React命名空间但缺少React导入${usageDetails}` 
          : '使用JSX但缺少React导入',
        location: { line: 1, column: 1 },
        data: { 
          needsDefault: true,
          needsNamespace: usesReactNamespace,
          usages: reactNamespaceUsages
        }
      });
    }

    // 检查Hook规则违反
    this._checkHookRules(ast, issues);

    return issues;
  }

  /**
   * 查找TypeScript相关问题
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果
   * @returns {array} TypeScript问题列表
   */
  _findTypescriptIssues(ast, analysis) {
    const issues = [];

    // 检查接口命名
    traverse.default(ast, {
      TSInterfaceDeclaration(path) {
        const name = path.node.id.name;
        if (!/^I[A-Z]/.test(name) && !/Props$/.test(name) && !/Config$/.test(name)) {
          issues.push({
            type: FIX_TYPES.INTERFACE_NAMING,
            priority: FIX_PRIORITY.LOW,
            message: `接口命名建议: ${name}`,
            location: { line: path.node.loc?.start.line, column: path.node.loc?.start.column },
            data: { currentName: name, suggestedName: `I${name}` }
          });
        }
      }
    });

    return issues;
  }

  /**
   * 查找导入相关问题
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果
   * @returns {array} 导入问题列表
   */
  _findImportIssues(ast, analysis) {
    const issues = [];

    // 检查未使用的导入
    analysis.issues.forEach(issue => {
      if (issue.type === 'unused_import') {
        issues.push({
          type: FIX_TYPES.UNUSED_IMPORT,
          priority: FIX_PRIORITY.LOW,
          message: issue.message,
          location: { line: issue.line },
          data: { importSource: this._extractImportSource(issue.message) }
        });
      }
    });

    // 检查未定义的变量
    this._checkUndefinedVariables(ast, issues);
    
    // 检查缺失的Lucide图标导入
    this._checkMissingLucideImports(ast, issues);

    return issues;
  }

  /**
   * 查找代码风格问题
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} analysis - 分析结果
   * @returns {array} 风格问题列表
   */
  _findStyleIssues(ast, analysis) {
    const issues = [];
    const self = this;

    // 检查JSX Fragment使用
    traverse.default(ast, {
      JSXElement(path) {
        if (path.node.openingElement.name.name === 'div' && 
            self._isWrapperDiv(path)) {
          issues.push({
            type: FIX_TYPES.JSX_FRAGMENT,
            priority: FIX_PRIORITY.LOW,
            message: '可以使用React.Fragment代替包装div',
            location: { line: path.node.loc?.start.line, column: path.node.loc?.start.column },
            data: { elementPath: path }
          });
        }
      }
    });

    return issues;
  }

  /**
   * 应用修复
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {object} issue - 问题对象
   * @returns {object} 修复结果
   */
  _applyFix(ast, issue) {
    try {
      // 验证AST - 处理Babel File AST结构
      if (!this._validateAst(ast)) {
        return {
          success: false,
          error: 'AST or AST body is undefined'
        };
      }

      const fixRule = this.fixRules.get(issue.type);
      if (!fixRule) {
        return {
          success: false,
          error: `No fix rule found for issue type: ${issue.type}`
        };
      }

      // 应用修复规则 - 直接在原始AST上操作
      const result = fixRule(ast, issue);
      
      if (result.success) {
        // 验证修复后的AST
        try {
          const newCode = generate.default(ast).code;
          return {
            success: true,
            newCode: newCode
          };
        } catch (generateError) {
          return {
            success: false,
            error: `Code generation failed: ${generateError.message}`
          };
        }
      } else {
        return {
          success: false,
          error: result.error || 'Fix rule failed'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 注册默认修复规则
   * 
   * @private
   */
  _registerDefaultRules() {
    // React导入修复
    this.fixRules.set(FIX_TYPES.MISSING_REACT_IMPORT, (ast, issue) => {
      try {
        if (!this._validateAst(ast)) {
          return { success: false, error: 'AST or AST body is undefined' };
        }
        
        const astBody = this._getAstBody(ast);
        const { needsDefault = true, needsNamespace = true } = issue.data || {};
        
        // 检查是否已经有React导入（防止重复）
        let existingReactImport = null;
        traverse.default(ast, {
          ImportDeclaration(path) {
            if (path.node.source.value === 'react') {
              existingReactImport = path;
            }
          }
        });
        
        if (existingReactImport) {
          // 如果已经有React导入，检查是否需要添加默认导入
          const hasDefaultImport = existingReactImport.node.specifiers.some(spec => 
            spec.type === 'ImportDefaultSpecifier'
          );
          
          if (!hasDefaultImport && (needsDefault || needsNamespace)) {
            // 添加React默认导入到现有导入语句
            const defaultSpecifier = t.importDefaultSpecifier(t.identifier('React'));
            existingReactImport.node.specifiers.unshift(defaultSpecifier);
          }
          
          return { success: true };
        }
        
        // 创建新的React导入
        if (needsDefault || needsNamespace) {
          const importDeclaration = t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier('React'))],
            t.stringLiteral('react')
          );

          // 在文件开头添加导入
          astBody.unshift(importDeclaration);
        }
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 组件命名修复
    this.fixRules.set(FIX_TYPES.COMPONENT_NAMING, (ast, issue) => {
      try {
        const { componentName, suggestedName } = issue.data;
        
        traverse.default(ast, {
          FunctionDeclaration(path) {
            if (path.node.id && path.node.id.name === componentName) {
              path.node.id.name = suggestedName;
            }
          },
          VariableDeclarator(path) {
            if (path.node.id && path.node.id.name === componentName) {
              path.node.id.name = suggestedName;
            }
          }
        });
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 未使用导入移除
    this.fixRules.set(FIX_TYPES.UNUSED_IMPORT, (ast, issue) => {
      try {
        if (!this._validateAst(ast)) {
          return { success: false, error: 'AST or AST body is undefined' };
        }
        
        const importSource = issue.data.importSource;
        
        // 特殊处理：对于React导入，检查是否有React命名空间使用
        if (importSource === 'react') {
          let hasReactNamespaceUsage = false;
          
          traverse.default(ast, {
            MemberExpression(path) {
              if (path.node.object.type === 'Identifier' && path.node.object.name === 'React') {
                hasReactNamespaceUsage = true;
              }
            },
            TSTypeReference(path) {
              if (path.node.typeName.type === 'TSQualifiedName' && 
                  path.node.typeName.left.type === 'Identifier' && 
                  path.node.typeName.left.name === 'React') {
                hasReactNamespaceUsage = true;
              }
            }
          });
          
          if (hasReactNamespaceUsage) {
            return { success: false, error: 'React import is used in namespace context' };
          }
        }
        
        traverse.default(ast, {
          ImportDeclaration(path) {
            if (path.node.source.value === importSource) {
              path.remove();
            }
          }
        });
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 未定义变量修复 - 添加常见库的导入
    this.fixRules.set(FIX_TYPES.UNDEFINED_VARIABLE, (ast, issue) => {
      try {
        if (!this._validateAst(ast)) {
          return { success: false, error: 'AST or AST body is undefined' };
        }
        
        const astBody = this._getAstBody(ast);
        const variableName = issue.data.variableName;
        
        // 常见React hooks和其他库的导入映射
        const commonImports = {
          'useState': { from: 'react', type: 'named' },
          'useEffect': { from: 'react', type: 'named' },
          'useCallback': { from: 'react', type: 'named' },
          'useMemo': { from: 'react', type: 'named' },
          'useRef': { from: 'react', type: 'named' },
          'useContext': { from: 'react', type: 'named' },
          'useReducer': { from: 'react', type: 'named' },
          'createContext': { from: 'react', type: 'named' },
          'forwardRef': { from: 'react', type: 'named' },
          'memo': { from: 'react', type: 'named' }
        };
        
        const importInfo = commonImports[variableName];
        if (!importInfo) {
          return { success: false, error: `No known import for variable: ${variableName}` };
        }
        
        // 检查是否已经从该源导入了内容
        let existingImport = null;
        traverse.default(ast, {
          ImportDeclaration(path) {
            if (path.node.source.value === importInfo.from) {
              existingImport = path;
            }
          }
        });
        
        if (existingImport) {
          // 检查是否已经存在该导入
          const alreadyImported = existingImport.node.specifiers.some(spec => 
            spec.type === 'ImportSpecifier' && spec.imported.name === variableName
          );
          
          if (!alreadyImported) {
            // 添加到现有导入
            const newSpecifier = t.importSpecifier(
              t.identifier(variableName), 
              t.identifier(variableName)
            );
            existingImport.node.specifiers.push(newSpecifier);
          }
        } else {
          // 创建新的导入语句
          let specifier;
          if (importInfo.type === 'named') {
            specifier = t.importSpecifier(t.identifier(variableName), t.identifier(variableName));
          } else if (importInfo.type === 'default') {
            specifier = t.importDefaultSpecifier(t.identifier(variableName));
          }
          
          const importDeclaration = t.importDeclaration([specifier], t.stringLiteral(importInfo.from));
          astBody.unshift(importDeclaration);
        }
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // JSX Fragment修复
    this.fixRules.set(FIX_TYPES.JSX_FRAGMENT, (ast, issue) => {
      try {
        if (!this._validateAst(ast)) {
          return { success: false, error: 'AST or AST body is undefined' };
        }
        
        const elementPath = issue.data.elementPath;
        
        if (elementPath && elementPath.node) {
          // 将div替换为React.Fragment
          elementPath.node.openingElement.name = t.jsxMemberExpression(
            t.jsxIdentifier('React'),
            t.jsxIdentifier('Fragment')
          );
          elementPath.node.closingElement.name = t.jsxMemberExpression(
            t.jsxIdentifier('React'),
            t.jsxIdentifier('Fragment')
          );
          
          // 移除div的属性
          elementPath.node.openingElement.attributes = [];
        }
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 缺失Lucide图标导入修复
    this.fixRules.set(FIX_TYPES.MISSING_LUCIDE_IMPORT, (ast, issue) => {
      try {
        if (!this._validateAst(ast)) {
          return { success: false, error: 'AST or AST body is undefined' };
        }
        
        const astBody = this._getAstBody(ast);
        const missingIcons = issue.data.missingIcons;
        if (!missingIcons || missingIcons.length === 0) {
          return { success: false, error: 'No missing icons specified' };
        }
        
        // 检查是否已经有lucide-react的导入
        let existingImport = null;
        traverse.default(ast, {
          ImportDeclaration(path) {
            if (path.node.source.value === 'lucide-react') {
              existingImport = path;
            }
          }
        });
        
        if (existingImport) {
          // 添加到现有导入，去重
          missingIcons.forEach(iconName => {
            const alreadyImported = existingImport.node.specifiers.some(spec => 
              spec.type === 'ImportSpecifier' && spec.imported.name === iconName
            );
            
            if (!alreadyImported) {
              const newSpecifier = t.importSpecifier(
                t.identifier(iconName), 
                t.identifier(iconName)
              );
              existingImport.node.specifiers.push(newSpecifier);
            }
          });
        } else {
          // 创建新的导入语句
          const specifiers = missingIcons.map(iconName => 
            t.importSpecifier(t.identifier(iconName), t.identifier(iconName))
          );
          
          const importDeclaration = t.importDeclaration(specifiers, t.stringLiteral('lucide-react'));
          astBody.unshift(importDeclaration);
        }
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * 检查Hook规则
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {array} issues - 问题数组
   */
  _checkHookRules(ast, issues) {
    // 检查Hook是否在组件顶层调用
    const self = this;
    traverse.default(ast, {
      FunctionDeclaration(path) {
        if (self._isReactComponent(path.node)) {
          self._validateHooksInFunction(path, issues);
        }
      }
    });
  }

  /**
   * 检查未定义变量
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {array} issues - 问题数组
   */
  _checkUndefinedVariables(ast, issues) {
    const self = this;
    const undefinedVariables = new Set(); // 去重
    
    // 收集所有定义的类型名称（interface, type alias等）
    const definedTypes = new Set();
    traverse.default(ast, {
      TSInterfaceDeclaration(path) {
        definedTypes.add(path.node.id.name);
      },
      TSTypeAliasDeclaration(path) {
        definedTypes.add(path.node.id.name);
      }
    });
    
    traverse.default(ast, {
      Identifier(path) {
        if (path.isReferencedIdentifier()) {
          const binding = path.scope.getBinding(path.node.name);
          const variableName = path.node.name;
          
          if (!binding && 
              !self._isBuiltinIdentifier(variableName) && 
              !definedTypes.has(variableName) && // 排除已定义的类型
              !undefinedVariables.has(variableName)) {
            
            // 特殊处理：跳过TypeScript类型注解中的标识符
            if (self._isInTypeAnnotation(path)) {
              return;
            }
            
            undefinedVariables.add(variableName);
            
            issues.push({
              type: FIX_TYPES.UNDEFINED_VARIABLE,
              priority: FIX_PRIORITY.HIGH,
              message: `未定义的变量: ${variableName}`,
              location: { line: path.node.loc?.start.line, column: path.node.loc?.start.column },
              data: { variableName }
            });
          }
        }
      },
      
      // 额外检查调用表达式中的Hook
      CallExpression(path) {
        if (path.node.callee.type === 'Identifier') {
          const functionName = path.node.callee.name;
          
          
          // 检查是否是React Hook或其他函数调用
          const needsCheck = functionName.startsWith('use') && functionName.length > 3;
          
          if (needsCheck || functionName === 'ImageIcon') {
            const binding = path.scope.getBinding(functionName);
            if (!binding && !self._isBuiltinIdentifier(functionName)) {
              if (!undefinedVariables.has(functionName)) {
                undefinedVariables.add(functionName);
                
                
                issues.push({
                  type: FIX_TYPES.UNDEFINED_VARIABLE,
                  priority: FIX_PRIORITY.HIGH,
                  message: `未定义的React Hook: ${functionName}`,
                  location: { line: path.node.loc?.start.line, column: path.node.loc?.start.column },
                  data: { variableName: functionName }
                });
              }
            }
          }
        }
      }
    });
  }

  // 工具方法

  /**
   * 获取AST的body部分
   * 
   * @private
   * @param {object} ast - AST对象
   * @returns {array|null} AST body数组
   */
  _getAstBody(ast) {
    if (!ast) return null;
    return ast.type === 'File' ? ast.program.body : ast.body;
  }

  /**
   * 验证AST结构
   * 
   * @private
   * @param {object} ast - AST对象
   * @returns {boolean} AST是否有效
   */
  _validateAst(ast) {
    const astBody = this._getAstBody(ast);
    return !!(ast && astBody);
  }

  /**
   * 首字母大写
   * 
   * @private
   * @param {string} str - 字符串
   * @returns {string} 首字母大写的字符串
   */
  _capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 是否为React组件
   * 
   * @private
   * @param {object} node - AST节点
   * @returns {boolean} 是否为React组件
   */
  _isReactComponent(node) {
    const name = node.id?.name;
    return name && /^[A-Z]/.test(name);
  }

  /**
   * 是否为包装div
   * 
   * @private
   * @param {object} path - AST路径
   * @returns {boolean} 是否为包装div
   */
  _isWrapperDiv(path) {
    // 简单检查：如果div没有属性且只有一个子元素，可能是包装div
    return path.node.openingElement.attributes.length === 0 &&
           path.node.children.length === 1;
  }

  /**
   * 是否为内置标识符
   * 
   * @private
   * @param {string} name - 标识符名称
   * @returns {boolean} 是否为内置标识符
   */
  _isBuiltinIdentifier(name) {
    const builtins = [
      // 全局对象
      'console', 'window', 'document', 'global', 'process',
      'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean',
      'Date', 'RegExp', 'Error', 'JSON', 'Math',
      
      // Web APIs
      'fetch', 'URL', 'URLSearchParams', 'FormData', 'Headers',
      'Request', 'Response', 'AbortController', 'AbortSignal',
      'localStorage', 'sessionStorage', 'location', 'history',
      'navigator', 'screen', 'performance',
      
      // DOM APIs (常见的，可能在服务端渲染中使用)
      'Element', 'HTMLElement', 'Event', 'EventTarget',
      
      // 常见的非React函数
      'alert', 'confirm', 'prompt', 'open', 'close',
      'requestAnimationFrame', 'cancelAnimationFrame',
      
      // Node.js 特有
      'require', 'module', 'exports', '__dirname', '__filename',
      
      // 可能的工具函数（避免误判）
      'debounce', 'throttle', 'clsx', 'classNames'
    ];
    return builtins.includes(name);
  }

  /**
   * 检查标识符是否在TypeScript类型注解中
   * 
   * @private
   * @param {object} path - AST路径
   * @returns {boolean} 是否在类型注解中
   */
  _isInTypeAnnotation(path) {
    let current = path.parent;
    while (current) {
      // 检查是否在TypeScript类型相关的节点中
      if (current.type && (
          current.type.startsWith('TS') || 
          current.type === 'TypeAnnotation' ||
          current.type === 'TypeParameter' ||
          current.type === 'GenericTypeAnnotation'
        )) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 检查缺失的Lucide图标导入
   * 
   * @private
   * @param {object} ast - AST对象
   * @param {array} issues - 问题数组
   */
  _checkMissingLucideImports(ast, issues) {
    const self = this;
    const usedIcons = new Set();
    const importedIcons = new Set();
    let hasLucideImport = false;
    
    // 收集已导入的Lucide图标，检查是否存在lucide-react导入
    traverse.default(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === 'lucide-react') {
          hasLucideImport = true;
          path.node.specifiers.forEach(spec => {
            if (spec.type === 'ImportSpecifier') {
              // 对于别名导入(如 Image as ImageIcon)，应该记录本地名称
              const localName = spec.local.name;
              importedIcons.add(localName); // 添加本地名称，而不是原始名称
            }
          });
        }
      }
    });
    
    // 只有当存在lucide-react导入时，才检查缺失的图标
    if (!hasLucideImport) {
      return; // 没有lucide-react导入，不检查图标
    }
    
    // 收集使用的可能是Lucide图标的标识符
    traverse.default(ast, {
      JSXElement(path) {
        try {
          const elementName = path.node.openingElement.name;
          if (elementName && elementName.type === 'JSXIdentifier') {
            const name = elementName.name;
            
            // 基本验证：确保name是有效字符串
            if (name && typeof name === 'string' && name.length > 0) {
              // 精准匹配：只检查真实存在的Lucide图标
              if (self._isValidLucideIcon(name)) {
                usedIcons.add(name);
              }
            }
          }
        } catch (error) {
          // 忽略解析错误，继续处理其他元素
          console.warn(`JSX元素解析错误: ${error.message}`);
        }
      }
    });
    
    // 找出缺失的图标导入
    const missingIcons = [...usedIcons].filter(icon => !importedIcons.has(icon));
    
    if (missingIcons.length > 0) {
      issues.push({
        type: FIX_TYPES.MISSING_LUCIDE_IMPORT,
        priority: FIX_PRIORITY.HIGH,
        message: `缺失Lucide图标导入: ${missingIcons.join(', ')}`,
        location: { line: 1, column: 1 },
        data: { missingIcons }
      });
    }
  }

  /**
   * 加载Lucide图标列表
   * 
   * @private
   * @returns {Set} Lucide图标集合（已经是PascalCase格式）
   */
  _loadLucideIcons() {
    try {
      // 获取当前文件目录
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      
      // 构建图标文件路径 - 使用server下的data目录
      const iconsPath = join(__dirname, '../../data/lucide-icons.json');
      const iconsData = readFileSync(iconsPath, 'utf-8');
      const iconsArray = JSON.parse(iconsData);
      
      // 验证数据格式
      if (!Array.isArray(iconsArray)) {
        throw new Error('Lucide icons data is not an array');
      }
      
      // 图标库已经是精确的PascalCase格式，直接使用
      const iconSet = new Set(iconsArray);
      
      // 调试信息：确认加载了真实的图标库
      console.error(`✅ 成功加载Lucide图标进行精准匹配`);
      
      return iconSet;
    } catch (error) {
      console.warn('❌ 加载Lucide图标列表失败:', error.message);
      console.warn('🔄 将使用严格模式：只有明确知道的图标才会被识别');
      
      // 返回空集合，这样只有明确知道的图标才会被识别
      return new Set();
    }
  }

  /**
   * 判断是否是有效的Lucide图标
   * 
   * @private
   * @param {string} name - 标识符名称
   * @returns {boolean} 是否是有效的Lucide图标
   */
  _isValidLucideIcon(name) {
    // 输入验证：确保是有效的标识符名称
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    // 过滤掉明显不是标识符的字符串（包含空格、特殊字符等）
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      return false;
    }
    
    // 排除明显不是图标的常见标识符
    const nonIconIdentifiers = [
      'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'button', 'input', 'form', 'table', 'tr', 'td', 'th',
      'Fragment', 'React', 'Component', 'Element',
      'createPortal', 'render', 'useState', 'useEffect'
    ];
    
    if (nonIconIdentifiers.includes(name)) {
      return false;
    }
    
    // 精确匹配：只有当图标存在于真实的Lucide图标列表中时才返回true
    return this.lucideIcons && this.lucideIcons.has(name);
  }

  /**
   * 从错误消息中提取导入源
   * 
   * @private
   * @param {string} message - 错误消息
   * @returns {string} 导入源
   */
  _extractImportSource(message) {
    const match = message.match(/未使用的导入:\s*(.+)/);
    return match ? match[1].trim() : '';
  }

  /**
   * 验证函数中的Hook使用
   * 
   * @private
   * @param {object} path - AST路径
   * @param {array} issues - 问题数组
   */
  _validateHooksInFunction(path, issues) {
    // 这里可以实现具体的Hook规则检查
    // 例如检查Hook是否在条件语句中调用等
  }

  /**
   * 获取修复统计信息
   * 
   * @private
   * @param {array} fixes - 修复列表
   * @returns {object} 统计信息
   */
  _getFixStats(fixes) {
    const stats = {
      total: fixes.length,
      successful: fixes.filter(f => f.applied).length,
      failed: fixes.filter(f => !f.applied).length,
      byType: {},
      byPriority: {}
    };

    fixes.forEach(fix => {
      stats.byType[fix.type] = (stats.byType[fix.type] || 0) + 1;
      stats.byPriority[fix.priority] = (stats.byPriority[fix.priority] || 0) + 1;
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
      totalFixes: 0,
      fixesByType: {},
      successfulFixes: 0,
      failedFixes: 0
    };
  }

  /**
   * 智能分组和优先化问题
   * 
   * @private
   * @param {array} issues - 问题列表
   * @param {number} round - 当前轮次
   * @returns {array} 分组后的问题列表
   */
  _groupAndPrioritizeIssues(issues, round) {
    // 按类型分组
    const groups = {
      critical: [], // 阻止编译的错误
      imports: [],  // 导入相关
      hooks: [],    // React Hooks
      cleanup: [],  // 清理类（如删除未使用导入）
      style: []     // 代码风格
    };
    
    issues.forEach(issue => {
      switch (issue.priority) {
        case FIX_PRIORITY.CRITICAL:
          groups.critical.push(issue);
          break;
        case FIX_PRIORITY.HIGH:
          if (issue.type.includes('IMPORT') || issue.type === FIX_TYPES.UNDEFINED_VARIABLE) {
            groups.imports.push(issue);
          } else {
            groups.hooks.push(issue);
          }
          break;
        case FIX_PRIORITY.LOW:
          if (issue.type === FIX_TYPES.UNUSED_IMPORT) {
            groups.cleanup.push(issue);
          } else {
            groups.style.push(issue);
          }
          break;
        default:
          groups.style.push(issue);
      }
    });
    
    // 根据轮次调整优先级
    let prioritizedIssues = [];
    
    if (round === 0) {
      // 第一轮：优先处理关键错误和必要导入问题（但不删除导入）
      prioritizedIssues = [...groups.critical, ...groups.imports];
    } else if (round === 1) {
      // 第二轮：处理 Hooks 和剩余导入问题
      prioritizedIssues = [...groups.hooks, ...groups.imports];
    } else {
      // 后续轮次：处理清理和样式问题
      prioritizedIssues = [...groups.cleanup, ...groups.style];
    }
    
    return prioritizedIssues;
  }
  
  /**
   * 计算当前轮次的最大修复数量
   * 
   * @private
   * @param {number} round - 当前轮次
   * @param {array} issues - 问题列表
   * @returns {number} 最大修复数量
   */
  _calculateMaxFixesForRound(round, issues) {
    const importIssues = issues.filter(issue => 
      issue.type.includes('IMPORT') || issue.type === FIX_TYPES.UNDEFINED_VARIABLE);
    const criticalIssues = issues.filter(issue => issue.priority === FIX_PRIORITY.CRITICAL);
    
    if (round === 0) {
      // 第一轮：宽松限制，重点解决关键问题
      return Math.max(20, criticalIssues.length + importIssues.length);
    } else if (round === 1) {
      // 第二轮：中等限制
      return 15;
    } else {
      // 后续轮次：保守限制
      return 10;
    }
  }
  
  /**
   * 评估修复风险
   * 
   * @private
   * @param {object} issue - 问题对象
   * @param {string} currentCode - 当前代码
   * @param {array} appliedFixes - 已应用的修复
   * @returns {object} 风险评估结果
   */
  _assessFixRisk(issue, currentCode, appliedFixes) {
    let riskLevel = 'low';
    let isHighRisk = false;
    const reasons = [];
    
    // 检查修复类型风险
    if (issue.type === FIX_TYPES.JSX_FRAGMENT) {
      riskLevel = 'medium';
      reasons.push('JSX结构修改可能影响布局');
    }
    
    // 检查是否已经修复过类似问题
    const similarFixes = appliedFixes.filter(fix => fix.type === issue.type);
    
    // 对于React hooks导入，允许更多的同类型修复
    const isReactHookFix = issue.type === FIX_TYPES.UNDEFINED_VARIABLE && 
                          issue.data?.variableName?.startsWith('use') &&
                          issue.data.variableName.length > 3;
    
    const maxAllowedSimilarFixes = isReactHookFix ? 10 : 3;
    
    if (similarFixes.length > maxAllowedSimilarFixes) {
      riskLevel = 'high';
      isHighRisk = true;
      reasons.push(`同类型修复过多(${similarFixes.length}>${maxAllowedSimilarFixes})，可能存在循环修复`);
    }
    
    // 检查代码复杂度
    const codeComplexity = currentCode.split('\n').length;
    if (codeComplexity > 100 && issue.priority > FIX_PRIORITY.HIGH) {
      riskLevel = 'medium';
      reasons.push('代码复杂度高，非关键修复风险增加');
    }
    
    return {
      riskLevel,
      isHighRisk,
      reasons
    };
  }
  
  /**
   * 验证修复质量
   * 
   * @private
   * @param {object} issue - 问题对象
   * @param {object} fixResult - 修复结果
   * @param {string} originalCode - 原始代码
   * @returns {object} 质量评估结果
   */
  _validateFixQuality(issue, fixResult, originalCode) {
    const quality = {
      score: 100,
      issues: [],
      confidence: 'high'
    };
    
    // 检查修复是否引入了明显的问题
    if (fixResult.newCode) {
      const codeLength = fixResult.newCode.length;
      const originalLength = originalCode.length;
      
      // 检查代码长度变化是否合理
      const lengthChange = Math.abs(codeLength - originalLength) / originalLength;
      if (lengthChange > 0.5) {
        quality.score -= 20;
        quality.issues.push('代码长度变化过大');
        quality.confidence = 'medium';
      }
    }
    
    // 根据修复类型调整质量评分
    switch (issue.type) {
      case FIX_TYPES.MISSING_LUCIDE_IMPORT:
      case FIX_TYPES.UNDEFINED_VARIABLE:
        quality.confidence = 'high';
        break;
      case FIX_TYPES.JSX_FRAGMENT:
        quality.score -= 10;
        quality.confidence = 'medium';
        break;
      default:
        quality.confidence = 'medium';
    }
    
    return quality;
  }
  
  /**
   * 智能回滚策略
   * 
   * @private
   * @param {array} appliedFixes - 已应用的修复
   * @param {string} originalCode - 原始代码
   * @returns {string} 回滚后的代码
   */
  _smartRollback(appliedFixes, originalCode) {
    // 找到最后一个成功的关键修复点
    const criticalFixes = appliedFixes.filter(fix => 
      fix.applied && 
      (fix.priority === FIX_PRIORITY.CRITICAL || fix.type.includes('IMPORT'))
    );
    
    if (criticalFixes.length > 0) {
      // 回滚到最后一个关键修复
      const lastCriticalFix = criticalFixes[criticalFixes.length - 1];
      return lastCriticalFix.newCode || originalCode;
    }
    
    // 否则回滚到原始代码
    return originalCode;
  }
  
  /**
   * 评估代码质量
   * 
   * @private
   * @param {string} newCode - 新代码
   * @param {string} oldCode - 旧代码
   * @returns {object} 代码质量评估
   */
  _assessCodeQuality(newCode, oldCode) {
    const quality = {
      readability: 50,
      maintainability: 50,
      complexity: 50,
      overall: 50
    };
    
    // 计算代码复杂度变化
    const newLines = newCode.split('\n').length;
    const oldLines = oldCode.split('\n').length;
    const complexityChange = (newLines - oldLines) / oldLines;
    
    if (complexityChange < 0.1) {
      quality.complexity = 70;
    } else if (complexityChange > 0.3) {
      quality.complexity = 30;
    }
    
    // 检查导入语句的组织
    const importLines = newCode.split('\n').filter(line => line.trim().startsWith('import'));
    if (importLines.length > 0) {
      quality.maintainability = 60;
    }
    
    // 检查代码格式化
    const hasConsistentIndentation = !/\n\s*\S/.test(newCode) || /\n  \S/.test(newCode);
    if (hasConsistentIndentation) {
      quality.readability = 65;
    }
    
    quality.overall = Math.round((quality.readability + quality.maintainability + quality.complexity) / 3);
    
    return quality;
  }
  
  /**
   * 生成增强统计报告
   * 
   * @private
   * @param {array} fixes - 修复列表
   * @param {array} rounds - 轮次详情
   * @returns {object} 增强统计信息
   */
  _generateEnhancedStats(fixes, rounds) {
    const basic = this._getFixStats(fixes);
    
    const enhanced = {
      ...basic,
      rounds: rounds.length,
      averageFixesPerRound: rounds.length > 0 ? (fixes.filter(f => f.applied).length / rounds.length).toFixed(2) : 0,
      qualityDistribution: {
        high: fixes.filter(f => f.quality?.confidence === 'high').length,
        medium: fixes.filter(f => f.quality?.confidence === 'medium').length,
        low: fixes.filter(f => f.quality?.confidence === 'low').length
      },
      riskDistribution: {
        low: fixes.filter(f => f.riskLevel === 'low').length,
        medium: fixes.filter(f => f.riskLevel === 'medium').length,
        high: fixes.filter(f => f.riskLevel === 'high').length
      },
      byRound: rounds.map(round => ({
        round: round.round,
        issues: round.issuesFound,
        successful: round.fixesSuccessful,
        failed: round.fixesFailed,
        duration: round.duration
      }))
    };
    
    return enhanced;
  }
  
  /**
   * 获取性能指标
   * 
   * @private
   * @param {array} rounds - 轮次详情
   * @returns {object} 性能指标
   */
  _getPerformanceMetrics(rounds) {
    if (rounds.length === 0) {
      return { totalTime: 0, averageRoundTime: 0, efficiency: 0 };
    }
    
    const totalTime = rounds.reduce((sum, round) => sum + (round.duration || 0), 0);
    const averageRoundTime = totalTime / rounds.length;
    const totalFixes = rounds.reduce((sum, round) => sum + round.fixesSuccessful, 0);
    const efficiency = totalTime > 0 ? (totalFixes / totalTime * 1000).toFixed(2) : 0; // fixes per second
    
    return {
      totalTime,
      averageRoundTime: Math.round(averageRoundTime),
      efficiency: parseFloat(efficiency),
      rounds: rounds.length
    };
  }
  
  /**
   * 获取整体质量评估
   * 
   * @private
   * @param {array} fixes - 修复列表
   * @returns {object} 整体质量
   */
  _getOverallQuality(fixes) {
    const appliedFixes = fixes.filter(f => f.applied);
    
    if (appliedFixes.length === 0) {
      return { score: 0, level: 'none', confidence: 'low' };
    }
    
    const totalScore = appliedFixes.reduce((sum, fix) => sum + (fix.quality?.score || 50), 0);
    const averageScore = totalScore / appliedFixes.length;
    
    let level = 'low';
    if (averageScore >= 80) level = 'high';
    else if (averageScore >= 60) level = 'medium';
    
    const highConfidenceFixes = appliedFixes.filter(f => f.quality?.confidence === 'high').length;
    const confidenceRatio = highConfidenceFixes / appliedFixes.length;
    
    let overallConfidence = 'low';
    if (confidenceRatio >= 0.8) overallConfidence = 'high';
    else if (confidenceRatio >= 0.5) overallConfidence = 'medium';
    
    return {
      score: Math.round(averageScore),
      level,
      confidence: overallConfidence,
      details: {
        totalFixes: appliedFixes.length,
        highQualityFixes: appliedFixes.filter(f => (f.quality?.score || 0) >= 80).length,
        highConfidenceFixes
      }
    };
  }

  /**
   * 注册自定义修复规则
   * 
   * @param {string} type - 问题类型
   * @param {function} fixFunction - 修复函数
   */
  registerFixRule(type, fixFunction) {
    this.fixRules.set(type, fixFunction);
  }
}

/**
 * 便捷函数：自动修复代码
 * 
 * @param {string} code - 源代码
 * @param {string} filename - 文件名
 * @param {object} options - 选项
 * @returns {Promise<object>} 修复结果
 */
export async function autoFixCode(code, filename = 'unknown', options = {}) {
  const fixer = new ASTAutoFixer(options);
  return await fixer.autoFix(code, filename);
}

export default ASTAutoFixer;