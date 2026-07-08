import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title = '25-Minute Focus Timer',
  subtitle = 'Focus session',
  className
}) => {
  const headerMeta = {
    headingLevel: 'h1' as const,
    subtitleTone: 'muted' as const
  };

  return (
    <header
      className={cn('flex flex-col items-start gap-4 px-2 pt-6', className)}
      aria-label="Focus timer header"
      data-heading-level={headerMeta.headingLevel}
      data-subtitle-tone={headerMeta.subtitleTone}
    >
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        <p className="text-xl font-medium text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </header>
  );
};

export default PageHeader;
