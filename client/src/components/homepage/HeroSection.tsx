import { motion } from 'framer-motion';
import { ArrowRight, Play, Code, Share2, Zap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedCard } from '@/components/ui/animated-card';

interface HeroSectionProps {
  onGetStarted: () => void;
  onCreateApp?: () => void;
  onViewAllApps?: () => void;
  onViewFiles?: () => void
}

export function HeroSection({ onCreateApp, onViewAllApps, onViewFiles }: HeroSectionProps) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5" />

      {/* Floating Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-primary/20 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight
            }}
            animate={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        ))}
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          {/* Main Heading */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent mb-6 leading-tight">
              构建、分享{' '}
              <span className="text-primary">Web 应用</span>{' '}
              <span className="text-muted-foreground block">从未如此简单</span>
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            强大的文件分享和 React 应用运行平台。
            零配置，无限可能。
          </motion.p>

          {/* Feature Pills */}
          <motion.div
            className="flex flex-wrap justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            {[
              { icon: <Code className="w-4 h-4" />, text: "实时 TSX/JSX/HTML 执行" },
              { icon: <Share2 className="w-4 h-4" />, text: "即时文件分享" },
              { icon: <Zap className="w-4 h-4" />, text: "实时协作" },
            ].map((feature, index) => (
              <AnimatedCard key={index} animation="hover" intensity="subtle">
                <div className="flex items-center gap-2 px-4 py-2 bg-card/80 backdrop-blur-sm border border-border/40 rounded-full text-sm font-medium">
                  {feature.icon}
                  {feature.text}
                </div>
              </AnimatedCard>
            ))}
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col gap-6 justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            {/* Primary Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              {onCreateApp && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onCreateApp}
                  className="px-8 py-4 text-lg font-semibold group bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 border-0"
                >
                  <Sparkles className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                  创建应用
                </Button>
              )}

              <Button
                variant="outline"
                size="lg"
                onClick={onViewAllApps}
                className="px-8 py-4 text-lg font-semibold group"
              >
                <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                探索应用
              </Button>

              <Button
                size="lg"
                onClick={onViewFiles}
                className="px-8 py-4 text-lg font-semibold group"
              >
                浏览文件
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            {/* Secondary Actions */}

          </motion.div>

          {/* Demo Video Placeholder */}
          <motion.div
            className="mt-16"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8 }}
          >
            <AnimatedCard animation="hover" intensity="medium">
              <div className="relative max-w-4xl mx-auto">
                <div className="aspect-video bg-gradient-to-br from-muted/50 to-muted rounded-xl border border-border/40 shadow-2xl overflow-hidden">
                  <video
                    className="w-full h-full object-cover"
                    controls
                    muted
                    poster="/api/files/demo录屏/InteractiveDemo.mp4"
                  >
                    <source src="https://share.teea.cn/api/files/demo/InteractiveDemo.mp4" type="video/mp4" />
                    您的浏览器不支持视频播放
                  </video>
                </div>

                {/* Floating UI Elements */}
                <div className="absolute -top-4 -right-4 bg-card border border-border/40 rounded-lg p-3 shadow-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-muted-foreground">实时预览</span>
                  </div>
                </div>

                <div className="absolute -bottom-4 -left-4 bg-card border border-border/40 rounded-lg p-3 shadow-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Share2 className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">即时分享</span>
                  </div>
                </div>
              </div>
            </AnimatedCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}