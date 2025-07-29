#!/usr/bin/env node

import { readFileSync } from 'fs';
import { TSXParser } from './ast/parser.js';
import traverse from '@babel/traverse';

const testCode = readFileSync('/opt/file-server/client/src/test/test.tsx', 'utf8');

console.log('=== 调试大文件AST分析 ===');
console.log('文件大小:', testCode.length, '字符');

try {
  // 解析AST
  const parser = new TSXParser();
  const parseResult = parser.parse(testCode);
  console.log('✅ 解析完成');
  console.log('解析成功:', parseResult.success);
  
  if (!parseResult.success) {
    throw new Error('解析失败: ' + parseResult.errors?.join(', '));
  }
  
  const ast = parseResult.ast;
  console.log('AST类型:', ast?.type);
  console.log('AST键:', Object.keys(ast || {}));

  // 查找所有useMemo的使用
  const useMemoUsages = [];
  const allIdentifiers = [];
  
  // 确保AST结构正确
  if (!ast) {
    throw new Error('AST is null or undefined');
  }
  
  traverse.default(ast, {
    Identifier(path) {
      if (path.node.name === 'useMemo') {
        useMemoUsages.push({
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column,
          isReferencedIdentifier: path.isReferencedIdentifier(),
          binding: path.scope.getBinding(path.node.name),
          parent: path.parent?.type,
          parentSource: path.parent?.type === 'CallExpression' ? 'CallExpression' : 'Other'
        });
      }
    }
  });

  console.log(`\\n=== useMemo使用情况 ===`);
  console.log('找到useMemo使用次数:', useMemoUsages.length);
  useMemoUsages.forEach((usage, i) => {
    console.log(`${i+1}. 第${usage.line}:${usage.column}行`);
    console.log(`   - 是引用标识符: ${usage.isReferencedIdentifier}`);
    console.log(`   - 有绑定: ${!!usage.binding}`);
    console.log(`   - 父节点: ${usage.parent}`);
  });

  // 检查作用域问题 - 专门检查第1455行附近
  console.log(`\\n=== 检查作用域分析 ===`);
  traverse.default(ast, {
    CallExpression(path) {
      if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'useMemo') {
        const line = path.node.loc?.start.line;
        const binding = path.scope.getBinding('useMemo');
        console.log(`CallExpression中的useMemo，第${line}行:`);
        console.log(`  - 作用域中有绑定: ${!!binding}`);
        console.log(`  - 绑定类型: ${binding?.kind || 'undefined'}`);
        console.log(`  - 绑定路径: ${binding?.path?.type || 'undefined'}`);
      }
    }
  });

} catch (error) {
  console.error('❌ AST分析失败:', error.message);
}