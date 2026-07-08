import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Pause, Play, RotateCcw } from 'lucide-react';

interface TimerControlsProps {
  onStart?: () => void;
  onPause?: () => void;
  onReset?: () => void;
  isRunning?: boolean;
  className?: string;
}

const TimerControls: React.FC<TimerControlsProps> = ({
  onStart,
  onPause,
  onReset,
  isRunning = false,
  className
}) => {
  const [activeAction, setActiveAction] = React.useState<'start' | 'pause' | 'reset' | null>(null);

  React.useEffect(() => {
    if (activeAction === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActiveAction(null);
    }, 150);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeAction]);

  const handleStart = React.useCallback(() => {
    setActiveAction('start');
    onStart?.();
  }, [onStart]);

  const handlePause = React.useCallback(() => {
    setActiveAction('pause');
    onPause?.();
  }, [onPause]);

  const handleReset = React.useCallback(() => {
    setActiveAction('reset');
    onReset?.();
  }, [onReset]);

  const controls = [
    {
      key: 'start' as const,
      label: 'Start',
      icon: Play,
      variant: 'default' as const,
      onClick: handleStart,
      disabled: isRunning
    },
    {
      key: 'pause' as const,
      label: 'Pause',
      icon: Pause,
      variant: 'secondary' as const,
      onClick: handlePause,
      disabled: !isRunning
    },
    {
      key: 'reset' as const,
      label: 'Reset',
      icon: RotateCcw,
      variant: 'outline' as const,
      onClick: handleReset,
      disabled: false
    }
  ];

  return (
    <div
      className={cn('flex flex-row items-center gap-2 px-2', className)}
      role="group"
      aria-label="Timer controls"
    >
      {controls.map((control) => {
        const Icon = control.icon;

        return (
          <Button
            key={control.key}
            type="button"
            variant={control.variant}
            size="sm"
            onClick={control.onClick}
            disabled={control.disabled}
            className={cn(
              'h-8 gap-1.5 px-3 text-sm font-medium shadow-none',
              activeAction === control.key && 'scale-[0.98]'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{control.label}</span>
          </Button>
        );
      })}
    </div>
  );
};

export default TimerControls;
