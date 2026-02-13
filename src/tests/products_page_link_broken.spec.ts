/**
 * BDD Spec: Products page link is missing or broken
 * SCRUM-93 AC3 TS009
 */
import { test, expect } from '@playwright/test';
import { ProductsPageLinkActions } from '../actions/ProductsPageLinkActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Products Page Link', () => {
  test('Given the Products page link is broken, When the user clicks the Products page link, Then the Products page link should not work or an error should be shown', async ({ page }) => {
    const data = await TestDataLoader.load('products_page_link.data.json');
    const actions = new ProductsPageLinkActions(page);

    // Given
    await actions.simulateBrokenProductsLink();

    // When
    await page.goto('https://eshop.example.com/');
    await actions.clickProductsLink();

    // Then
    await expect(page.locator('[role="alert"], .error-message')).toHaveText(data.productsLinkErrorMessage);
  });
});
