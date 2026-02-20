import { Page } from '@playwright/test';
import { EShopPage } from '../pages/EShopPage';

/**
 * NavigationActions encapsulates business logic for navigation flows.
 * No assertions are included. All flows use async/await and proper Playwright waits.
 */
export class NavigationActions {
  constructor(private readonly page: Page, private readonly eShopPage: EShopPage) {}

  /**
   * Navigates to the home page.
   */
  async goToHome(): Promise<void> {
    await this.eShopPage.homeNavLocator.click();
    await this.eShopPage.mainHeadingLocator.waitFor({ state: 'visible' });
  }

  /**
   * Navigates to the products page.
   */
  async goToProducts(): Promise<void> {
    await this.eShopPage.productsNavLocator.click();
    await this.eShopPage.productsMainHeadingLocator.waitFor({ state: 'visible' });
  }

  /**
   * Navigates to the cart page.
   */
  async goToCart(): Promise<void> {
    await this.eShopPage.cartNavLocator.click();
    await this.eShopPage.shoppingCartHeadingLocator.waitFor({ state: 'visible' });
  }
}
