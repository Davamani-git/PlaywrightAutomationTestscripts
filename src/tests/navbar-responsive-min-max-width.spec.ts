import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 7: Navigation bar responsive at min/max width
 */
test.describe('SCRUM-93: Navigation Bar - Responsiveness', () => {
  test('Given minimum supported screen width, When page is loaded, Then navigation bar should be visible or adapt responsively', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: minimum supported screen width
    await actions.resizeWindow(homePageData.screenSizes.minWidth, homePageData.screenSizes.minHeight);

    // When: page is loaded
    await actions.navigateToHomePage(homePageData.homePageUrl);

    // Then: navigation bar should be visible or adapt responsively
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.responsiveNavBar)).toBeVisible();
  });

  test('Given maximum supported screen width, When page is loaded, Then navigation bar should be visible or adapt responsively', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: maximum supported screen width
    await actions.resizeWindow(homePageData.screenSizes.maxWidth, homePageData.screenSizes.maxHeight);

    // When: page is loaded
    await actions.navigateToHomePage(homePageData.homePageUrl);

    // Then: navigation bar should be visible or adapt responsively
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.responsiveNavBar)).toBeVisible();
  });
});
