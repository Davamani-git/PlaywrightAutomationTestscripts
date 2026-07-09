import React from 'react';
import EventHeading from '@/components/Countdown/EventHeading';
import CountdownTimer from '@/components/Countdown/CountdownTimer';

/**
 * Index Page - Festival Countdown
 * 
 * Landing page displaying a countdown timer to the festival opening.
 * Layout: Centered vertical flex container with heading and countdown timer.
 */
const Index: React.FC = () => {
  // Set target date: 3 days, 12 hours, 54 minutes, 36 seconds from now
  // This matches the design screenshot provided
  const targetDate = new Date(
    Date.now() + 
    3 * 24 * 60 * 60 * 1000 + // 3 days
    12 * 60 * 60 * 1000 +     // 12 hours
    54 * 60 * 1000 +          // 54 minutes
    36 * 1000                 // 36 seconds
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <EventHeading />
      <CountdownTimer targetDate={targetDate} />
    </div>
  );
};

export default Index;