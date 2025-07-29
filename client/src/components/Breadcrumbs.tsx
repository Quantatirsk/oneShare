import React from 'react';
import { Home, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BreadcrumbsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ currentPath, onNavigate }: BreadcrumbsProps) {
  const pathParts = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="flex items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onNavigate('')}
      >
        <Home className="w-4 h-4" />
      </Button>
      
      {pathParts.map((part, index) => {
        const path = pathParts.slice(0, index + 1).join('/');
        const isLast = index === pathParts.length - 1;
        
        return (
          <React.Fragment key={path}>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-2 ${isLast ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
              onClick={() => onNavigate(path)}
            >
              {part}
            </Button>
          </React.Fragment>
        );
      })}
    </div>
  );
}