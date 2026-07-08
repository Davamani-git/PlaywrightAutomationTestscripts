import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import PageHeader from './PageHeader';
import TimerControls from './TimerControls';
import TimerDisplay from './TimerDisplay';

interface FocusTimerPanelProps {
  initialMinutes?: number;
  sessionLabel?: string;
  title?: string;
  className?: string;
}

const FocusTimerPanel: React.FC<FocusTimerPanelProps> = ({
  initialMinutes = 25,
  sessionLabel = 'Focus session',
  title = '25-Minute Focus Timer',
  className
}) => {
  const initialSeconds = React.useMemo(() => {
    const safeMinutes = Number.isFinite(initialMinutes) ? initialMinutes : 25;
    return Math.max(0, Math.floor(safeMinutes * 60));
  }, [initialMinutes]);

  const [remainingSeconds, setRemainingSeconds] = React.useState<number>(initialSeconds);
  const [isRunning, setIsRunning] = React.useState<boolean>(false);

  React.useEffect(() => {
    setRemainingSeconds(initialSeconds);
    setIsRunning(false);
  }, [initialSeconds]);

  React.useEffect(() => {
    if (!isRunning) {
      return;
    }

    if (remainingSeconds <= 0) {
      setIsRunning(false);
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((currentSeconds) => {
        if (currentSeconds <= 1) {
          window.clearInterval(interval);
          setIsRunning(false);
          return 0;
        }

        return currentSeconds - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, remainingSeconds]);

  const handleStart = React.useCallback(() => {
    setIsRunning((currentRunning) => {
      if (remainingSeconds <= 0) {
        return false;
      }

      return currentRunning ? currentRunning : true;
    });
  }, [remainingSeconds]);

  const handlePause = React.useCallback(() => {
    setIsRunning(false);
  }, []);

  const handleReset = React.useCallback(() => {
    setIsRunning(false);
    setRemainingSeconds(initialSeconds);
  }, [initialSeconds]);

  const panelState = remainingSeconds === 0 ? ('complete' as const) : isRunning ? ('running' as const) : ('idle' as const);

  return (
    <Card
      className={cn(
        'w-full max-w-md border-0 bg-transparent shadow-none',
        className
      )}
      data-state={panelState}
    >
      <CardContent className="flex flex-col items-start gap-2 p-0">
        <PageHeader title={title} subtitle={sessionLabel} />
        <TimerDisplay totalSeconds={remainingSeconds} isRunning={isRunning} />
        <TimerControls
          isRunning={isRunning}
          onStart={handleStart}
          onPause={handlePause}
          onReset={handleReset}
        />
      </CardContent>
    </Card>
  );
};

export default FocusTimerPanel;
