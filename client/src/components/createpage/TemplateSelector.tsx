import React from 'react';
import { motion } from 'framer-motion';
import { Filter, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAllCategories, TEMPLATE_CATEGORIES, isUserAuthenticated } from '@/data/templates';
import { ModernMarkdownViewer } from '@/components/ModernMarkdownViewer';
import { truncateText } from '@/utils/fileUtils';
import { useTemplateState } from '@/contexts/CreatePageContext';
import { TemplateManageDialog } from './TemplateManageDialog';

interface TemplateSelectorProps {
  onCategoryChange: (category: string) => void;
  onCodeLangChange: (codeLang: string) => void;
  onTemplateSelect: (template: any) => void;
  onTemplateChange?: () => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onCategoryChange,
  onCodeLangChange,
  onTemplateSelect,
  onTemplateChange = () => {}
}) => {
  const { templates } = useTemplateState();
  const isAuthenticated = isUserAuthenticated();
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        {/* Header with Manage Button */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">模板选择</h3>
          {isAuthenticated && (
            <TemplateManageDialog onTemplateChange={onTemplateChange}>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
              >
                <Settings className="w-3 h-3 mr-1" />
                管理
              </Button>
            </TemplateManageDialog>
          )}
        </div>
        
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-3">
          {getAllCategories().map((category) => (
            <Button
              key={category}
              variant={templates.category === category ? "default" : "outline"}
              size="sm"
              onClick={() => onCategoryChange(category)}
              className="text-xs h-7"
            >
              {category === 'all' ? '全部' : TEMPLATE_CATEGORIES[category as keyof typeof TEMPLATE_CATEGORIES]?.label || category}
            </Button>
          ))}
        </div>
        
        {/* Code Language Filter */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={templates.codeLangFilter === 'all' ? "default" : "outline"}
            size="sm"
            onClick={() => onCodeLangChange('all')}
            className="text-xs h-6"
          >
            全部语言
          </Button>
          <Button
            variant={templates.codeLangFilter === 'tsx' ? "default" : "outline"}
            size="sm"
            onClick={() => onCodeLangChange('tsx')}
            className="text-xs h-6 bg-blue-100 text-blue-800 hover:bg-blue-200"
          >
            React
          </Button>
          <Button
            variant={templates.codeLangFilter === 'html' ? "default" : "outline"}
            size="sm"
            onClick={() => onCodeLangChange('html')}
            className="text-xs h-6 bg-green-100 text-green-800 hover:bg-green-200"
          >
            HTML
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <div className="space-y-3">
          {templates.filtered.map((template) => (
            <motion.div
              key={template.id}
              className={`p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                templates.selected?.id === template.id ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => onTemplateSelect(template)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="mb-2">
                <h3 className="text-sm font-medium mb-1">{template.title}</h3>
                <div className="flex gap-1 flex-wrap">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${TEMPLATE_CATEGORIES[template.category]?.color || ''}`}
                  >
                    {TEMPLATE_CATEGORIES[template.category]?.icon} {template.category}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                  >
                    {template.difficulty}
                  </Badge>
                  <Badge 
                    variant={template.codeLang === 'html' ? 'default' : 'secondary'}
                    className={`text-xs ${template.codeLang === 'html' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}
                  >
                    {template.codeLang === 'html' ? 'HTML' : 'React'}
                  </Badge>
                  {template.isUserTemplate && (
                    <Badge 
                      variant="outline"
                      className="text-xs bg-purple-50 text-purple-700 border-purple-200"
                    >
                      📝 自定义
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mb-2 [&_.wmde-markdown]:!text-xs [&_.wmde-markdown_*]:!text-xs [&_.wmde-markdown]:!leading-tight [&_.wmde-markdown_*]:!leading-tight [&_.wmde-markdown]:!p-0 [&_.wmde-markdown_p]:!m-0 [&_.wmde-markdown_p]:!mb-1 [&_.wmde-markdown_h1]:!text-xs [&_.wmde-markdown_h2]:!text-xs [&_.wmde-markdown_h3]:!text-xs [&_.wmde-markdown_h4]:!text-xs [&_.wmde-markdown_h5]:!text-xs [&_.wmde-markdown_h6]:!text-xs [&_.wmde-markdown_ul]:!text-xs [&_.wmde-markdown_ol]:!text-xs [&_.wmde-markdown_li]:!text-xs [&_.wmde-markdown_strong]:!text-xs [&_.wmde-markdown_em]:!text-xs [&_.wmde-markdown_code]:!text-[10px] [&_.wmde-markdown_blockquote]:!text-xs">
                <ModernMarkdownViewer 
                  content={truncateText(template.description)} 
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {template.tags.map((tag) => (
                  <span 
                    key={tag}
                    className="text-xs px-2 py-1 bg-muted/50 rounded-full text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
        
        {templates.filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>未找到模板</p>
            <p className="text-sm mt-2">请尝试选择其他分类</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(TemplateSelector);