import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 4: Home page with malformed URL
 */
test.describe('SCRUM-93: Home Page Load - Malformed URL', () => {
  test('Given malformed home page URL, When user navigates to home page, Then error message should be displayed', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: malformed home page URL
    const malformedUrl = homePageData.malformedUrl;

    // When: user navigates to home page
    await actions.navigateToMalformedUrl(malformedUrl);

    // Then: error message should be displayed
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.errorMessage)).toHaveText(homePageData.errorMessages.malformedUrl);
  });
});
