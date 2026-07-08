import React from 'react';
import MainLayout from '@/components/layout/MainLayout';

interface FocusTimerPageData {
  title: string;
  sessionLabel: string;
  initialMinutes: number;
}

const pageData: FocusTimerPageData = {
  title: '25-Minute Focus Timer',
  sessionLabel: 'Focus session',
  initialMinutes: 25
} as const;

const Index: React.FC = () => {
  const safeInitialMinutes = React.useMemo(() => {
    if (!Number.isFinite(pageData.initialMinutes)) {
      return 25;
    }

    return Math.max(0, Math.floor(pageData.initialMinutes));
  }, []);

  return (
    <MainLayout
      title={pageData.title}
      sessionLabel={pageData.sessionLabel}
      initialMinutes={safeInitialMinutes}
    >
      {null}
    </MainLayout>
  );
};

export default Index;
