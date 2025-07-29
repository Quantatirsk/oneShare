import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutTemplate, Sparkles, BookmarkPlus, Wand2 } from 'lucide-react';
import { LottieLoader, LottieGift } from '@/components/common/LottieAnimations';
import { useCodeState, useConversationState, useTemplateState, useAPIState } from '@/contexts/CreatePageContext';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { TemplateSelector } from './TemplateSelector';
import { createUserTemplate, isUserAuthenticated } from '@/data/templates';
import { callOpenAI } from '@/lib/llmWrapper';

// Template Library Button Component
const TemplateLibraryButton: React.FC<{
  onTemplateSelect: (template: any) => void;
  onCategoryChange: (category: string) => void;
  onCodeLangFilterChange: (codeLang: string) => void;
  onTemplateChange?: () => void;
  isMobile: boolean;
}> = ({ onTemplateSelect, onCategoryChange, onCodeLangFilterChange, onTemplateChange, isMobile }) => {
  const [open, setOpen] = React.useState(false);
  
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 400, damping: 25 }}
        >
          <Button
            size={isMobile ? "default" : "lg"}
            className={`
              ${isMobile ? 'h-12 px-6' : 'h-14 px-8'} 
              rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 
              bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 
              hover:from-purple-600 hover:via-indigo-600 hover:to-blue-600 
              border-0 font-semibold text-white
            `}
          >
            <motion.div
              className="flex items-center gap-3"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <LayoutTemplate className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'}`} />
              <span className={`${isMobile ? 'text-sm' : 'text-base'}`}>
                浏览模板库
              </span>
            </motion.div>
          </Button>
        </motion.div>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            模板库
          </SheetTitle>
          <SheetDescription>
            选择一个模板快速开始创建您的应用
          </SheetDescription>
        </SheetHeader>
        <div className="h-[calc(100vh-120px)]">
          <TemplateSelector
            onCategoryChange={onCategoryChange}
            onCodeLangChange={onCodeLangFilterChange}
            onTemplateSelect={(template) => {
              onTemplateSelect(template);
              setOpen(false); // Close sheet after selection
            }}
            onTemplateChange={onTemplateChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Save as Template Button Component
const SaveAsTemplateButton: React.FC<{
  onTemplateChange?: () => void;
  isMobile: boolean;
}> = ({ onTemplateChange, isMobile }) => {
  const { code } = useCodeState();
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isAIFilling, setIsAIFilling] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'other',
    difficulty: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    tags: ''
  });

  const isAuthenticated = isUserAuthenticated();

  // AI填充表单功能
  const handleAIFill = async () => {
    if (!code.current) return;
    
    setIsAIFilling(true);
    try {
      // 调用LLM API
      const aiResponse = await callOpenAI([
        {
          role: 'system',
          content: `你是一个专业的前端代码分析师，专门分析代码并提取模板元数据。你需要：

1. 分析代码的功能、用途、技术特点
2. 严格按照JSON格式输出，不要添加任何解释文字
3. description必须控制在100字以内
4. category必须从以下选项中选择：game、dashboard、utility、creative、business、design、other
5. difficulty必须从以下选项中选择：beginner、intermediate、advanced
6. tags应该包含主要技术栈和功能特点

输出格式：
{
  "title": "模板标题，简洁明了，15字以内",
  "description": "模板描述，说明功能和特点，限制100字以内",
  "category": "分类",
  "difficulty": "难度",
  "tags": "相关标签，用逗号分隔"
}`
        },
        {
          role: 'user',
          content: `请分析以下代码并提取模板元数据：
\`\`\`${code.language}
${code.current}
\`\`\`
请直接返回JSON格式的元数据，不要添加任何其他文字。
`
        }
      ]);

      // 解析AI返回的JSON
      let parsedData;
      try {
        // 清理可能的markdown代码块标记
        const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
        parsedData = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('JSON解析失败:', parseError);
        throw new Error('AI返回的数据格式不正确');
      }

      // 验证并设置表单数据
      setFormData({
        title: parsedData.title || '',
        description: parsedData.description || '',
        category: ['game', 'dashboard', 'utility', 'creative', 'business', 'design', 'other'].includes(parsedData.category) 
          ? parsedData.category : 'other',
        difficulty: ['beginner', 'intermediate', 'advanced'].includes(parsedData.difficulty) 
          ? parsedData.difficulty as 'beginner' | 'intermediate' | 'advanced' : 'beginner',
        tags: parsedData.tags || ''
      });

    } catch (error) {
      console.error('AI填充失败:', error);
      alert(`AI填充失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsAIFilling(false);
    }
  };


  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert('请输入模板标题');
      return;
    }

    setIsSaving(true);
    try {
      const templateData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        codeLang: code.language,
        difficulty: formData.difficulty,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        code: code.current
      };

      await createUserTemplate(templateData);
      onTemplateChange?.();
      setShowForm(false);
      setFormData({
        title: '',
        description: '',
        category: 'other',
        difficulty: 'beginner',
        tags: ''
      });
      alert('模板保存成功！');
    } catch (error) {
      alert(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated || !code.current) {
    return null;
  }

  return (
    <>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 400, damping: 25 }}
        className="absolute bottom-4 right-4 z-20"
      >
        <Button
          onClick={() => setShowForm(true)}
          size={isMobile ? "sm" : "default"}
          className="rounded-full shadow-lg hover:shadow-xl transition-all duration-300 bg-green-500 hover:bg-green-600 text-white"
        >
          <BookmarkPlus className="w-4 h-4 mr-2" />
          {!isMobile && "保存为模板"}
        </Button>
      </motion.div>

      {/* Save Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">保存为模板</h3>
              <Button
                onClick={handleAIFill}
                disabled={isAIFilling || !code.current}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Wand2 className={`w-4 h-4 ${isAIFilling ? 'animate-spin' : ''}`} />
                {isAIFilling ? 'AI分析中...' : 'AI填充'}
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="输入模板标题"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
                  rows={3}
                  placeholder="描述这个模板的用途和特点"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">分类</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border rounded-md px-3 py-2"
                  >
                    <option value="game">🎮 游戏</option>
                    <option value="dashboard">📊 仪表板</option>
                    <option value="utility">🛠️ 工具</option>
                    <option value="creative">✨ 创意</option>
                    <option value="business">💼 商务</option>
                    <option value="design">🎨 设计</option>
                    <option value="other">📱 其他</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">难度</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
                    className="w-full border rounded-md px-3 py-2"
                  >
                    <option value="beginner">初级</option>
                    <option value="intermediate">中级</option>
                    <option value="advanced">高级</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">标签</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="用逗号分隔，如：按钮, 表单, 响应式"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleSave}
                disabled={isSaving || !formData.title.trim()}
                className="flex-1"
              >
                {isSaving ? '保存中...' : '保存'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={isSaving}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface PreviewRendererProps {
  previewContainerRef: React.RefObject<HTMLDivElement>;
  isMobile?: boolean;
  onTemplateSelect?: (template: any) => void;
  onCategoryChange?: (category: string) => void;
  onCodeLangFilterChange?: (codeLang: string) => void;
  onTemplateChange?: () => void;
}

export const PreviewRenderer: React.FC<PreviewRendererProps> = ({
  previewContainerRef,
  isMobile = false,
  onTemplateSelect,
  onCategoryChange,
  onCodeLangFilterChange,
  onTemplateChange
}) => {
  const { code } = useCodeState();
  const { conversation } = useConversationState();
  const { templates } = useTemplateState();
  const { api } = useAPIState();
  
  // 状态优先级：模板加载 > 代码生成 > 渲染中 > 空状态
  const showTemplateLoadingState = templates.isLoading;
  // 修改：只有在没有已渲染内容时才显示生成状态loader
  const showGeneratingState = conversation.stage === 'generating' && !templates.isLoading && !code.hasPreviewContent;
  const showRenderingState = code.isRendering && !templates.isLoading && conversation.stage !== 'generating';
  const showEmptyState = !code.hasPreviewContent && !code.current && !code.isRendering && conversation.stage !== 'generating' && !templates.isLoading;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Preview Area */}
      <div className="flex-1 bg-white overflow-hidden relative">
        <div 
          ref={previewContainerRef} 
          className="w-full h-full overflow-auto scrollbar-hide"
          style={{ minHeight: isMobile ? '200px' : '400px' }}
        />
        
        {showEmptyState && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-white z-10">
            <div className="text-center -mt-20">
              <LottieGift size={isMobile ? 140 : 200} className="mx-auto mb-6 opacity-80" />
              <p className={`text-muted-foreground font-medium mb-3 ${isMobile ? 'text-base font-semibold' : 'text-xl font-semibold'}`}>
                从零开始构建或选择模板⬇️
              </p>
              <p className={`text-muted-foreground/70 mb-6 ${isMobile ? 'text-sm' : 'text-base'}`}>
                用AI技术实现你的创意构想
              </p>
            </div>
            
            {/* Template Selector Button - positioned in vertical center */}
            {onTemplateSelect && onCategoryChange && onCodeLangFilterChange && (
              <TemplateLibraryButton 
                onTemplateSelect={onTemplateSelect}
                onCategoryChange={onCategoryChange}
                onCodeLangFilterChange={onCodeLangFilterChange}
                onTemplateChange={onTemplateChange}
                isMobile={isMobile}
              />
            )}
          </div>
        )}

        {showGeneratingState && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-white z-10">
            <div className="text-center">
              <LottieLoader size={isMobile ? 120 : 160} className="mx-auto mb-6" model={api.selectedModel} />
              <p className={`text-muted-foreground font-medium ${isMobile ? 'text-base' : 'text-lg'}`}>
                {code.isStreaming ? '正在生成代码...' : '正在准备生成...'}
              </p>
              <p className={`text-muted-foreground/70 mt-3 ${isMobile ? 'text-sm' : 'text-base'}`}>
                {code.isStreaming ? 'AI正在为您编写应用代码' : '即将开始代码生成'}
              </p>
            </div>
          </div>
        )}

        {showTemplateLoadingState && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-white z-10">
            <div className="text-center">
              <LottieLoader size={isMobile ? 120 : 160} className="mx-auto mb-6" model={api.selectedModel} />
              <p className={`text-muted-foreground font-medium ${isMobile ? 'text-base' : 'text-lg'}`}>
                正在加载模板...
              </p>
              <p className={`text-muted-foreground/70 mt-3 ${isMobile ? 'text-sm' : 'text-base'}`}>
                即将为您展示模板内容
              </p>
            </div>
          </div>
        )}

        {showRenderingState && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-white z-10">
            <div className="text-center">
              <LottieLoader size={isMobile ? 120 : 160} className="mx-auto mb-6" model={api.selectedModel} />
              <p className={`text-muted-foreground font-medium ${isMobile ? 'text-base' : 'text-lg'}`}>
                正在渲染页面...
              </p>
              <p className={`text-muted-foreground/70 mt-3 ${isMobile ? 'text-sm' : 'text-base'}`}>
                即将为您展示编译结果
              </p>
            </div>
          </div>
        )}
        
        {/* Save as Template Button - Show when there's content to save */}
        {code.hasPreviewContent && (
          <SaveAsTemplateButton 
            onTemplateChange={onTemplateChange}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(PreviewRenderer);