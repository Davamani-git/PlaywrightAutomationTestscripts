/**
 * BDD Spec: Navigation bar fails to render due to missing resources
 * SCRUM-93 AC2 TS006
 */
import { test, expect } from '@playwright/test';
import { NavigationBarActions } from '../actions/NavigationBarActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Navigation Bar Visibility', () => {
  test('Given the navigation bar resources are missing, When the user opens the home page, Then the navigation bar should not be visible or an error should be shown', async ({ page }) => {
    const data = await TestDataLoader.load('navigation_bar.data.json');
    const actions = new NavigationBarActions(page);

    // Given
    await actions.simulateMissingNavBarResources();

    // When
    await page.goto('https://eshop.example.com/');

    // Then
    await expect(page.locator(data.navBarSelector)).not.toBeVisible();
    await expect(page.locator('[role="alert"], .error-message')).toHaveText(data.navBarErrorMessage);
  });
});
