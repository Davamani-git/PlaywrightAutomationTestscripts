import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Products Link Broken', () => {
  test('Given broken Products page link, When user clicks, Then Products page link should not work or error shown', async ({ page }) => {
    const productsData = await TestDataLoader.load('products.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.simulateBrokenProductsLink();

    // When
    await actions.clickProductsLink();

    // Then
    await expect(page.getByText('Error')).toBeVisible();
  });
});
