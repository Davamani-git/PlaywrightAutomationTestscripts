import React from 'react';
import { cn } from '@/lib/utils';
import TimerUnit from './TimerUnit';
import ColonSeparator from './ColonSeparator';

interface CountdownTimerProps {
  className?: string;
  targetDate?: Date;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ 
  className,
  targetDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000 + 54 * 60 * 1000 + 36 * 1000)
}) => {
  const calculateTimeLeft = React.useCallback((): TimeLeft => {
    const difference = targetDate.getTime() - new Date().getTime();
    
    if (difference > 0) {
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
      };
    }
    
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0
    };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = React.useState<TimeLeft>(calculateTimeLeft());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [calculateTimeLeft]);

  const formatNumber = (num: number): string => {
    return num.toString().padStart(2, '0');
  };

  return (
    <div className={cn("flex flex-row items-end gap-8 py-12", className)}>
      <TimerUnit value={formatNumber(timeLeft.days)} label="Days" />
      <ColonSeparator />
      <TimerUnit value={formatNumber(timeLeft.hours)} label="Hours" />
      <ColonSeparator />
      <TimerUnit value={formatNumber(timeLeft.minutes)} label="Minutes" />
      <ColonSeparator />
      <TimerUnit value={formatNumber(timeLeft.seconds)} label="Seconds" />
    </div>
  );
};

export default CountdownTimer;