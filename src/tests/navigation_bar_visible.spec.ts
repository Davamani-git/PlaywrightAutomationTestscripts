/**
 * BDD Spec: Navigation bar is visible after successful home page load
 * SCRUM-93 AC2 TS005
 */
import { test, expect } from '@playwright/test';
import { NavigationBarActions } from '../actions/NavigationBarActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Navigation Bar Visibility', () => {
  test('Given the user opens the home page, When the home page loads successfully, Then the navigation bar should be visible', async ({ page }) => {
    const data = await TestDataLoader.load('navigation_bar.data.json');
    const actions = new NavigationBarActions(page);

    // Given
    await page.goto('https://eshop.example.com/');

    // When
    await actions.checkNavBarVisibility();

    // Then
    await expect(page.locator(data.navBarSelector)).toBeVisible();
  });
});
