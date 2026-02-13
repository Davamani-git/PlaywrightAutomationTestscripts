/**
 * BDD Spec: Navigation bar visibility on supported screen sizes
 * SCRUM-93 AC2 TS007/TC_007/TC_008
 */
import { test, expect } from '@playwright/test';
import { NavigationBarActions } from '../actions/NavigationBarActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Navigation Bar Visibility', () => {
  const screenSizes = ['minimumSupported', 'maximumSupported'];
  screenSizes.forEach(size => {
    test(`Given the user opens the home page, When the user resizes the browser to ${size}, Then the navigation bar should be visible or adapt responsively`, async ({ page }) => {
      const data = await TestDataLoader.load('navigation_bar.data.json');
      const actions = new NavigationBarActions(page);

      // Given
      await page.goto('https://eshop.example.com/');

      // When
      await actions.resizeBrowser(data[size]);

      // Then
      await expect(page.locator(data.navBarSelector)).toBeVisible();
      // Additional responsive checks can be added as needed
    });
  });
});
