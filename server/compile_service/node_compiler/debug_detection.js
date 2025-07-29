#!/usr/bin/env node

import { readFileSync } from 'fs';
import { TSXParser } from './ast/parser.js';
import traverse from '@babel/traverse';

const testCode = readFileSync('/opt/file-server/client/src/test/test.tsx', 'utf8');

console.log('=== 详细调试未定义变量检测 ===');

try {
  const parser = new TSXParser();
  const parseResult = parser.parse(testCode);
  const ast = parseResult.ast;

  // 模拟auto-fix.js中的检测逻辑
  const undefinedVariables = new Set();
  const definedTypes = new Set();
  
  // 1. 收集定义的类型
  traverse.default(ast, {
    TSInterfaceDeclaration(path) {
      definedTypes.add(path.node.id.name);
    },
    TSTypeAliasDeclaration(path) {
      definedTypes.add(path.node.id.name);
    }
  });
  
  console.log('定义的类型数量:', definedTypes.size);
  
  // 内置标识符判断函数 (复制自auto-fix.js)
  const isBuiltinIdentifier = (name) => {
    const builtins = [
      'console', 'window', 'document', 'global', 'process',
      'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean',
      'Date', 'RegExp', 'Error', 'JSON', 'Math',
      'fetch', 'URL', 'URLSearchParams', 'FormData', 'Headers',
      'Request', 'Response', 'AbortController', 'AbortSignal',
      'localStorage', 'sessionStorage', 'location', 'history',
      'navigator', 'screen', 'performance',
      'Element', 'HTMLElement', 'Event', 'EventTarget',
      'alert', 'confirm', 'prompt', 'open', 'close',
      'requestAnimationFrame', 'cancelAnimationFrame',
      'require', 'module', 'exports', '__dirname', '__filename',
      'debounce', 'throttle', 'clsx', 'classNames'
    ];
    return builtins.includes(name);
  };
  
  // 类型注解检查函数 (简化版)
  const isInTypeAnnotation = (path) => {
    let current = path.parent;
    while (current) {
      if (current.type && current.type.startsWith('TS')) {
        return true;
      }
      current = current.parent;
    }
    return false;
  };

  // 2. 查找未定义变量，特别关注useMemo
  let useMemoChecked = false;
  const allUseMemoOccurrences = [];
  
  traverse.default(ast, {
    Identifier(path) {
      const variableName = path.node.name;
      const line = path.node.loc?.start.line;
      
      // 记录所有useMemo的出现
      if (variableName === 'useMemo') {
        const binding = path.scope.getBinding(variableName);
        const isReferenced = path.isReferencedIdentifier();
        const isBuiltin = isBuiltinIdentifier(variableName);
        const inTypeAnnotation = isInTypeAnnotation(path);
        const alreadyProcessed = undefinedVariables.has(variableName);
        
        allUseMemoOccurrences.push({
          line,
          isReferenced,
          hasBinding: !!binding,
          isBuiltin,
          inTypeAnnotation,
          alreadyProcessed,
          shouldSkip: !isReferenced || !!binding || isBuiltin || definedTypes.has(variableName) || inTypeAnnotation || alreadyProcessed
        });
        
        console.log(`\\n=== useMemo检查 (第${line}行) ===`);
        console.log('是引用标识符:', isReferenced);
        console.log('有绑定:', !!binding);
        console.log('是内置标识符:', isBuiltin);
        console.log('在类型注解中:', inTypeAnnotation);
        console.log('已经处理过:', alreadyProcessed);
        console.log('应该跳过:', !isReferenced || !!binding || isBuiltin || definedTypes.has(variableName) || inTypeAnnotation || alreadyProcessed);
        
        useMemoChecked = true;
      }
      
      // 执行原始检测逻辑
      if (path.isReferencedIdentifier()) {
        const binding = path.scope.getBinding(variableName);
        
        if (!binding && 
            !isBuiltinIdentifier(variableName) && 
            !definedTypes.has(variableName) && 
            !undefinedVariables.has(variableName)) {
          
          if (isInTypeAnnotation(path)) {
            return;
          }
          
          undefinedVariables.add(variableName);
          
          if (variableName === 'useMemo') {
            console.log(`\\n✅ useMemo被添加到未定义变量列表 (第${line}行)`);
          }
        }
      }
    }
  });
  
  console.log(`\\n=== 总结 ===`);
  console.log('useMemo被检查:', useMemoChecked);
  console.log('useMemo出现次数:', allUseMemoOccurrences.length);
  console.log('未定义变量总数:', undefinedVariables.size);
  console.log('未定义变量列表:', Array.from(undefinedVariables));
  console.log('包含useMemo:', undefinedVariables.has('useMemo'));
  
  if (allUseMemoOccurrences.length > 0) {
    console.log('\\n=== 所有useMemo出现情况 ===');
    allUseMemoOccurrences.forEach((occurrence, i) => {
      console.log(`${i+1}. 第${occurrence.line}行:`);
      console.log(`   - 应该跳过: ${occurrence.shouldSkip}`);
      console.log(`   - 原因: ${occurrence.shouldSkip ? '是引用:' + occurrence.isReferenced + ', 有绑定:' + occurrence.hasBinding + ', 内置:' + occurrence.isBuiltin + ', 类型注解:' + occurrence.inTypeAnnotation : '正常检测'}`);
    });
  }

} catch (error) {
  console.error('❌ 检测调试失败:', error.message);
}