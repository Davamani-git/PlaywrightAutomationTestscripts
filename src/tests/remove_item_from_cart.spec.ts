import { test, expect } from '@playwright/test';
import { EShopPage } from '../pages/EShopPage';
import { CartActions } from '../actions/CartActions';
import { NavigationActions } from '../actions/NavigationActions';
import { TestDataLoader } from '../utils/TestDataLoader';

test.describe('Remove item from cart', () => {
  test('should remove Laptop from cart and validate empty cart', async ({ page }) => {
    // Given: User has Laptop in cart
    const eShopPage = new EShopPage(page);
    const navActions = new NavigationActions(page, eShopPage);
    const cartActions = new CartActions(page, eShopPage);
    const cartData = await TestDataLoader.load('cart.data.json');
    await navActions.goToProducts();
    await cartActions.addProductToCart(cartData.cartProduct);
    await navActions.goToCart();

    // When: User removes Laptop from cart
    await cartActions.removeProductFromCart(cartData.cartProduct);

    // Then: Cart displays empty cart message
    await expect(eShopPage.emptyCartHeadingLocator).toHaveText(cartData.emptyCartMessage);
    await expect(eShopPage.emptyCartPromptLocator).toHaveText(cartData.emptyCartPrompt);
  });
});
