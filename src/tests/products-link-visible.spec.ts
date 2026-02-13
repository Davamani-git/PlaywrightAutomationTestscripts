import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 8: Products page link visible
 */
test.describe('SCRUM-93: Products Link - Visible', () => {
  test('Given home page loads successfully, When page is loaded, Then Products page link should be visible', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: home page loads successfully
    await actions.navigateToHomePage(homePageData.homePageUrl);

    // When: page is loaded
    const homePage = new HomePage(page);

    // Then: Products page link should be visible
    await expect(page.locator(homePage.productsLink)).toBeVisible();
  });
});
