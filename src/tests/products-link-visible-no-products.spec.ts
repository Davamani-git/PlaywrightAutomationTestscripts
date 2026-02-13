import { test, expect } from '@playwright/test';
import { HomePageActions } from '../actions/HomePageActions';
import { HomePage } from '../pages/HomePage';
import homePageData from '../test-data/homePageData.json';

/**
 * SCRUM-93 Scenario 10: Products link present when no products exist
 */
test.describe('SCRUM-93: Products Link - No Products', () => {
  test('Given no products exist in system, When home page is loaded, Then Products page link should still be visible', async ({ page }) => {
    const actions = new HomePageActions(page);

    // Given: no products exist in system
    const url = homePageData.noProductsUrl;

    // When: home page is loaded
    await actions.navigateToHomePage(url);

    // Then: Products page link should still be visible
    const homePage = new HomePage(page);
    await expect(page.locator(homePage.productsLink)).toBeVisible();
  });
});
