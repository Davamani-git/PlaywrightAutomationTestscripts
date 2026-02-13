/**
 * HomePage selectors-only Page Object
 * Accepts Playwright Page instance in constructor.
 * NO actions or assertions here.
 */
import { Page } from '@playwright/test';

export class HomePage {
  readonly page: Page;

  // Selectors
  readonly homeTitle = 'h1'; // "Welcome to E-Shop"
  readonly subtitle = 'h2'; // "Discover amazing products..."
  readonly errorMessage = '[role="alert"], .error-message';
  readonly productsLink = 'a[href="/products"], text=Products';
  readonly cartLink = 'a[href="/cart"], text=Cart';
  readonly shopNowButton = 'button, text=Shop Now';
  readonly freeShippingIcon = 'text=Free Shipping';
  readonly securePaymentIcon = 'text=Secure Payment';
  readonly easyReturnsIcon = 'text=Easy Returns';
  readonly qualityProductsIcon = 'text=Quality Products';

  constructor(page: Page) {
    this.page = page;
  }
}
