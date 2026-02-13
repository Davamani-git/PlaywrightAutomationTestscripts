/**
 * BDD Spec: Home page accessed with invalid or malformed URL
 * SCRUM-93 AC1 TS004
 */
import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Loading', () => {
  test('Given the user opens the browser, When the user enters a malformed home page URL, Then an error message should be displayed', async ({ page }) => {
    const data = await TestDataLoader.load('home_page.data.json');
    const actions = new HomePageActions(page);

    // Given

    // When
    await actions.enterMalformedUrl(data.malformedUrl);

    // Then
    await expect(page.locator('[role="alert"], .error-message')).toHaveText(data.errorMessage);
  });
});
