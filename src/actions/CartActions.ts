import { Page } from '@playwright/test';
import { EShopPage } from '../pages/EShopPage';

/**
 * CartActions encapsulates business logic for cart interactions.
 * No assertions are included. All flows use async/await and proper Playwright waits.
 */
export class CartActions {
  constructor(private readonly page: Page, private readonly eShopPage: EShopPage) {}

  /**
   * Adds a product to the cart using product name.
   * @param productName Name of the product to add (e.g., 'Laptop')
   */
  async addProductToCart(productName: string): Promise<void> {
    // Wait for product card to be visible
    await this.page.getByRole('heading', { level: 2, name: productName }).waitFor({ state: 'visible' });
    // Click Add to Cart button for the product
    await this.page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: productName }).click();
    // Wait for cart count to update
    await this.eShopPage.cartNavLocator.waitFor({ state: 'visible' });
  }

  /**
   * Removes a product from the cart.
   * @param productName Name of the product to remove (e.g., 'Laptop')
   */
  async removeProductFromCart(productName: string): Promise<void> {
    await this.eShopPage.cartProductNameLocator.waitFor({ state: 'visible' });
    await this.eShopPage.cartProductRemoveButtonLocator.click();
    // Wait for cart to update
    await this.eShopPage.emptyCartHeadingLocator.waitFor({ state: 'visible' });
  }

  /**
   * Updates product quantity in cart.
   * @param productName Name of the product
   * @param quantity Desired quantity
   */
  async updateProductQuantity(productName: string, quantity: number): Promise<void> {
    await this.eShopPage.cartProductNameLocator.waitFor({ state: 'visible' });
    await this.eShopPage.cartProductQuantityInputLocator.fill(quantity.toString());
    // Wait for subtotal to update
    await this.eShopPage.cartSubtotalValueLocator.waitFor({ state: 'visible' });
  }
}
