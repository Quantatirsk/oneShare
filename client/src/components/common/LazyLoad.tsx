import React, { Suspense, lazy, ComponentType } from 'react';
import { LottieLoader } from './LottieAnimations';

// Lazy loading wrapper with fallback
interface LazyComponentProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const LazyComponent: React.FC<LazyComponentProps> = ({ 
  fallback = <LottieLoader size={40} />, 
  children 
}) => {
  return (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  );
};

// Higher-order component for lazy loading
export function withLazyLoading<P extends object>(
  Component: ComponentType<P>,
  fallback?: React.ReactNode
) {
  const LazyComponent = lazy(() => Promise.resolve({ default: Component }));
  
  return React.forwardRef<any, P>((props, ref) => (
    <Suspense fallback={fallback || <LottieLoader size={40} />}>
      <LazyComponent {...props} ref={ref} />
    </Suspense>
  ));
}

// Intersection Observer hook for visibility detection
export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = React.useState(false);
  const [hasIntersected, setHasIntersected] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      const isElementIntersecting = entry.isIntersecting;
      setIsIntersecting(isElementIntersecting);
      
      // Once intersected, keep it true for performance
      if (isElementIntersecting && !hasIntersected) {
        setHasIntersected(true);
      }
    }, options);

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, options, hasIntersected]);

  return { isIntersecting, hasIntersected };
}

// Lazy loading component based on intersection
interface IntersectionLazyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
  threshold?: number;
  className?: string;
}

export const IntersectionLazy: React.FC<IntersectionLazyProps> = ({
  children,
  fallback = <div className="w-full h-32 flex items-center justify-center"><LottieLoader size={40} /></div>,
  rootMargin = '100px',
  threshold = 0.1,
  className = ''
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const { hasIntersected } = useIntersectionObserver(ref, {
    rootMargin,
    threshold
  });

  return (
    <div ref={ref} className={className}>
      {hasIntersected ? children : fallback}
    </div>
  );
};

export default LazyComponent;