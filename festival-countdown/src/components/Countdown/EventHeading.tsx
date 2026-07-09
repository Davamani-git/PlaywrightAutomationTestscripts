import React from 'react';
import { cn } from '@/lib/utils';

interface EventHeadingProps {
  className?: string;
}

const EventHeading: React.FC<EventHeadingProps> = ({ className }) => {
  return (
    <div className={cn("flex flex-col items-center mb-8", className)}>
      <h1 className="text-heading text-primary-text font-normal">
        The festival opening in
      </h1>
    </div>
  );
};

export default EventHeading;