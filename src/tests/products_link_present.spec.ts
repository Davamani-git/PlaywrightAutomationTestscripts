import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Products Link Present', () => {
  test('Given home page loads, When user checks for Products page link, Then Products page link should be visible', async ({ page }) => {
    const data = await TestDataLoader.load('home.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.navigateToHomePage(data.validUrl);

    // When
    const productsLinkVisible = await actions.checkProductsLink();

    // Then
    expect(productsLinkVisible).toBeTruthy();
  });
});
