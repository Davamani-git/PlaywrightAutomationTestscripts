import { Page } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

/**
 * HomeActions: Encapsulates user interactions and flows using page objects.
 * No assertions. Accepts test data via parameters.
 */
export class HomeActions {
  private homePage: HomePage;

  constructor(page: Page) {
    this.homePage = new HomePage(page);
  }

  /**
   * Navigates to the home page using the provided URL.
   * @param url Home page URL from test data.
   */
  async navigateToHomePage(url: string): Promise<void> {
    await this.homePage.page.goto(url);
    await this.homePage.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Simulates server error by navigating to a broken URL.
   * @param url Broken home page URL.
   */
  async navigateToHomePageWithServerError(url: string): Promise<void> {
    await this.homePage.page.goto(url);
    await this.homePage.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Simulates slow network conditions.
   */
  async simulateSlowNetwork(): Promise<void> {
    await this.homePage.page.context().setNetworkConditions({
      download: 500, // 500 kbps
      upload: 500,
      latency: 2000
    });
  }

  /**
   * Enters an invalid or malformed URL.
   * @param url Invalid home page URL.
   */
  async navigateToInvalidUrl(url: string): Promise<void> {
    await this.homePage.page.goto(url);
    await this.homePage.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Checks for navigation bar visibility.
   */
  async checkNavigationBar(): Promise<boolean> {
    return await this.homePage.homeNavLocator.isVisible();
  }

  /**
   * Resizes browser window.
   * @param width Desired window width.
   * @param height Desired window height.
   */
  async resizeWindow(width: number, height: number): Promise<void> {
    await this.homePage.page.setViewportSize({ width, height });
  }

  /**
   * Checks for Products page link visibility.
   */
  async checkProductsLink(): Promise<boolean> {
    return await this.homePage.productsNavLocator.isVisible();
  }

  /**
   * Simulates broken Products page link.
   */
  async simulateBrokenProductsLink(): Promise<void> {
    // Implementation depends on test environment; placeholder for mocking
  }

  /**
   * Clicks Products page link.
   */
  async clickProductsLink(): Promise<void> {
    await this.homePage.productsNavLocator.click();
  }
}
