import { Page } from '@playwright/test';

/**
 * Page Object for the Cart page scenario.
 * Contains only selectors for cart items, ratings, and review counts.
 * No actions or assertions are defined here.
 * Extensible for new cart-related UI .
 */
export class CartPage {
  readonly page: Page;

  // Selector for all cart product containers
  readonly cartProduct = '.cart-product';

  // Selector for average rating (e.g., "4.3 / 5")
  readonly averageRating = '.cart-product .average-rating';

  // Selector for ratings count (e.g., "10 reviews")
  readonly ratingsCount = '.cart-product .ratings-count';

  // Selector for "No ratings yet" message
  readonly noRatingsYet = '.cart-product .no-ratings';

  constructor(page: Page) {
    this.page = page;
  }
}
