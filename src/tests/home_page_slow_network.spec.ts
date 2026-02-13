/**
 * BDD Spec: Home page load on slow network
 * SCRUM-93 AC1 TS003
 */
import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Loading', () => {
  const results = ['load successfully', 'show timeout message'];
  results.forEach(result => {
    test(`Given the user simulates a slow network connection, When the user enters the home page URL, Then the home page should ${result}`, async ({ page }) => {
      const data = await TestDataLoader.load('home_page.data.json');
      const actions = new HomePageActions(page);

      // Given
      await actions.simulateSlowNetwork();

      // When
      await actions.enterUrl(data.validUrl);

      // Then
      if (result === 'load successfully') {
        await expect(page.locator('h1')).toHaveText(data.homeTitle);
      } else {
        await expect(page.locator('[role="alert"], .error-message')).toHaveText(data.timeoutMessage);
      }
    });
  });
});
