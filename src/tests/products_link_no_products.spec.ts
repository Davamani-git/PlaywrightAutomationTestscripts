import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Products Link No Products', () => {
  test('Given no products in system, When user checks for Products page link, Then Products page link should still be visible', async ({ page }) => {
    const productsData = await TestDataLoader.load('products.data.json');
    const actions = new HomeActions(page);

    // Given
    // (Setup no products in system)

    // When
    const productsLinkVisible = await actions.checkProductsLink();

    // Then
    expect(productsLinkVisible).toBeTruthy();
  });
});
