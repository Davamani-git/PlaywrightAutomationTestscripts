import { Page } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

/**
 * HomePageActions
 * Encapsulates business flows for HomePage.
 * No assertions, only actions. Extensible for reuse.
 */
export class HomePageActions {
  readonly page: Page;
  readonly homePage: HomePage;

  constructor(page: Page) {
    this.page = page;
    this.homePage = new HomePage(page);
  }

  /**
   * Navigate to the home page with dynamic URL.
   */
  async navigateToHomePage(url: string): Promise<void> {
    try {
      await this.page.goto(url, { waitUntil: 'networkidle' });
    } catch (err) {
      // Error handling for navigation failures
      throw new Error(`Failed to navigate to home page: ${err}`);
    }
  }

  /**
   * Simulate slow network conditions.
   */
  async simulateSlowNetwork(): Promise<void> {
    await this.page.context().setNetworkConditions({
      download: 500, // kbps
      upload: 500,   // kbps
      latency: 200   // ms
    });
  }

  /**
   * Simulate server error by navigating to a mock error endpoint.
   */
  async simulateServerError(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Simulate malformed URL navigation.
   */
  async navigateToMalformedUrl(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Resize browser window for responsiveness checks.
   */
  async resizeWindow(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  /**
   * Simulate missing navigation bar resources (mock/fake scenario).
   */
  async simulateMissingNavBarResources(): Promise<void> {
    // Optionally intercept requests and block nav bar resources
    await this.page.route('**/navbar.*', route => route.abort());
    await this.page.reload({ waitUntil: 'domcontentloaded' });
  }

  /**
   * Simulate broken Products page link (mock/fake scenario).
   */
  async simulateBrokenProductsLink(): Promise<void> {
    await this.page.route('**/products', route => route.abort());
  }

  /**
   * Click Products page link.
   */
  async clickProductsLink(): Promise<void> {
    await this.page.click(this.homePage.productsLink);
  }
}
