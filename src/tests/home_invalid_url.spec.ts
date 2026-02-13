import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Invalid URL', () => {
  test('Given invalid URL, When user navigates, Then error message should be displayed', async ({ page }) => {
    const data = await TestDataLoader.load('home.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.navigateToInvalidUrl(data.invalidUrl);

    // When
    // (Page loaded with error)

    // Then
    await expect(page.getByText('Error')).toBeVisible();
  });
});
