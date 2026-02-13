/**
 * BDD Spec: Home page fails to load due to server error
 * SCRUM-93 AC1 TS002
 */
import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Loading', () => {
  test('Given the user opens the browser, When the user enters the home page URL when the server is down, Then an error message should be displayed', async ({ page }) => {
    const data = await TestDataLoader.load('home_page.data.json');
    const actions = new HomePageActions(page);

    // Given

    // When
    await actions.simulateServerDown(data.serverDownUrl);

    // Then
    await expect(page.locator('[role="alert"], .error-message')).toHaveText(data.errorMessage);
  });
});
