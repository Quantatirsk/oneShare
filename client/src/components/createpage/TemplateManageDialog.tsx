import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  X, 
  Loader2,
  User,
  Crown
} from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import { 
  Template, 
  TemplateCreateRequest, 
  TEMPLATE_CATEGORIES,
  getUserTemplates,
  createUserTemplate,
  updateUserTemplate,
  deleteUserTemplate,
  isUserAuthenticated
} from '@/data/templates';

interface TemplateManageDialogProps {
  onTemplateChange: () => void;
  children: React.ReactNode;
}

interface TemplateFormData {
  title: string;
  description: string;
  category: string;
  codeLang: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string;
  code: string;
  preview?: string;
}

const initialFormData: TemplateFormData = {
  title: '',
  description: '',
  category: 'other',
  codeLang: 'html',
  difficulty: 'beginner',
  tags: '',
  code: '',
  preview: '',
};

export const TemplateManageDialog: React.FC<TemplateManageDialogProps> = ({
  onTemplateChange,
  children
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [userTemplates, setUserTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 表单状态
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(initialFormData);

  const isAuthenticated = isUserAuthenticated();

  // 加载用户模板
  const loadUserTemplates = async () => {
    if (!isAuthenticated) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const templates = await getUserTemplates();
      setUserTemplates(templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载模板失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 打开对话框时加载数据
  useEffect(() => {
    if (isOpen) {
      loadUserTemplates();
    }
  }, [isOpen]);

  // 重置表单
  const resetForm = () => {
    setFormData(initialFormData);
    setEditingTemplate(null);
    setIsFormOpen(false);
  };

  // 打开新建表单
  const handleCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  // 打开编辑表单
  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      title: template.title,
      description: template.description,
      category: template.category,
      codeLang: template.codeLang,
      difficulty: template.difficulty,
      tags: template.tags.join(', '),
      code: template.code,
      preview: template.preview || '',
    });
    setIsFormOpen(true);
  };

  // 删除模板
  const handleDelete = async (template: Template) => {
    if (!confirm(`确定要删除模板"${template.title}"吗？此操作不可撤销。`)) {
      return;
    }

    setIsFormLoading(true);
    try {
      await deleteUserTemplate(template.id);
      await loadUserTemplates();
      onTemplateChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败');
    } finally {
      setIsFormLoading(false);
    }
  };

  // 保存模板
  const handleSave = async () => {
    if (!formData.title.trim() || !formData.code.trim()) {
      setError('标题和代码是必填项');
      return;
    }

    setIsFormLoading(true);
    setError(null);

    try {
      const templateData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        codeLang: formData.codeLang,
        difficulty: formData.difficulty,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        code: formData.code,
        preview: formData.preview || undefined,
      };

      if (editingTemplate) {
        // 更新模板
        await updateUserTemplate(editingTemplate.id, templateData);
      } else {
        // 创建新模板
        await createUserTemplate(templateData as TemplateCreateRequest);
      }

      await loadUserTemplates();
      onTemplateChange();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setIsFormLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>模板管理</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 text-muted-foreground">
            <Crown className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>需要认证后才能管理模板</p>
            <p className="text-sm mt-2">请先进行身份验证</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>模板管理</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex gap-4 min-h-0">
          {/* 左侧：模板列表 */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">我的模板</h3>
              <Button onClick={handleCreate} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                新建模板
              </Button>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mb-4">
                {error}
              </div>
            )}
            
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="ml-2 text-muted-foreground">加载中...</span>
                </div>
              ) : userTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>暂无自定义模板</p>
                  <p className="text-sm mt-2">点击"新建模板"创建第一个模板</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{template.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {template.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(template)}
                            disabled={isFormLoading}
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template)}
                            disabled={isFormLoading}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-wrap">
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${TEMPLATE_CATEGORIES[template.category as keyof typeof TEMPLATE_CATEGORIES]?.color || ''}`}
                        >
                          {TEMPLATE_CATEGORIES[template.category as keyof typeof TEMPLATE_CATEGORIES]?.icon} {template.category}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {template.difficulty}
                        </Badge>
                        <Badge 
                          variant={template.codeLang === 'html' ? 'default' : 'secondary'}
                          className={`text-xs ${template.codeLang === 'html' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}
                        >
                          {template.codeLang === 'html' ? 'HTML' : 'React'}
                        </Badge>
                      </div>
                      
                      {template.tags.length > 0 && (
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {template.tags.map((tag) => (
                            <span 
                              key={tag}
                              className="text-xs px-2 py-1 bg-muted/50 rounded-full text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          
          {/* 右侧：表单 */}
          <AnimatePresence>
            {isFormOpen && (
              <motion.div
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 300, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-96 border-l pl-4 flex flex-col min-h-0"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">
                    {editingTemplate ? '编辑模板' : '新建模板'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetForm}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title">标题 *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="输入模板标题"
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="description">描述</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="输入模板描述"
                        className="mt-1"
                        rows={3}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="category">分类</Label>
                        <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="选择分类" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(TEMPLATE_CATEGORIES).map(([key, cat]) => (
                              <SelectItem key={key} value={key}>
                                {cat.icon} {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="codeLang">语言</Label>
                        <Select value={formData.codeLang} onValueChange={(value) => setFormData({ ...formData, codeLang: value })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="选择语言" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="html">HTML</SelectItem>
                            <SelectItem value="tsx">React</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="difficulty">难度</Label>
                      <Select value={formData.difficulty} onValueChange={(value: 'beginner' | 'intermediate' | 'advanced') => setFormData({ ...formData, difficulty: value })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="选择难度" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">初级</SelectItem>
                          <SelectItem value="intermediate">中级</SelectItem>
                          <SelectItem value="advanced">高级</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="tags">标签</Label>
                      <Input
                        id="tags"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder="用逗号分隔，如：按钮, 表单, 响应式"
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="code">代码 *</Label>
                      <Textarea
                        id="code"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        placeholder="输入模板代码"
                        className="mt-1 font-mono text-sm"
                        rows={8}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="preview">预览图片URL</Label>
                      <Input
                        id="preview"
                        value={formData.preview}
                        onChange={(e) => setFormData({ ...formData, preview: e.target.value })}
                        placeholder="可选，输入预览图片链接"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </ScrollArea>
                
                <Separator className="my-4" />
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={isFormLoading || !formData.title.trim() || !formData.code.trim()}
                    className="flex-1"
                  >
                    {isFormLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {editingTemplate ? '更新' : '创建'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={isFormLoading}
                  >
                    取消
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};