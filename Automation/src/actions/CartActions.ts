import { CartPage } from '../pages/CartPage';
import { Page } from '@playwright/test';

/**
 * CartActions encapsulates business flows for cart item ratings.
 * No assertions are performed .
 * Actions are reusable and composable.
 * Methods accept input validation and error handling for robustness.
 */
export class CartActions {
  readonly page: Page;
  readonly cartPage: CartPage;

  constructor(page: Page) {
    this.page = page;
    this.cartPage = new CartPage(page);
  }

  /** Navigates to the cart page. */
  async navigateToCart() {
    await this.page.goto('/cart');
  }

  /**
   * Adds products with specified ratings to the cart.
   * @param products Array of product objects: { name: string, ratings?: number[] }
   */
  async addProductsToCart(products: Array<{ name: string; ratings?: number[] }>) {
    for (const product of products) {
      await this.page.click(`[data-product-name="${product.name}"] .add-to-cart`);
    }
  }

  /** Returns all cart product elements. */
  async getCartProducts() {
    return await this.page.$$(this.cartPage.cartProduct);
  }

  /** Returns the average rating text for a cart product. */
  async getAverageRatingText(index: number): Promise<string | null> {
    const products = await this.getCartProducts();
    if (index < 0 || index >= products.length) {
      throw new Error('Invalid product index');
    }

    return await products[index]
      .$eval(this.cartPage.averageRating, el => el.textContent?.trim() || null)
      .catch(() => null);
  }

  /** Returns the ratings count text for a cart product. */
  async getRatingsCountText(index: number): Promise<string | null> {
    const products = await this.getCartProducts();
    if (index < 0 || index >= products.length) {
      throw new Error('Invalid product index');
    }

    return await products[index]
      .$eval(this.cartPage.ratingsCount, el => el.textContent?.trim() || null)
      .catch(() => null);
  }

  /** Checks if "No ratings yet" message is visible. */
  async isNoRatingsYetVisible(index: number): Promise<boolean> {
    const products = await this.getCartProducts();
    if (index < 0 || index >= products.length) {
      throw new Error('Invalid product index');
    }

    return await products[index]
      .$eval(this.cartPage.noRatingsYet, el => !!el)
      .catch(() => false);
  }
}
