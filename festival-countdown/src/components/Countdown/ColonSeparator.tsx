import React from 'react';
import { cn } from '@/lib/utils';

interface ColonSeparatorProps {
  className?: string;
}

const ColonSeparator: React.FC<ColonSeparatorProps> = ({ className }) => {
  return (
    <div className={cn("flex items-center justify-center pb-8", className)}>
      <span className="text-stat text-primary-text font-medium leading-none">
        :
      </span>
    </div>
  );
};

export default ColonSeparator;