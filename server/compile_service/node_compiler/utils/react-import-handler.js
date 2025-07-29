/**
 * 统一的React导入处理器 (已修复并增强)
 * * 解决auto-fix和virtual-fs之间的React导入冲突问题
 * 提供一致、健壮的React导入检测和处理逻辑
 */

/**
 * 分析代码中的React导入情况
 * * @param {string} code - 源代码
 * @returns {object} React导入分析结果
 */
function analyzeReactImports(code) {
  const analysis = {
    hasJSX: false,
    hasReactImport: false,
    hasReactNamespace: false,
    existingImports: [],
    needsReactHooks: new Set(),
    needsReactComponents: new Set(),
  };

  // 1. 检查JSX语法
  if (/<[a-zA-Z]/.test(code) && (code.includes('</') || code.includes('/>'))) {
      analysis.hasJSX = true;
  }

  // 2. 检查是否使用了 React 命名空间 (e.g., React.useState, React.FC)
  if (/\bReact\./.test(code)) {
    analysis.hasReactNamespace = true;
  }

  // 3. 提取所有已存在的 React 导入语句
  const reactImportRegex = /import\s+(?:(?:[\w\s,{}*]+)\s+from)?\s*['"]react['"];?/g;
  let match;
  while ((match = reactImportRegex.exec(code)) !== null) {
    analysis.hasReactImport = true;
    analysis.existingImports.push({
      fullMatch: match[0],
    });
  }

  // 4. 查找所有在代码中使用的 hooks
  const hookPattern = /\b(use[A-Z]\w*)\b/g;
  while ((match = hookPattern.exec(code)) !== null) {
    analysis.needsReactHooks.add(match[1]);
  }

  // 5. 查找React组件和API (除了hooks)
  const reactComponents = [
    'Suspense', 'Fragment', 'StrictMode', 'Profiler',
    'createContext', 'forwardRef', 'memo', 'lazy',
    'createRef', 'Component', 'PureComponent',
    'createElement', 'cloneElement', 'isValidElement'
  ];
  
  reactComponents.forEach(component => {
    // 检查是否在代码中使用了这些React组件/API
    const componentRegex = new RegExp(`\\b${component}\\b`);
    if (componentRegex.test(code)) {
      analysis.needsReactComponents.add(component);
    }
  });

  return analysis;
}


/**
 * 生成并注入最优的React导入语句 (核心修复逻辑)
 * * @param {string} code - 源代码
 * @returns {string} 处理后的代码
 */
export function addOptimalReactImport(code) {
  const analysis = analyzeReactImports(code);

  const needsDefaultImport = analysis.hasJSX || analysis.hasReactNamespace;
  const neededHooks = Array.from(analysis.needsReactHooks).sort();
  const neededComponents = Array.from(analysis.needsReactComponents).sort();

  // 如果不需要任何 React 相关的东西，直接返回原代码
  if (!needsDefaultImport && neededHooks.length === 0 && neededComponents.length === 0) {
    return code;
  }
  
  // 1. 移除所有旧的 React 导入语句
  let codeWithoutReactImports = code;
  analysis.existingImports.forEach(imp => {
    // 使用正则表达式替换，以处理可能的换行符和分号
    const regex = new RegExp(imp.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n?');
    codeWithoutReactImports = codeWithoutReactImports.replace(regex, '');
  });
  
  // 2. 构建新的、最优的导入语句
  const importParts = [];
  if (needsDefaultImport) {
    importParts.push('React');
  }
  
  // 合并hooks和components到命名导入中
  const namedImports = [...neededHooks, ...neededComponents];
  if (namedImports.length > 0) {
    importParts.push(`{ ${namedImports.join(', ')} }`);
  }

  if (importParts.length === 0) {
      return codeWithoutReactImports.trim(); // 不应该发生，但作为保护
  }

  const newImportStatement = `import ${importParts.join(', ')} from 'react';`;

  // 3. 将新语句添加到代码顶部
  return `${newImportStatement}\n\n${codeWithoutReactImports.trim()}`;
}

/**
 * 检查代码是否需要React导入 (可用于其他逻辑)
 * * @param {string} code - 源代码
 * @returns {boolean} 是否需要React导入
 */
export function needsReactImport(code) {
  const analysis = analyzeReactImports(code);
  
  if (analysis.hasReactImport) {
    return false;
  }

  return analysis.hasJSX || analysis.hasReactNamespace || analysis.needsReactHooks.size > 0 || analysis.needsReactComponents.size > 0;
}

export default {
  addOptimalReactImport,
  needsReactImport,
  analyzeReactImports
};
