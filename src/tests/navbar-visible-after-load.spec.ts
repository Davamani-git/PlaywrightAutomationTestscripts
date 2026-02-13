import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 5: Navigation bar visible after home page load
 */
test.describe('SCRUM-93: Navigation Bar - Visibility', () => {
  test('Given home page loads successfully, When page is loaded, Then navigation bar should be visible', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: home page loads successfully
    const url = homePageData.homePageUrl;
    await actions.navigateToHomePage(url);

    // When: page is loaded
    // Then: navigation bar should be visible
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.navBar)).toBeVisible();
  });
});
