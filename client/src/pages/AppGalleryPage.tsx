import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Code, 
  FileText, 
  Calculator,
  Sparkles,
  RefreshCw,
  Grid3X3,
  Eye,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCard } from '@/components/ui/animated-card';
import { 
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';

interface AppItem {
  id: string;
  title: string;
  description: string;
  category: 'html' | 'tsx' | 'jsx' | 'other';
  shareId: string;
  filename: string;
  previewUrl: string;
  isPublic: boolean;
  createdAt: string;
}

const categoryIcons = {
  html: <FileText className="w-4 h-4" />,
  tsx: <Code className="w-4 h-4" />,
  jsx: <Code className="w-4 h-4" />,
  other: <Calculator className="w-4 h-4" />
};

const categoryColors = {
  html: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  tsx: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', 
  jsx: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
};


export function AppGalleryPage() {
  const ref = useRef(null);
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  
  
  
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const categories = ['all', 'html', 'tsx', 'jsx', 'other'];
  const ITEMS_PER_PAGE = 6;

  // 从文件名推断应用类型和信息
  const inferAppInfo = useCallback((filename: string, shareId: string): Omit<AppItem, 'shareId' | 'isPublic' | 'createdAt'> => {
    const baseName = filename.split('/').pop() || filename;
    const nameWithoutExt = baseName.substring(0, baseName.lastIndexOf('.')) || baseName;
    const ext = baseName.toLowerCase().split('.').pop() || '';
    
    let category: AppItem['category'] = 'other';
    let title = nameWithoutExt;
    let description = `${ext.toUpperCase()} application`;
    
    if (['html', 'htm'].includes(ext)) {
      category = 'html';
      description = 'Interactive HTML web application';
    } else if (ext === 'tsx') {
      category = 'tsx';
      description = 'React TypeScript component application';
    } else if (ext === 'jsx') {
      category = 'jsx'; 
      description = 'React JavaScript component application';
    }

    // 改进标题显示
    if (title.toLowerCase().includes('game')) {
      title = title.replace(/game/gi, 'Game');
      description = 'Interactive game application';
    } else if (title.toLowerCase().includes('dashboard')) {
      title = title.replace(/dashboard/gi, 'Dashboard');
      description = 'Data visualization dashboard';
    } else if (title.toLowerCase().includes('component')) {
      title = title.replace(/component/gi, 'Component');
    }

    return {
      id: shareId,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      description,
      category,
      filename,
      previewUrl: `/app/${shareId}`
    };
  }, []);

  // 获取公开的分享应用列表
  const loadPublicApps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 获取公开文件列表 (使用现有的 listUnifiedFiles API)
      const response = await api.listUnifiedFiles('', 'public');
      
      if (response.success && response.data) {
        const files = response.data.files || [];
        
        // 筛选出应用类型的文件
        const appFileTypes = ['html', 'htm', 'tsx', 'jsx'];
        const appFiles = files.filter((file: any) => {
          if (file.type === 'directory') return false;
          const ext = file.filename.toLowerCase().split('.').pop() || '';
          return appFileTypes.includes(ext);
        });
        
        // 为每个应用文件创建分享链接并构建应用项
        const appItems: AppItem[] = [];
        
        for (const file of appFiles) {
          try {
            // 为文件创建分享链接
            const shareResponse = await api.createShare(file.filename, true);
            if (shareResponse.success) {
              const appInfo = inferAppInfo(file.filename, shareResponse.share_id);
              appItems.push({
                ...appInfo,
                shareId: shareResponse.share_id,
                isPublic: true,
                createdAt: shareResponse.created_at
              });
            }
          } catch (shareError) {
            console.warn(`创建分享链接失败 for ${file.filename}:`, shareError);
            // 跳过这个文件，继续处理其他文件
          }
        }
        
        setApps(appItems);
        
        if (appItems.length === 0) {
          toast({
            title: "暂无应用",
            description: "目前没有公开的应用文件，请先上传一些HTML、TSX或JSX文件",
            duration: 3000,
          });
        }
      } else {
        throw new Error(response.error || '获取文件列表失败');
      }
    } catch (error) {
      console.error('加载应用列表失败:', error);
      
      // 发生错误时使用演示数据
      const demoApps: AppItem[] = [
        {
          id: 'demo-snake',
          title: 'Snake Game',
          description: 'Classic snake game with modern animations and controls',
          category: 'html',
          shareId: 'demo-snake-share',
          filename: 'SnakeGame.html',
          previewUrl: '/app/demo-snake-share',
          isPublic: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo-dashboard',
          title: 'Analytics Dashboard',
          description: 'Real-time data visualization dashboard component',
          category: 'tsx',
          shareId: 'demo-dashboard-share',
          filename: 'Dashboard.tsx',
          previewUrl: '/app/demo-dashboard-share',
          isPublic: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo-palette',
          title: 'Color Palette Generator',
          description: 'Interactive color palette and theme generator tool',
          category: 'jsx',
          shareId: 'demo-palette-share', 
          filename: 'ColorPalette.jsx',
          previewUrl: '/app/demo-palette-share',
          isPublic: true,
          createdAt: new Date().toISOString()
        }
      ];
      setApps(demoApps);
      
      toast({
        title: "使用演示数据", 
        description: "无法获取真实应用列表，展示演示应用",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [api, inferAppInfo, toast]);

  useEffect(() => {
    loadPublicApps();
  }, [loadPublicApps]);

  const filteredApps = selectedCategory === 'all' 
    ? apps 
    : apps.filter(app => app.category === selectedCategory);

  // 分页逻辑
  const totalPages = Math.ceil(filteredApps.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentApps = filteredApps.slice(startIndex, endIndex);

  // 重置分页当分类改变时
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory]);

  const handleTryApp = useCallback((shareId: string) => {
    const previewUrl = `/app/${shareId}`;
    window.open(previewUrl, '_blank');
  }, []);

  const handleRefresh = useCallback(() => {
    loadPublicApps();
  }, [loadPublicApps]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-muted-foreground">加载应用中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 h-12 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="h-full flex items-center px-4 relative overflow-hidden">
          {/* 网站名称 */}
          <div className="flex items-center">
            <button 
              onClick={() => window.location.href = '/'}
              className="text-xl font-semibold text-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-2"
            >
              <Share2 size={20} />
              OneShare
            </button>
          </div>
          
          {/* 中间标题显示 - 居中 */}
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-primary" />
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                App Gallery
              </span>
            </div>
          </div>

          {/* 右侧刷新按钮 */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

        </div>
      </header>

      {/* Main Content */}
      <section ref={ref} className="pt-16 pb-8 bg-gradient-to-b from-muted/30 to-muted/10">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Discover Amazing{' '}
              <span className="text-primary">Applications</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Explore Interactive Web Applications. Click on any app to see it in Action!
            </p>
          </motion.div>

          {/* Category Filter */}
          <motion.div
            className="flex flex-wrap justify-center gap-2 mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="capitalize gap-2"
              >
                {category !== 'all' && categoryIcons[category as keyof typeof categoryIcons]}
                {category === 'all' ? 'All Apps' : category.toUpperCase()}
              </Button>
            ))}
          </motion.div>

          {/* Error State */}
          {error && (
            <div className="text-center py-12">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={handleRefresh} variant="outline">
                重试
              </Button>
            </div>
          )}

          {/* Apps Grid */}
          {!error && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {currentApps.map((app, index) => (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                >
                  <AnimatedCard animation="hover" intensity="medium" className="h-full bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-md">
                    <div className="relative overflow-hidden rounded-md">
                      {/* App Preview with iframe */}
                      <div className="h-64 bg-white relative overflow-hidden rounded-t-md">
                        {/* Mini iframe preview */}
                        <div className="absolute inset-0 bg-white rounded-t-md overflow-hidden">
                          <iframe
                            src={`${app.previewUrl}${app.previewUrl.includes('?') ? '&' : '?'}muted=true&autoplay=false&gallery=true`}
                            className="w-full h-full border-0 pointer-events-none transform scale-50 origin-top-left"
                            style={{ 
                              width: '200%', 
                              height: '200%',
                              pointerEvents: 'none'
                            }}
                            title={`${app.title} preview`}
                            loading="lazy"
                            allow=""
                            sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-top-navigation-by-user-activation allow-downloads allow-pointer-lock allow-presentation allow-orientation-lock allow-storage-access-by-user-activation"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>

                      {/* App Info */}
                      <div className="p-4">
                        {/* Title and Category */}
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-foreground truncate">
                            {app.title}
                          </h3>
                          <Badge className={categoryColors[app.category]} variant="secondary">
                            {categoryIcons[app.category]}
                            <span className="ml-1 text-xs uppercase">{app.category}</span>
                          </Badge>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleTryApp(app.shareId)}
                            className="flex-1"
                            size="sm"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Open App
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const codeUrl = `/s/${app.shareId}`;
                              window.open(codeUrl, '_blank');
                            }}
                          >
                            <Code className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </AnimatedCard>
                </motion.div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!error && !loading && filteredApps.length > 0 && totalPages > 1 && (
            <div className="mt-12 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) {
                          setCurrentPage(currentPage - 1);
                        }
                      }}
                      className={currentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  
                  {/* Page Numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current page
                    if (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1
                    ) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }
                    
                    // Show ellipsis for gaps
                    if (page === 2 && currentPage > 4) {
                      return (
                        <PaginationItem key="ellipsis-start">
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    
                    if (page === totalPages - 1 && currentPage < totalPages - 3) {
                      return (
                        <PaginationItem key="ellipsis-end">
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    
                    return null;
                  })}

                  <PaginationItem>
                    <PaginationNext 
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) {
                          setCurrentPage(currentPage + 1);
                        }
                      }}
                      className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}

          {/* Empty State */}
          {!error && !loading && filteredApps.length === 0 && (
            <div className="text-center py-12">
              <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No apps found</h3>
              <p className="text-muted-foreground mb-4">
                {selectedCategory === 'all' 
                  ? 'No applications available yet. Check back later!' 
                  : `No ${selectedCategory.toUpperCase()} applications found. Try a different category.`
                }
              </p>
              <Button onClick={() => setSelectedCategory('all')} variant="outline">
                Show All Apps
              </Button>
            </div>
          )}

        </div>
      </section>
    </div>
  );
}