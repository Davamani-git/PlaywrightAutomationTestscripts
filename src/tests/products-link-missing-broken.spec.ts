import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 9: Products link missing/broken
 */
test.describe('SCRUM-93: Products Link - Missing/Broken', () => {
  test('Given broken Products page link, When user clicks Products page link, Then Products page link should not work or error should be shown', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: broken Products page link
    await actions.navigateToHomePage(homePageData.homePageUrl);
    await actions.simulateBrokenProductsLink();

    // When: user clicks Products page link
    await actions.clickProductsLink();

    // Then: Products page link should not work or error should be shown
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.errorMessage)).toHaveText(homePageData.errorMessages.brokenProductsLink);
  });
});
