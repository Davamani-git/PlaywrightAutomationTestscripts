/**
 * BDD Spec: Successful home page load under normal conditions
 * SCRUM-93 AC1 TS001
 */
import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Loading', () => {
  test('Given the user opens the browser, When the user enters a valid home page URL and presses Enter or Go, Then the home page should load successfully', async ({ page }) => {
    const data = await TestDataLoader.load('home_page.data.json');
    const actions = new HomePageActions(page);

    // Given
    // (browser is opened automatically by Playwright)

    // When
    await actions.enterUrl(data.validUrl);
    await actions.pressEnterOrGo();

    // Then
    await expect(page.locator('h1')).toHaveText(data.homeTitle);
    await expect(page).not.toHaveSelector('[role="alert"], .error-message');
  });
});
