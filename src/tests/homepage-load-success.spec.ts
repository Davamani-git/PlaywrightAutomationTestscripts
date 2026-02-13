import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { HomePageActions } from '../actions/HomePageActions';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 1: Home page loads successfully
 */
test.describe('SCRUM-93: Home Page Load - Success', () => {
  test('Given valid home page URL and normal network, When user navigates to home page, Then home page should load successfully', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: valid home page URL and normal network
    const url = homePageData.homePageUrl;

    // When: user navigates to home page
    await actions.navigateToHomePage(url);

    // Then: home page should load successfully
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.mainContainer)).toBeVisible();
    await expect(page.locator(homePage.welcomeTitle)).toBeVisible();
    await expect(page.locator(homePage.navBar)).toBeVisible();
  });
});
