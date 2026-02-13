import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 2: Home page fails to load (server error)
 */
test.describe('SCRUM-93: Home Page Load - Server Error', () => {
  test('Given server is down, When user navigates to home page, Then error message should be displayed', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: server is down
    const url = homePageData.serverErrorUrl;

    // When: user navigates to home page
    await actions.simulateServerError(url);

    // Then: error message should be displayed
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.errorMessage)).toHaveText(homePageData.errorMessages.serverError);
  });
});
