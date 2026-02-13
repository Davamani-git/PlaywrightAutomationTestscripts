import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Navigation Bar Visible', () => {
  test('Given home page loads, When user checks navigation bar, Then navigation bar should be visible', async ({ page }) => {
    const data = await TestDataLoader.load('home.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.navigateToHomePage(data.validUrl);

    // When
    const navVisible = await actions.checkNavigationBar();

    // Then
    expect(navVisible).toBeTruthy();
  });
});
