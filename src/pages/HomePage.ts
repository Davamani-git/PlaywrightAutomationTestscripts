import { Page } from '@playwright/test';

/**
 * HomePage Selectors
 * Only selectors are exposed; no actions/assertions.
 * Maintains strict separation of concerns for maintainability.
 */
export class HomePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // Navigation bar selector
  navBar = 'nav[role="navigation"], .navbar, #navbar';

  // Products page link selector
  productsLink = 'a[href="/products"], a[data-testid="products-link"], #products-link';

  // Error message selector (generic)
  errorMessage = '.error-message, [role="alert"], #error';

  // Main container selector
  mainContainer = '#root, .main-content';

  // Shop Now button selector
  shopNowButton = 'button:has-text("Shop Now"), .shop-now';

  // Cart link selector
  cartLink = 'a[href="/cart"], a[data-testid="cart-link"], #cart-link';

  // Home link selector
  homeLink = 'a[href="/"], a[data-testid="home-link"], #home-link';

  // Responsive check selectors (can be used for min/max width testing)
  responsiveNavBar = '.navbar-responsive, .navbar';

  // Welcome title selector
  welcomeTitle = 'h1:has-text("Welcome to E-Shop"), .welcome-title';
}
