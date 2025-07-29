// 自适应ThinkingModal工具函数

/**
 * 根据模型响应时间推荐显示延迟策略
 */
export function getModelTypeByLatency(latency: number): {
  type: 'fast' | 'medium' | 'slow';
  description: string;
  recommendedDelay: number;
} {
  if (latency <= 1000) {
    return {
      type: 'fast',
      description: '快速响应模型',
      recommendedDelay: 500
    };
  } else if (latency <= 3000) {
    return {
      type: 'medium', 
      description: '中等响应模型',
      recommendedDelay: 1500
    };
  } else {
    return {
      type: 'slow',
      description: '慢速响应模型',
      recommendedDelay: 2500
    };
  }
}

/**
 * 计算滚动速度的优化建议
 */
export function getScrollSpeedRecommendation(generationSpeed: number): {
  speed: number;
  reason: string;
} {
  if (generationSpeed === 0) {
    return {
      speed: 80,
      reason: '默认滚动速度'
    };
  }
  
  if (generationSpeed > 200) {
    return {
      speed: Math.min(200, generationSpeed * 0.8),
      reason: '高速生成，匹配内容速度'
    };
  } else if (generationSpeed > 50) {
    return {
      speed: Math.max(60, generationSpeed * 0.9),
      reason: '中速生成，平衡显示效果'
    };
  } else {
    return {
      speed: 40,
      reason: '低速生成，保持基础滚动'
    };
  }
}

/**
 * 性能统计格式化
 */
export function formatPerformanceStats(stats: {
  responseLatency: number | null;
  generationSpeed: number;
  averageChunkSize: number;
  totalChunks: number;
  scrollSpeed: number;
  isOptimized: boolean;
}) {
  return {
    latencyText: stats.responseLatency ? `${stats.responseLatency}ms` : '计算中...',
    speedText: stats.generationSpeed > 0 ? `${stats.generationSpeed.toFixed(1)} 字/秒` : '计算中...',
    chunkText: `${stats.totalChunks} 块数据`,
    avgChunkText: stats.averageChunkSize > 0 ? `平均 ${stats.averageChunkSize.toFixed(1)} 字/块` : '计算中...',
    scrollText: `${stats.scrollSpeed.toFixed(0)}px/秒`,
    optimizationStatus: stats.isOptimized ? '✅ AI优化已启用' : '⚠️ 使用固定模式'
  };
}

/**
 * 检测异常生成模式
 */
export function detectGenerationAnomalies(stats: {
  responseLatency: number | null;
  generationSpeed: number;
  averageChunkSize: number;
  totalChunks: number;
}): string[] {
  const anomalies: string[] = [];
  
  // 检测响应延迟异常
  if (stats.responseLatency && stats.responseLatency > 10000) {
    anomalies.push('响应延迟过高（>10秒）');
  }
  
  // 检测生成速度异常
  if (stats.generationSpeed > 0 && stats.generationSpeed < 5) {
    anomalies.push('生成速度过慢（<5字/秒）');
  } else if (stats.generationSpeed > 500) {
    anomalies.push('生成速度异常快（>500字/秒）');
  }
  
  // 检测chunk大小异常
  if (stats.averageChunkSize > 0) {
    if (stats.averageChunkSize < 1) {
      anomalies.push('数据块过小（<1字/块）');
    } else if (stats.averageChunkSize > 1000) {
      anomalies.push('数据块过大（>1000字/块）');
    }
  }
  
  // 检测chunk数量异常
  if (stats.totalChunks > 1000) {
    anomalies.push('数据块数量过多（>1000块）');
  }
  
  return anomalies;
}

/**
 * 生成性能报告
 */
export function generatePerformanceReport(stats: {
  responseLatency: number | null;
  generationSpeed: number;
  averageChunkSize: number;
  totalChunks: number;
  scrollSpeed: number;
  isOptimized: boolean;
}) {
  const formatted = formatPerformanceStats(stats);
  const anomalies = detectGenerationAnomalies(stats);
  const modelType = stats.responseLatency ? getModelTypeByLatency(stats.responseLatency) : null;
  const scrollRec = getScrollSpeedRecommendation(stats.generationSpeed);
  
  return {
    summary: {
      responseLatency: formatted.latencyText,
      generationSpeed: formatted.speedText,
      chunks: formatted.chunkText,
      optimization: formatted.optimizationStatus
    },
    details: {
      averageChunkSize: formatted.avgChunkText,
      scrollSpeed: formatted.scrollText,
      modelType: modelType?.description || '未知模型类型'
    },
    recommendations: {
      scrollSpeed: scrollRec,
      modelType: modelType
    },
    anomalies,
    healthScore: calculateHealthScore(stats, anomalies.length)
  };
}

/**
 * 计算性能健康评分
 */
function calculateHealthScore(stats: {
  responseLatency: number | null;
  generationSpeed: number;
  averageChunkSize: number;
  totalChunks: number;
  isOptimized: boolean;
}, anomalyCount: number): {
  score: number;
  level: 'excellent' | 'good' | 'fair' | 'poor';
  description: string;
} {
  let score = 100;
  
  // 响应延迟评分
  if (stats.responseLatency) {
    if (stats.responseLatency > 5000) score -= 30;
    else if (stats.responseLatency > 2000) score -= 15;
    else if (stats.responseLatency > 1000) score -= 5;
  }
  
  // 生成速度评分
  if (stats.generationSpeed > 0) {
    if (stats.generationSpeed < 10) score -= 20;
    else if (stats.generationSpeed < 30) score -= 10;
  }
  
  // 异常扣分
  score -= anomalyCount * 15;
  
  // 优化加分
  if (stats.isOptimized) score += 5;
  
  // 确保分数范围
  score = Math.max(0, Math.min(100, score));
  
  let level: 'excellent' | 'good' | 'fair' | 'poor';
  let description: string;
  
  if (score >= 90) {
    level = 'excellent';
    description = '性能优秀，响应迅速';
  } else if (score >= 70) {
    level = 'good';
    description = '性能良好，体验流畅';
  } else if (score >= 50) {
    level = 'fair';
    description = '性能一般，可以优化';
  } else {
    level = 'poor';
    description = '性能较差，建议检查';
  }
  
  return { score, level, description };
}