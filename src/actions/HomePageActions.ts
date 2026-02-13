/**
 * HomePageActions: Encapsulates business flows for home page.
 * NO assertions here.
 */
import { HomePage } from '../pages/HomePage';
import { Page } from '@playwright/test';

export class HomePageActions {
  readonly homePage: HomePage;

  constructor(page: Page) {
    this.homePage = new HomePage(page);
  }

  async openHomePage(url: string): Promise<void> {
    await this.homePage.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async enterUrl(url: string): Promise<void> {
    await this.homePage.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async pressEnterOrGo(): Promise<void> {
    // Typically handled by goto, but could simulate Enter key if needed
    await this.homePage.page.keyboard.press('Enter');
  }

  async simulateSlowNetwork(): Promise<void> {
    await this.homePage.page.context().setNetworkConditions({
      download: 500, // kbps
      upload: 500,
      latency: 2000 // ms
    });
  }

  async simulateServerDown(url: string): Promise<void> {
    // Simulate by navigating to a known non-responsive URL or mocking response
    await this.homePage.page.route(url, route => route.abort());
    await this.homePage.page.goto(url);
  }

  async enterMalformedUrl(url: string): Promise<void> {
    await this.homePage.page.goto(url, { waitUntil: 'domcontentloaded' });
  }
}
