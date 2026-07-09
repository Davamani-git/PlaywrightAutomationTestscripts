import React from 'react';
import { cn } from '@/lib/utils';

interface TimerUnitProps {
  value: string;
  label: string;
  className?: string;
}

const TimerUnit: React.FC<TimerUnitProps> = ({ value, label, className }) => {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="text-stat text-primary-text font-medium leading-none">
        {value}
      </div>
      <div className="text-subheading text-secondary-text font-normal mt-2">
        {label}
      </div>
    </div>
  );
};

export default TimerUnit;