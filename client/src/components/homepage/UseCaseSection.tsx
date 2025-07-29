import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  Users, 
  Code, 
  Briefcase, 
  GraduationCap, 
  Palette, 
  Globe,
  ArrowRight,
  CheckCircle
} from 'lucide-react';
import { AnimatedCard } from '@/components/ui/animated-card';
import { Button } from '@/components/ui/button';

interface UseCase {
  icon: React.ReactNode;
  title: string;
  description: string;
  benefits: string[];
  gradient: string;
  examples: string[];
}

const useCases: UseCase[] = [
  {
    icon: <Code className="w-8 h-8" />,
    title: "开发者原型设计",
    description: "快速原型设计和分享 React 组件，无需繁琐的设置。",
    benefits: [
      "无需配置",
      "即时实时预览",
      "轻松团队分享",
      "版本控制集成"
    ],
    gradient: "from-blue-500 to-cyan-500",
    examples: [
      "UI 组件库",
      "交互演示",
      "代码片段",
      "API 集成"
    ]
  },
  {
    icon: <Users className="w-8 h-8" />,
    title: "团队协作",
    description: "与您的团队实时协作处理代码和文件。",
    benefits: [
      "实时编辑",
      "共享工作区",
      "权限控制",
      "活动跟踪"
    ],
    gradient: "from-purple-500 to-pink-500",
    examples: [
      "设计评审",
      "结对编程",
      "文档协作",
      "项目规划"
    ]
  },
  {
    icon: <Briefcase className="w-8 h-8" />,
    title: "商业应用",
    description: "即时创建和部署商业工具和仪表板。",
    benefits: [
      "无需托管",
      "安全数据处理",
      "自定义品牌",
      "API 集成"
    ],
    gradient: "from-green-500 to-emerald-500",
    examples: [
      "销售仪表板",
      "报告生成器",
      "数据可视化",
      "内部工具"
    ]
  },
  {
    icon: <GraduationCap className="w-8 h-8" />,
    title: "教育学习",
    description: "分享交互式课程、作业和编程示例。",
    benefits: [
      "交互式学习",
      "轻松分发",
      "进度跟踪",
      "协作项目"
    ],
    gradient: "from-orange-500 to-red-500",
    examples: [
      "编程教程",
      "交互练习",
      "学生作品集",
      "课程材料"
    ]
  },
  {
    icon: <Palette className="w-8 h-8" />,
    title: "创意展示",
    description: "展示您的创意作品和交互艺术项目。",
    benefits: [
      "作品集托管",
      "交互演示",
      "轻松更新",
      "专业网址"
    ],
    gradient: "from-pink-500 to-rose-500",
    examples: [
      "交互艺术",
      "设计作品集",
      "动画演示",
      "创意实验"
    ]
  },
  {
    icon: <Globe className="w-8 h-8" />,
    title: "内容分发",
    description: "与全球受众分享文件、媒体和应用程序。",
    benefits: [
      "全球 CDN",
      "安全分享",
      "分析跟踪",
      "自定义域名"
    ],
    gradient: "from-indigo-500 to-purple-500",
    examples: [
      "媒体分发",
      "软件发布",
      "文档分享",
      "公共档案"
    ]
  }
];

interface UseCaseSectionProps {
  onGetStarted: () => void;
}

export function UseCaseSection({ onGetStarted }: UseCaseSectionProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-24 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            完美适用于{' '}
            <span className="text-primary">各种使用场景</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            无论您是开发者、教育工作者还是商业专业人士，
            OneShare 都能适应您的工作流程并提升您的生产力。
          </p>
        </motion.div>

        {/* Use Cases Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {useCases.map((useCase, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <AnimatedCard animation="hover" intensity="medium" className="h-full">
                <div className="p-6 h-full flex flex-col">
                  {/* Icon Header */}
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br ${useCase.gradient} text-white mb-6 shadow-lg`}>
                    {useCase.icon}
                  </div>

                  {/* Title and Description */}
                  <h3 className="text-xl font-semibold mb-3 text-foreground">
                    {useCase.title}
                  </h3>
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    {useCase.description}
                  </p>

                  {/* Benefits */}
                  <div className="mb-6 flex-1">
                    <h4 className="font-medium mb-3 text-foreground">主要优势：</h4>
                    <ul className="space-y-2">
                      {useCase.benefits.map((benefit, benefitIndex) => (
                        <li key={benefitIndex} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Examples */}
                  <div>
                    <h4 className="font-medium mb-3 text-foreground">使用场景：</h4>
                    <div className="flex flex-wrap gap-2">
                      {useCase.examples.map((example, exampleIndex) => (
                        <span
                          key={exampleIndex}
                          className="px-2 py-1 text-xs bg-muted rounded-md text-muted-foreground"
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </AnimatedCard>
            </motion.div>
          ))}
        </div>

        {/* Success Stories Section */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl p-8 md:p-12">
            <h3 className="text-2xl md:text-3xl font-bold mb-6">
              准备转变您的工作流程吗？
            </h3>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              加入已经在使用 OneShare 
              构建惊人应用的数千名开发者、团队和组织。
            </p>
            <Button
              size="lg"
              onClick={onGetStarted}
              className="px-8 py-4 text-lg font-semibold group"
            >
              立即开始您的项目
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}