import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export function NotFoundPage() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
        <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
        <h2 className="text-2xl font-medium text-foreground mb-4">页面未找到</h2>
        <p className="text-muted-foreground mb-6">
          抱歉，您访问的页面不存在。
        </p>
        <p className="text-muted-foreground">
          {countdown} 秒后将自动跳转到首页...
        </p>
      </div>
    </div>
  );
}