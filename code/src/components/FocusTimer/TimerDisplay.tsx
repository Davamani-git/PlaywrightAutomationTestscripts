import React from 'react';
import { cn } from '@/lib/utils';

interface TimerDisplayProps {
  totalSeconds?: number;
  isRunning?: boolean;
  className?: string;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  totalSeconds = 25 * 60,
  isRunning = false,
  className
}) => {
  const [displaySeconds, setDisplaySeconds] = React.useState<number>(Math.max(0, totalSeconds));

  React.useEffect(() => {
    setDisplaySeconds(Math.max(0, totalSeconds));
  }, [totalSeconds]);

  const formattedTime = React.useMemo(() => {
    const minutes = Math.floor(displaySeconds / 60);
    const seconds = displaySeconds % 60;

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [displaySeconds]);

  const statusLabel = isRunning ? ('running' as const) : ('paused' as const);

  return (
    <div
      className={cn('px-2', className)}
      aria-live="polite"
      aria-atomic="true"
      data-status={statusLabel}
    >
      <p className="text-timer font-normal tracking-tight text-foreground sm:text-[1.75rem]">
        {formattedTime}
      </p>
    </div>
  );
};

export default TimerDisplay;
