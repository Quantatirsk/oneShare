#!/usr/bin/env node

import { readFileSync } from 'fs';
import { ASTAutoFixer } from './ast/auto-fix.js';

const testCode = readFileSync('/opt/file-server/client/src/test/test.tsx', 'utf8');

console.log('=== 调试自动修复器检测 ===');
console.log('文件大小:', testCode.length, '字符');

try {
  // 创建自动修复器
  const autoFixer = new ASTAutoFixer({
    enableReactFixes: true,
    enableImportFixes: true,
    maxFixAttempts: 3
  });

  // 运行自动修复
  console.log('\\n=== 运行自动修复 ===');
  const fixResult = await autoFixer.autoFix(testCode, 'test.tsx');
  
  console.log('修复成功:', fixResult.success);
  console.log('应用的修复数量:', fixResult.fixes?.length || 0);
  
  if (fixResult.fixes && fixResult.fixes.length > 0) {
    console.log('\\n=== 应用的修复 ===');
    fixResult.fixes.forEach((fix, i) => {
      console.log(`${i+1}. 类型: ${fix.type}`);
      console.log(`   描述: ${fix.description}`);
      console.log(`   数据: ${JSON.stringify(fix.data)}`);
      console.log(`   位置: 第${fix.location?.line}行`);
      console.log('---');
    });
    
    // 查找useMemo相关的修复
    const useMemoFixes = fixResult.fixes.filter(fix => 
      fix.data?.variableName === 'useMemo'
    );
    
    console.log('\\n=== useMemo修复 ===');
    console.log('useMemo修复数量:', useMemoFixes.length);
    
    if (useMemoFixes.length > 0) {
      console.log('✅ 找到useMemo修复');
      useMemoFixes.forEach(fix => {
        console.log(`- ${fix.description} (第${fix.location?.line}行)`);
      });
      
      // 检查修复后的第一行
      if (fixResult.fixedCode) {
        const fixedFirstLine = fixResult.fixedCode.split('\\n')[0];
        console.log('\\n修复后第一行:', fixedFirstLine);
        console.log('包含useMemo:', fixedFirstLine.includes('useMemo'));
      }
    } else {
      console.log('❌ 没有找到useMemo修复');
    }
  } else {
    console.log('❌ 没有应用任何修复');
  }
  
  if (fixResult.errors && fixResult.errors.length > 0) {
    console.log('\\n=== 修复错误 ===');
    fixResult.errors.forEach(error => {
      console.log(`- ${error}`);
    });
  }

} catch (error) {
  console.error('❌ 自动修复器测试失败:', error.message);
  console.error(error.stack);
}