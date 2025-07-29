import React, { useState, useEffect } from 'react';
import Lottie from 'lottie-react';

interface LottieComponentProps {
  size?: number;
  className?: string;
  model?: string;
}

export const LottieLoader: React.FC<LottieComponentProps> = ({ size = 64, className = "", model = "" }) => {
  const [animationData, setAnimationData] = useState(null);
  
  useEffect(() => {
    // 根据模型名称选择对应的动画文件
    const animationFile = model.toLowerCase().includes('gemini') 
      ? '/lottie/gemini.json' 
      : '/lottie/randomLoader.json';
    
    fetch(animationFile)
      .then(response => response.json())
      .then(data => setAnimationData(data))
      .catch(console.error);
  }, [model]);
  
  if (!animationData) {
    return null;
  }
  
  return (
    <Lottie 
      animationData={animationData} 
      loop={true} 
      style={{ width: size, height: size }} 
      className={className}
    />
  );
};

export const LottieGift: React.FC<LottieComponentProps> = ({ size = 64, className = "" }) => {
  const [animationData, setAnimationData] = useState(null);
  
  useEffect(() => {
    fetch('/lottie/gift.json')
      .then(response => response.json())
      .then(data => setAnimationData(data))
      .catch(console.error);
  }, []);
  
  if (!animationData) {
    return (
      <div 
        className={`bg-primary/10 rounded-full ${className}`} 
        style={{ width: size, height: size }} 
      />
    );
  }
  
  return (
    <Lottie 
      animationData={animationData} 
      loop={true} 
      style={{ width: size, height: size }} 
      className={className}
    />
  );
};