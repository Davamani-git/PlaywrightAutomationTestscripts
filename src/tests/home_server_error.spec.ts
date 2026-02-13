import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Server Error', () => {
  test('Given server error URL, When user navigates, Then error message should be displayed', async ({ page }) => {
    const data = await TestDataLoader.load('home.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.navigateToHomePageWithServerError(data.serverErrorUrl);

    // When
    // (Page loaded with error)

    // Then
    await expect(page.getByText('Error')).toBeVisible();
  });
});
