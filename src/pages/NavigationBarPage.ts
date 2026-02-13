/**
 * NavigationBarPage selectors-only Page Object
 * Accepts Playwright Page instance in constructor.
 * NO actions or assertions here.
 */
import { Page } from '@playwright/test';

export class NavigationBarPage {
  readonly page: Page;

  // Selectors
  readonly navBar = 'nav, .navbar';
  readonly homeLink = 'a[href="/"], text=Home';
  readonly productsLink = 'a[href="/products"], text=Products';
  readonly cartLink = 'a[href="/cart"], text=Cart';

  constructor(page: Page) {
    this.page = page;
  }
}
