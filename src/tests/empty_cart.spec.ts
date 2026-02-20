import { test, expect } from '@playwright/test';
import { EShopPage } from '../pages/EShopPage';
import { NavigationActions } from '../actions/NavigationActions';
import { TestDataLoader } from '../utils/TestDataLoader';

test.describe('Empty cart validation', () => {
  test('should show empty cart message when cart is empty', async ({ page }) => {
    // Given: User navigates to cart page without adding any products
    const eShopPage = new EShopPage(page);
    const navActions = new NavigationActions(page, eShopPage);
    const cartData = await TestDataLoader.load('cart.data.json');
    await navActions.goToCart();

    // Then: Cart displays empty cart message
    await expect(eShopPage.emptyCartHeadingLocator).toHaveText(cartData.emptyCartMessage);
    await expect(eShopPage.emptyCartPromptLocator).toHaveText(cartData.emptyCartPrompt);
  });
});
