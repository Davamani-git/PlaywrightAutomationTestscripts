/**
 * NavigationBarActions: Encapsulates business flows for navigation bar.
 * NO assertions here.
 */
import { NavigationBarPage } from '../pages/NavigationBarPage';
import { Page } from '@playwright/test';

export class NavigationBarActions {
  readonly navBarPage: NavigationBarPage;

  constructor(page: Page) {
    this.navBarPage = new NavigationBarPage(page);
  }

  async checkNavBarVisibility(): Promise<void> {
    // No assertion, just triggers selector check
    await this.navBarPage.page.waitForSelector(this.navBarPage.navBar, { state: 'visible' });
  }

  async resizeBrowser(screenSize: { width: number; height: number }): Promise<void> {
    await this.navBarPage.page.setViewportSize(screenSize);
  }

  async simulateMissingNavBarResources(): Promise<void> {
    // Simulate by intercepting network requests for navbar resources
    await this.navBarPage.page.route('**/navbar*', route => route.abort());
  }
}
