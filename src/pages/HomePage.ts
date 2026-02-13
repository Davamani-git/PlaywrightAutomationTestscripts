import { Locator, Page } from '@playwright/test';

/**
 * HomePage Page Object: Selectors only, no actions/assertions.
 * Accepts Playwright Page in constructor.
 */
export class HomePage {
  readonly page: Page;

  // Navigation
  readonly siteTitleLocator: Locator;
  readonly homeNavLocator: Locator;
  readonly productsNavLocator: Locator;
  readonly cartNavLocator: Locator;

  // Hero Section
  readonly mainHeadingLocator: Locator;
  readonly subheadingLocator: Locator;
  readonly shopNowButtonLocator: Locator;

  // Feature Cards
  readonly freeShippingHeadingLocator: Locator;
  readonly freeShippingTextLocator: Locator;
  readonly securePaymentHeadingLocator: Locator;
  readonly securePaymentTextLocator: Locator;
  readonly easyReturnsHeadingLocator: Locator;
  readonly easyReturnsTextLocator: Locator;
  readonly qualityProductsHeadingLocator: Locator;
  readonly qualityProductsTextLocator: Locator;

  constructor(page: Page) {
    this.page = page;
    // Navigation
    this.siteTitleLocator = page.getByRole('link', { name: 'E-Shop' });
    this.homeNavLocator = page.getByRole('link', { name: 'Home' });
    this.productsNavLocator = page.getByRole('link', { name: 'Products' });
    this.cartNavLocator = page.getByRole('link', { name: /Cart/i });

    // Hero Section
    this.mainHeadingLocator = page.getByRole('heading', { level: 1, name: 'Welcome to E-Shop' });
    this.subheadingLocator = page.getByText('Discover amazing products at great prices');
    this.shopNowButtonLocator = page.getByRole('button', { name: 'Shop Now' });

    // Feature Cards
    this.freeShippingHeadingLocator = page.getByRole('heading', { level: 2, name: 'Free Shipping' });
    this.freeShippingTextLocator = page.getByText('On orders over $50');
    this.securePaymentHeadingLocator = page.getByRole('heading', { level: 2, name: 'Secure Payment' });
    this.securePaymentTextLocator = page.getByText('100% secure transactions');
    this.easyReturnsHeadingLocator = page.getByRole('heading', { level: 2, name: 'Easy Returns' });
    this.easyReturnsTextLocator = page.getByText('30-day return policy');
    this.qualityProductsHeadingLocator = page.getByRole('heading', { level: 2, name: 'Quality Products' });
    this.qualityProductsTextLocator = page.getByText('Carefully curated selection');
  }
}
