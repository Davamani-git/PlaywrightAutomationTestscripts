/**
 * ProductsPageLink selectors-only Page Object
 * Accepts Playwright Page instance in constructor.
 * NO actions or assertions here.
 */
import { Page } from '@playwright/test';

export class ProductsPageLink {
  readonly page: Page;

  // Selector for Products link
  readonly productsLink = 'a[href="/products"], text=Products';

  constructor(page: Page) {
    this.page = page;
  }
}
