#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES6 模块中获取 __dirname 的方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 批量导入 .tsx 模板文件到 JSON
 * 
 * 使用方法：
 * node batch-import.js [模板目录] [输出JSON文件]
 * 
 * 示例：
 * node batch-import.js ./templates ./templates.json
 * 
 * 注意：生成的JSON文件可以配合重构后的模板管理器使用，
 * 需要先调用 initializeTemplates() 初始化，然后使用原有的函数接口：
 * - getTemplatesByCategory()
 * - getTemplateById() 
 * - getAllCategories()
 */

// 默认配置
const DEFAULT_CONFIG = {
  templateDir: './templates',
  outputFile: './templates.json',
  supportedExtensions: ['.tsx', '.jsx', '.ts', '.js']
};

/**
 * 从文件内容中提取元数据注释
 * 支持的注释格式：
 * // @title: 标题
 * // @description: 描述
 * // @category: utility
 * // @tags: 标签1,标签2,标签3
 * // @difficulty: beginner
 */
function extractMetadataFromCode(code, filename) {
  const metadata = {};
  
  // 提取注释中的元数据
  const metadataRegex = /\/\/\s*@(\w+):\s*(.+)/g;
  let match;
  
  while ((match = metadataRegex.exec(code)) !== null) {
    const [, key, value] = match;
    switch (key) {
      case 'tags':
        metadata[key] = value.split(',').map(tag => tag.trim());
        break;
      case 'title':
      case 'description':
      case 'category':
      case 'difficulty':
        metadata[key] = value.trim();
        break;
    }
  }
  
  // 从文件名生成默认 ID
  if (!metadata.id) {
    metadata.id = path.basename(filename, path.extname(filename))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  // 从文件名推导默认标题
  if (!metadata.title) {
    metadata.title = path.basename(filename, path.extname(filename))
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
  
  // 设置默认值
  const defaults = {
    description: metadata.title || '无描述',
    category: 'other',
    tags: [],
    difficulty: 'beginner'
  };
  
  return { ...defaults, ...metadata };
}

/**
 * 扫描目录获取所有模板文件
 */
function scanTemplateFiles(templateDir) {
  if (!fs.existsSync(templateDir)) {
    console.error(`❌ 模板目录不存在: ${templateDir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(templateDir)
    .filter(file => DEFAULT_CONFIG.supportedExtensions.includes(path.extname(file)))
    .map(file => path.join(templateDir, file));
  
  console.log(`📁 找到 ${files.length} 个模板文件`);
  return files;
}

/**
 * 处理单个模板文件
 */
function processTemplateFile(filePath) {
  try {
    console.log(`📄 处理文件: ${filePath}`);
    
    const code = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    const metadata = extractMetadataFromCode(code, filename);
    
    const template = {
      ...metadata,
      code: code.trim()
    };
    
    console.log(`  ✅ ID: ${template.id}, 标题: ${template.title}`);
    return template;
    
  } catch (error) {
    console.error(`  ❌ 处理文件失败: ${error.message}`);
    return null;
  }
}

/**
 * 加载现有的 JSON 文件
 */
function loadExistingTemplates(outputFile) {
  if (fs.existsSync(outputFile)) {
    try {
      const content = fs.readFileSync(outputFile, 'utf-8');
      const data = JSON.parse(content);
      return data.templates || [];
    } catch (error) {
      console.warn(`⚠️  读取现有JSON文件失败: ${error.message}`);
      return [];
    }
  }
  return [];
}

/**
 * 保存模板到 JSON 文件
 */
function saveTemplates(templates, outputFile) {
  const data = {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    templates: templates
  };
  
  try {
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 已保存 ${templates.length} 个模板到: ${outputFile}`);
  } catch (error) {
    console.error(`❌ 保存文件失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 合并新旧模板（避免重复）
 */
function mergeTemplates(existingTemplates, newTemplates) {
  const merged = [...existingTemplates];
  const existingIds = new Set(existingTemplates.map(t => t.id));
  
  let addedCount = 0;
  let updatedCount = 0;
  
  newTemplates.forEach(newTemplate => {
    const existingIndex = merged.findIndex(t => t.id === newTemplate.id);
    
    if (existingIndex >= 0) {
      // 更新现有模板
      merged[existingIndex] = newTemplate;
      updatedCount++;
      console.log(`  🔄 更新模板: ${newTemplate.id}`);
    } else {
      // 添加新模板
      merged.push(newTemplate);
      addedCount++;
      console.log(`  ➕ 新增模板: ${newTemplate.id}`);
    }
  });
  
  console.log(`📊 合并结果: 新增 ${addedCount} 个, 更新 ${updatedCount} 个, 总计 ${merged.length} 个模板`);
  return merged;
}

/**
 * 创建示例模板文件
 */
function createExampleTemplate() {
  const exampleTemplate = `// @title: 示例组件
// @description: 这是一个示例模板组件
// @category: utility
// @tags: 示例,模板,基础
// @difficulty: beginner

import React, { useState } from 'react';

export default function ExampleComponent() {
  const [count, setCount] = useState(0);

  return (
    <div className="max-w-md mx-auto mt-8 bg-white rounded-lg shadow-lg p-6">
      <h1 className="text-2xl font-bold text-center text-gray-800 mb-4">
        示例组件
      </h1>
      <div className="text-center">
        <p className="text-lg mb-4">计数器: {count}</p>
        <div className="space-x-2">
          <button
            onClick={() => setCount(count + 1)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
          >
            增加
          </button>
          <button
            onClick={() => setCount(count - 1)}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors"
          >
            减少
          </button>
          <button
            onClick={() => setCount(0)}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
          >
            重置
          </button>
        </div>
      </div>
    </div>
  );
}`;
  
  const examplePath = path.join(DEFAULT_CONFIG.templateDir, 'ExampleComponent.tsx');
  
  if (!fs.existsSync(DEFAULT_CONFIG.templateDir)) {
    fs.mkdirSync(DEFAULT_CONFIG.templateDir, { recursive: true });
  }
  
  if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(examplePath, exampleTemplate, 'utf-8');
    console.log(`📝 已创建示例模板: ${examplePath}`);
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const templateDir = args[0] || DEFAULT_CONFIG.templateDir;
  const outputFile = args[1] || DEFAULT_CONFIG.outputFile;
  
  console.log('🚀 开始批量导入模板文件...');
  console.log(`📂 模板目录: ${templateDir}`);
  console.log(`📄 输出文件: ${outputFile}`);
  console.log('');
  
  // 如果模板目录不存在，创建示例
  if (!fs.existsSync(templateDir)) {
    console.log(`📁 模板目录不存在，创建示例模板...`);
    createExampleTemplate();
  }
  
  // 扫描模板文件
  const files = scanTemplateFiles(templateDir);
  
  if (files.length === 0) {
    console.log('⚠️  未找到模板文件');
    console.log('💡 提示: 在模板文件中添加元数据注释，例如:');
    console.log('   // @title: 我的组件');
    console.log('   // @description: 组件描述');
    console.log('   // @category: utility');
    console.log('   // @tags: 标签1,标签2');
    console.log('   // @difficulty: beginner');
    return;
  }
  
  // 处理所有模板文件
  console.log('');
  const newTemplates = files
    .map(processTemplateFile)
    .filter(template => template !== null);
  
  if (newTemplates.length === 0) {
    console.log('❌ 没有成功处理的模板文件');
    return;
  }
  
  // 加载现有模板并合并
  console.log('');
  const existingTemplates = loadExistingTemplates(outputFile);
  const allTemplates = mergeTemplates(existingTemplates, newTemplates);
  
  // 保存到文件
  console.log('');
  saveTemplates(allTemplates, outputFile);
  
  console.log('');
  console.log('✅ 批量导入完成！');
  console.log('💡 现在可以在你的应用中使用 loadTemplates() 函数加载模板数据');
}

// 命令行参数帮助
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📋 批量导入模板文件脚本 (ES6 版本)

使用方法:
  node batch-import.js [模板目录] [输出JSON文件]

参数:
  模板目录     模板文件所在目录 (默认: ./templates)
  输出JSON文件  输出的JSON文件路径 (默认: ./templates.json)

选项:
  -h, --help   显示帮助信息

示例:
  node batch-import.js                           # 使用默认目录
  node batch-import.js ./my-templates            # 指定模板目录
  node batch-import.js ./templates ./output.json # 指定目录和输出文件

模板文件元数据格式:
  在 .tsx 文件开头添加注释来定义元数据：
  
  // @title: 组件标题
  // @description: 组件描述
  // @category: utility|game|dashboard|creative|other
  // @tags: 标签1,标签2,标签3
  // @difficulty: beginner|intermediate|advanced

支持的文件类型: .tsx, .jsx, .ts, .js

注意：使用ES6模块语法需要：
1. 在 package.json 中添加 "type": "module"
2. 或者将文件重命名为 .mjs 扩展名
`);
  process.exit(0);
}

// 运行主函数
main();