import React, { type ReactNode } from 'react';

export interface AppLayoutProps {
  /**
   * Child content to be rendered within the layout.
   * This is strongly typed as ReactNode to prevent arbitrary
   * style or className strings from being injected via props.
   */
  children: ReactNode;
}

/**
 * AppLayout
 *
 * Reusable layout component that enforces the teal background
 * and consistent, readable content layout across the app.
 *
 * Security considerations:
 * - Does not accept arbitrary className or style props to
 *   avoid style injection vectors.
 * - Purely presentational; does not log or process user data.
 */
const AppLayout: React.FC<AppLayoutProps> = ({ children }) => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="container mx-auto px-4 py-8">
      {children}
    </div>
  </div>
);

export default AppLayout;
