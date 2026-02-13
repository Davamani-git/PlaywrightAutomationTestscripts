import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Load', () => {
  test('Given valid home page URL, When user navigates, Then home page should load successfully', async ({ page }) => {
    // Load test data
    const data = await TestDataLoader.load('home.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.navigateToHomePage(data.validUrl);

    // When
    // (Page loaded)

    // Then
    await expect(page).toHaveURL(data.validUrl);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to E-Shop' })).toBeVisible();
  });
});
