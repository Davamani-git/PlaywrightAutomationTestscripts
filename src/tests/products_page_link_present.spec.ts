/**
 * BDD Spec: Products page link is present on the home page
 * SCRUM-93 AC3 TS008
 */
import { test, expect } from '@playwright/test';
import { ProductsPageLinkActions } from '../actions/ProductsPageLinkActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Products Page Link', () => {
  test('Given the user opens the home page, When the user checks for the Products page link, Then the Products page link should be visible', async ({ page }) => {
    const data = await TestDataLoader.load('products_page_link.data.json');
    const actions = new ProductsPageLinkActions(page);

    // Given
    await page.goto('https://eshop.example.com/');

    // When
    await actions.checkProductsLink();

    // Then
    await expect(page.locator(data.productsLinkSelector)).toBeVisible();
  });
});
