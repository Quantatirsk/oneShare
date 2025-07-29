"use client";

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedCardProps {
  children: React.ReactNode;
  animation?: 'hover' | 'focus' | 'always';
  intensity?: 'subtle' | 'medium' | 'strong';
  className?: string;
}

export function AnimatedCard({
  children,
  animation = 'hover',
  intensity = 'medium',
  className
}: AnimatedCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const intensityValues = {
    subtle: { shadow: 'shadow-sm', transform: 'scale(1.01) translateY(-2px)' },
    medium: { shadow: 'shadow-md', transform: 'scale(1.02) translateY(-4px)' },
    strong: { shadow: 'shadow-lg', transform: 'scale(1.03) translateY(-6px)' }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const isAnimating = animation === 'always' || (animation === 'hover' && isHovered);

  return (
    <div
      className={cn(
        "relative transition-all duration-300 ease-out",
        isAnimating && intensityValues[intensity].shadow,
        className
      )}
      style={{
        transform: isAnimating ? intensityValues[intensity].transform : 'none'
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isAnimating && (
        <div
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{
            background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%)`
          }}
        />
      )}
    </div>
  );
} 