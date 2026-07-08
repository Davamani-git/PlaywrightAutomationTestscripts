import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import FocusTimerPanel from '../FocusTimer/FocusTimerPanel';

interface MainLayoutProps {
  children: React.ReactNode;
  title?: string;
  sessionLabel?: string;
  initialMinutes?: number;
  className?: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  title = '25-Minute Focus Timer',
  sessionLabel = 'Focus session',
  initialMinutes = 25,
  className
}) => {
  const [isMounted, setIsMounted] = React.useState<boolean>(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const safeInitialMinutes = React.useMemo(() => {
    if (!Number.isFinite(initialMinutes)) {
      return 25;
    }

    return Math.max(0, Math.floor(initialMinutes));
  }, [initialMinutes]);

  const layoutState = isMounted ? ('ready' as const) : ('loading' as const);

  return (
    <div
      className={cn('flex min-h-screen flex-col bg-background text-foreground', className)}
      data-state={layoutState}
    >
      <main className="flex flex-1 flex-col items-start px-2 py-0">
        <Card className="w-full border-0 bg-transparent shadow-none">
          <CardContent className="flex w-full flex-col items-start p-0">
            <div className="w-full max-w-md">
              <FocusTimerPanel
                title={title}
                sessionLabel={sessionLabel}
                initialMinutes={safeInitialMinutes}
              />
            </div>
            {children ? <div className="w-full">{children}</div> : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MainLayout;
