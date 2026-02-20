import { Page } from '@playwright/test';
import { EShopPage } from '../pages/EShopPage';

/**
 * ProductActions encapsulates business logic for product page interactions.
 * No assertions are included. All flows use async/await and proper Playwright waits.
 */
export class ProductActions {
  constructor(private readonly page: Page, private readonly eShopPage: EShopPage) {}

  /**
   * Selects a product category.
   * @param categoryName Category to select (e.g., 'Electronics')
   */
  async selectCategory(categoryName: string): Promise<void> {
    await this.page.getByRole('button', { name: categoryName }).click();
    await this.eShopPage.productsMainHeadingLocator.waitFor({ state: 'visible' });
  }

  /**
   * Views product details.
   * @param productName Name of the product to view
   */
  async viewProductDetails(productName: string): Promise<void> {
    await this.page.getByRole('heading', { level: 2, name: productName }).click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}
