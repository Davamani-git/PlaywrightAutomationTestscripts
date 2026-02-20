import { test, expect } from '@playwright/test';
import { EShopPage } from '../pages/EShopPage';
import { CartActions } from '../actions/CartActions';
import { NavigationActions } from '../actions/NavigationActions';
import { TestDataLoader } from '../utils/TestDataLoader';

test.describe('Add item to cart', () => {
  test('should add Laptop to cart and validate cart details', async ({ page }) => {
    // Given: User is on the products page
    const eShopPage = new EShopPage(page);
    const navActions = new NavigationActions(page, eShopPage);
    await navActions.goToProducts();

    // When: User adds Laptop to cart
    const cartActions = new CartActions(page, eShopPage);
    const cartData = await TestDataLoader.load('cart.data.json');
    await cartActions.addProductToCart(cartData.cartProduct);

    // Then: Cart displays correct product and price
    await navActions.goToCart();
    await expect(eShopPage.cartProductNameLocator).toBeVisible();
    await expect(eShopPage.cartProductPriceLocator).toHaveText(`$${cartData.cartProductPrice}`);
    await expect(eShopPage.cartSubtotalValueLocator).toHaveText(`$${cartData.cartSubtotal}`);
    await expect(eShopPage.cartShippingValueLocator).toHaveText(cartData.cartShipping);
    await expect(eShopPage.cartTotalValueLocator).toHaveText(`$${cartData.cartTotal}`);
  });
});
