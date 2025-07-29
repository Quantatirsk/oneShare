import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';

export function TsxDebugPage() {
  const { config } = useAppStore();
  const [api] = useState(() => new FileServerAPI(config));
  const [testMode, setTestMode] = useState<'icons' | 'hooks'>('hooks');
  
  const [testCode, setTestCode] = useState(`// 测试React hooks自动补全
function MyComponent() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  const nameRef = useRef(null);
  
  useEffect(() => {
    console.log('Component mounted');
  }, []);
  
  const memoizedValue = useMemo(() => {
    return count * 2;
  }, [count]);
  
  return (
    <div>
      <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} />
      <p>Count: {count}, Double: {memoizedValue}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}

export default MyComponent;`);

  const [compiledCode, setCompiledCode] = useState('');
  const [processedCode, setProcessedCode] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState('');
  const [hooksDetected, setHooksDetected] = useState<string[]>([]);
  const [supplementedCode, setSupplementedCode] = useState('');
  const [supplementedHooks, setSupplementedHooks] = useState<string[]>([]);

  // React hooks检测函数
  const detectUsedHooks = (code: string): string[] => {
    const commonHooks = [
      'useState', 'useEffect', 'useCallback', 'useRef', 'useMemo', 
      'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle',
      'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
      'useSyncExternalStore'
    ];

    const usedHooks: string[] = [];
    
    for (const hook of commonHooks) {
      // 支持泛型语法：useRef<Type>( 和 普通调用：useRef(
      const hookPattern = new RegExp(`\\b${hook}\\s*(?:<[^>]*>)?\\s*\\(`, 'g');
      
      if (hookPattern.test(code)) {
        usedHooks.push(hook);
        console.log(`✅ 检测到hook: ${hook} (支持泛型语法)`);
      }
    }

    return usedHooks;
  };


  const processImports = (code: string): string => {
    // 复制渲染器中的智能处理逻辑
    let processedCode = code;
    const lucideImports: string[] = [];
    
    // 提取lucide-react的导入
    const lucideImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"];?\s*\n?/g;
    let match;
    while ((match = lucideImportRegex.exec(code)) !== null) {
      const imports = match[1].split(',').map(item => item.trim());
      lucideImports.push(...imports);
    }
    
    // 移除所有import语句
    processedCode = processedCode
      .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*\n?/g, '') 
      .replace(/export\s+\{[^}]*\}\s*;?\s*\n?/g, '');
    
    // 为lucide图标添加变量声明
    if (lucideImports.length > 0) {
      const iconDeclarations = lucideImports.map(iconName => 
        `const ${iconName} = window.LucideIcons.${iconName} || window.LucideIcons['${iconName}'];`
      ).join('\n');
      processedCode = iconDeclarations + '\n' + processedCode;
    }
    
    // 检查是否有 var stdin_default = ComponentName; 模式
    const stdinDefaultMatch = processedCode.match(/var\s+stdin_default\s+=\s+(\w+);?/);
    if (stdinDefaultMatch) {
      const componentName = stdinDefaultMatch[1];
      processedCode += `\nreturn ${componentName};`;
      return processedCode;
    }
    
    if (processedCode.includes('export default function')) {
      processedCode = processedCode.replace(/export\s+default\s+function\s+(\w+)/, 'function $1');
      processedCode += '\nreturn ' + (processedCode.match(/function\s+(\w+)/)?.[1] || 'Component') + ';';
    }
    else if (processedCode.includes('export default')) {
      processedCode = processedCode.replace(/export\s+default\s+/, 'return ');
    }
    else {
      const arrowFunctionMatch = processedCode.match(/const\s+(\w+)\s+=\s+\([^)]*\)\s+=>/);
      if (arrowFunctionMatch) {
        const componentName = arrowFunctionMatch[1];
        processedCode += `\nreturn ${componentName};`;
      } else {
        const functionMatch = processedCode.match(/function\s+(\w+)/);
        if (functionMatch) {
          processedCode += '\nreturn ' + functionMatch[1] + ';';
        }
      }
    }
    
    return processedCode;
  };

  const handleCompile = async () => {
    setCompiling(true);
    setError('');
    
    try {
      if (testMode === 'hooks') {
        // 测试React hooks自动补全 - 使用后端能力
        console.log('=== 开始测试后端React Hooks自动补全 ===');
        
        // 1. 检测原始代码中使用的hooks (仅用于前端展示)
        const detectedHooks = detectUsedHooks(testCode);
        setHooksDetected(detectedHooks);
        console.log('检测到的hooks:', detectedHooks);
        
        // 2. 直接使用后端编译服务编译原始代码，让后端进行自动修复
        const compileResult = await api.compileCode(
          testCode, // 发送原始代码，不进行前端预处理
          [], 
          { 
            enableAutoFix: true, 
            enableImportFix: true, 
            outputType: 'js' 
          }
        );
        
        if (compileResult.success && compileResult.data) {
          // 显示后端修复后的代码
          if (compileResult.data.fixedCode) {
            setSupplementedCode(compileResult.data.fixedCode);
            
            // 分析后端的修复结果
            const backendDetectedHooks = detectUsedHooks(compileResult.data.fixedCode);
            const originalHooks = detectUsedHooks(testCode);
            const supplementedByBackend = backendDetectedHooks.filter(hook => !originalHooks.includes(hook));
            setSupplementedHooks(supplementedByBackend);
            
            console.log('后端修复后的代码:\n', compileResult.data.fixedCode);
            console.log('后端补全的hooks:', supplementedByBackend);
          } else {
            setSupplementedCode(testCode);
            setSupplementedHooks([]);
          }
          
          // 设置编译后的代码
          if (compileResult.data.compiledCode) {
            setCompiledCode(compileResult.data.compiledCode);
            
            // 处理编译后的代码
            const processed = processImports(compileResult.data.compiledCode);
            setProcessedCode(processed);
          }
        } else {
          throw new Error(compileResult.error || '编译失败');
        }
        
        console.log('=== 后端React Hooks自动补全测试完成 ===');
      } else {
        // 图标测试逻辑 - 使用后端编译服务
        const compileResult = await api.compileCode(
          testCode, 
          [], 
          { 
            enableAutoFix: true, 
            enableImportFix: true, 
            outputType: 'js' 
          }
        );
        
        if (compileResult.success && compileResult.data?.compiledCode) {
          setCompiledCode(compileResult.data.compiledCode);
          
          const processed = processImports(compileResult.data.compiledCode);
          setProcessedCode(processed);
        } else {
          throw new Error(compileResult.error || '编译失败');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '编译失败');
    } finally {
      setCompiling(false);
    }
  };

  // 切换测试模式
  const switchToHooksTest = () => {
    setTestMode('hooks');
    setTestCode(`// 测试React hooks自动补全 - 包含泛型语法
function MyComponent() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    console.log('Component mounted');
    if (nameRef.current) {
      nameRef.current.focus();
    }
  }, []);
  
  const memoizedValue = useMemo(() => {
    return count * 2;
  }, [count]);
  
  const handleSubmit = useCallback(() => {
    console.log('Form submitted');
  }, []);
  
  return (
    <div ref={containerRef}>
      <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} />
      <p>Count: {count}, Double: {memoizedValue}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

export default MyComponent;`);
  };

  const switchToIconsTest = () => {
    setTestMode('icons');
    setTestCode(`import React, { useState } from 'react';
import { Bot, Heart, Star, Coffee } from 'lucide-react';

export default function IconTest() {
  const [count, setCount] = useState(0);
  
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>智能图标导入测试</h1>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
        <Bot size={32} color="#4c63d4" />
        <Heart size={32} color="#e91e63" />
        <Star size={32} color="#ffc107" />
        <Coffee size={32} color="#8d6e63" />
      </div>
      <p>计数: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        增加计数
      </button>
    </div>
  );
}`);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">TSX 编译调试</h1>
          <div className="flex gap-2">
            <Button 
              variant={testMode === 'hooks' ? 'default' : 'outline'}
              onClick={switchToHooksTest}
            >
              React Hooks 测试
            </Button>
            <Button 
              variant={testMode === 'icons' ? 'default' : 'outline'}
              onClick={switchToIconsTest}
            >
              图标导入测试
            </Button>
          </div>
        </div>
        
        {testMode === 'hooks' ? (
          // React Hooks 测试模式
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xl font-semibold mb-4">1. 原始 TSX 代码</h2>
                <textarea 
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  className="w-full h-64 p-4 bg-muted rounded-lg text-sm font-mono border resize-none"
                  placeholder="在此输入 TSX 代码..."
                />
              </div>
              
              <div>
                <h2 className="text-xl font-semibold mb-4">2. 自动补全后的代码</h2>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto h-64 border">
                  {supplementedCode || '点击测试按钮查看结果...'}
                </pre>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xl font-semibold mb-4">3. esbuild 编译结果</h2>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto h-64 border">
                  {compiledCode || '等待编译完成...'}
                </pre>
              </div>
              
              <div>
                <h2 className="text-xl font-semibold mb-4">4. 处理后的执行代码</h2>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto h-64 border">
                  {processedCode || '等待编译完成...'}
                </pre>
              </div>
            </div>

            {/* Hooks 检测结果显示 */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-3">🔍 Hooks 检测结果</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm mb-2">检测到的 Hooks:</h4>
                  <div className="flex flex-wrap gap-1">
                    {hooksDetected.length > 0 ? (
                      hooksDetected.map(hook => (
                        <span key={hook} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                          {hook}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm">暂无检测结果</span>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-2">自动补全的 Hooks:</h4>
                  <div className="flex flex-wrap gap-1">
                    {supplementedHooks.length > 0 ? (
                      supplementedHooks.map(hook => (
                        <span key={hook} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                          {hook}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm">无需补全</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 预设测试用例按钮 */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-3">🧪 预设测试用例</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTestCode(`// 测试用例1: 缺失所有hooks导入
function TestComponent() {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    console.log('mounted');
  }, []);
  
  return <div ref={ref}>Count: {count}</div>;
}`)}
                  className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded hover:bg-blue-200"
                >
                  缺失所有导入
                </button>
                <button
                  onClick={() => setTestCode(`// 测试用例2: 部分缺失hooks导入
import { useState } from 'react';

function TestComponent() {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const memoValue = useMemo(() => count * 2, [count]);
  
  useEffect(() => {
    console.log('mounted');
  }, []);
  
  return <div ref={ref}>Count: {count}, Double: {memoValue}</div>;
}`)}
                  className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded hover:bg-yellow-200"
                >
                  部分缺失导入
                </button>
                <button
                  onClick={() => setTestCode(`// 测试用例3: 完整导入但测试检测
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

function TestComponent() {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const memoValue = useMemo(() => count * 2, [count]);
  
  useEffect(() => {
    console.log('mounted');
  }, []);
  
  const handleClick = useCallback(() => {
    setCount(c => c + 1);
  }, []);
  
  return <div ref={ref} onClick={handleClick}>Count: {count}, Double: {memoValue}</div>;
}`)}
                  className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded hover:bg-green-200"
                >
                  完整导入测试
                </button>
                <button
                  onClick={() => setTestCode(`// 测试用例4: 复杂泛型语法
function ComplexComponent() {
  const [state, setState] = useState<{name: string; age: number}>({name: '', age: 0});
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const context = useContext<any>(MyContext);
  
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  const reducer = useReducer<any, any>((state, action) => state, {});
  
  return (
    <form ref={formRef}>
      <input ref={inputRef} />
    </form>
  );
}`)}
                  className="px-3 py-1 bg-purple-100 text-purple-800 text-xs rounded hover:bg-purple-200"
                >
                  复杂泛型语法
                </button>
              </div>
            </div>
          </>
        ) : (
          // 图标测试模式 (原有逻辑)
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">1. 原始 TSX 代码</h2>
              <textarea 
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                className="w-full h-80 p-4 bg-muted rounded-lg text-sm font-mono border resize-none"
                placeholder="在此输入 TSX 代码..."
              />
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-4">2. esbuild 编译结果</h2>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto h-80 border">
                {compiledCode || '点击编译按钮查看结果...'}
              </pre>
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-4">3. 处理后的执行代码</h2>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto h-80 border">
                {processedCode || '等待编译完成...'}
              </pre>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button 
            onClick={handleCompile} 
            disabled={compiling}
            className="px-6"
          >
            {compiling ? '处理中...' : (testMode === 'hooks' ? '测试后端Hooks自动修复' : '开始编译调试')}
          </Button>
          
          {error && (
            <div className="text-destructive text-sm">
              错误: {error}
            </div>
          )}
        </div>

        <div className="mt-8 p-4 bg-muted rounded-lg">
          <h3 className="font-semibold mb-2">
            {testMode === 'hooks' ? '🔧 后端React Hooks 自动修复测试说明:' : '调试说明:'}
          </h3>
          {testMode === 'hooks' ? (
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• <strong>后端检测</strong>: 后端AST分析器自动扫描代码中使用的React hooks</li>
              <li>• <strong>后端修复</strong>: 后端自动添加缺失的hooks到import语句中</li>
              <li>• <strong>编译阶段</strong>: 使用esbuild编译修复后的代码</li>
              <li>• <strong>处理阶段</strong>: 转换为可执行的JavaScript代码</li>
              <li>• <strong>测试用例</strong>: 试试删除import语句中的某些hooks，看后端是否能自动补全！</li>
              <li>• <strong>注意</strong>: 这里测试的是后端的enableAutoFix能力，不使用前端预处理</li>
            </ul>
          ) : (
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• <strong>步骤1</strong>: 原始TSX代码 (支持lucide-react导入)</li>
              <li>• <strong>步骤2</strong>: esbuild编译为JavaScript (JSX转换为React.createElement)</li>
              <li>• <strong>步骤3</strong>: 智能处理import/export，自动生成图标变量声明</li>
              <li>• <strong>最终</strong>: 在iframe中通过new Function()执行，支持所有Lucide图标</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}