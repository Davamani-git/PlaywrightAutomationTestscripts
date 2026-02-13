import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 3: Home page loads with slow network/timeout
 */
test.describe('SCRUM-93: Home Page Load - Slow Network', () => {
  test('Given slow network conditions, When user navigates to home page, Then home page should load or show timeout message', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: slow network conditions
    await actions.simulateSlowNetwork();

    // When: user navigates to home page
    const url = homePageData.homePageUrl;
    await actions.navigateToHomePage(url);

    // Then: home page should load or show timeout message
    const homePage = new HomePage(page);
    const isLoaded = await page.locator(homePage.mainContainer).isVisible();
    if (isLoaded) {
      await expect(page.locator(homePage.mainContainer)).toBeVisible();
    } else {
      await expect(page.locator(homePage.errorMessage)).toHaveText(homePageData.errorMessages.timeout);
    }
  });
});
