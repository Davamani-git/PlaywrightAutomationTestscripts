import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 6: Navigation bar fails to render (missing resources)
 */
test.describe('SCRUM-93: Navigation Bar - Missing Resources', () => {
  test('Given missing navigation bar resources, When home page is loaded, Then navigation bar should not be visible or error should be shown', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: missing navigation bar resources
    await actions.simulateMissingNavBarResources();

    // When: home page is loaded
    const url = homePageData.homePageUrl;
    await actions.navigateToHomePage(url);

    // Then: navigation bar should not be visible or error should be shown
    const homePage = new HomePage(page);
    const navBarVisible = await page.locator(homePage.navBar).isVisible();
    if (!navBarVisible) {
      await expect(page.locator(homePage.errorMessage)).toHaveText(homePageData.errorMessages.missingNavBar);
    } else {
      await expect(page.locator(homePage.navBar)).not.toBeVisible();
    }
  });
});
