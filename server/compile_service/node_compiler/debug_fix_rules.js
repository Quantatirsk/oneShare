#!/usr/bin/env node

import { readFileSync } from 'fs';
import { TSXParser } from './ast/parser.js';
import { ASTAutoFixer, FIX_TYPES } from './ast/auto-fix.js';

const testCode = readFileSync('/opt/file-server/client/src/test/test.tsx', 'utf8');

console.log('=== 调试修复规则应用 ===');

try {
  const parser = new TSXParser();
  const parseResult = parser.parse(testCode);
  const ast = parseResult.ast;
  
  // 创建自动修复器
  const autoFixer = new ASTAutoFixer();
  
  // 手动创建一个useMemo问题
  const testIssue = {
    type: FIX_TYPES.UNDEFINED_VARIABLE,
    priority: 1,
    message: '未定义的React Hook: useMemo',
    location: { line: 1455, column: 27 },
    data: { variableName: 'useMemo' }
  };
  
  console.log('创建测试问题:', testIssue);
  
  // 获取修复规则
  const fixRule = autoFixer.fixRules.get(FIX_TYPES.UNDEFINED_VARIABLE);
  if (!fixRule) {
    console.error('❌ 未找到UNDEFINED_VARIABLE修复规则');
    process.exit(1);
  }
  
  console.log('✅ 找到修复规则');
  
  // 尝试应用修复
  console.log('\\n=== 应用修复规则 ===');
  const fixResult = fixRule(ast, testIssue);
  
  console.log('修复结果:', fixResult);
  
  if (fixResult.success) {
    console.log('✅ 修复成功应用');
    
    // 生成修复后的代码
    const generate = (await import('@babel/generator')).default;
    const fixedCode = generate.default(ast).code;
    
    // 检查第一行
    const fixedFirstLine = fixedCode.split('\\n')[0];
    console.log('\\n修复后第一行:', fixedFirstLine);
    console.log('包含useMemo:', fixedFirstLine.includes('useMemo'));
    
    // 检查所有React导入行
    const lines = fixedCode.split('\\n');
    const reactImportLines = lines.filter(line => 
      line.includes('import') && line.includes('react')
    );
    
    console.log('\\nReact导入行:');
    reactImportLines.forEach((line, i) => {
      console.log(`${i+1}: ${line}`);
    });
    
  } else {
    console.log('❌ 修复失败:', fixResult.error);
  }

} catch (error) {
  console.error('❌ 修复规则测试失败:', error.message);
  console.error(error.stack);
}