import { Page, Locator } from '@playwright/test';

/**
 * Page Object for E-Shop.
 * Contains only locator definitions. No actions, flows, or assertions.
 */
export class EShopPage {
  // Navigation and header
  shopLogoLocator: Locator;
  homeNavLocator: Locator;
  productsNavLocator: Locator;
  cartNavLocator: Locator;

  // Headings and hero/banner
  mainHeadingLocator: Locator;
  heroSubtitleLocator: Locator;
  heroShopNowButtonLocator: Locator;

  // Cart page with product
  shoppingCartHeadingLocator: Locator;
  cartProductNameLocator: Locator;
  cartProductPriceLocator: Locator;
  cartProductQuantityInputLocator: Locator;
  cartProductRemoveButtonLocator: Locator;
  cartOrderSummaryHeadingLocator: Locator;
  cartSubtotalLabelLocator: Locator;
  cartSubtotalValueLocator: Locator;
  cartShippingLabelLocator: Locator;
  cartShippingValueLocator: Locator;
  cartTotalLabelLocator: Locator;
  cartTotalValueLocator: Locator;
  proceedToCheckoutButtonLocator: Locator;

  // Empty cart page
  emptyCartHeadingLocator: Locator;
  emptyCartPromptLocator: Locator;

  // Product listing page
  productsMainHeadingLocator: Locator;
  productsCategoryAllLocator: Locator;
  productsCategoryElectronicsLocator: Locator;
  productsCategoryHomeLocator: Locator;
  productsCategoryFashionLocator: Locator;
  productsCategorySportsLocator: Locator;

  laptopCardHeadingLocator: Locator;
  laptopCardDescriptionLocator: Locator;
  laptopCardPriceLocator: Locator;
  laptopCardStockLocator: Locator;
  laptopAddToCartButtonLocator: Locator;

  smartphoneCardHeadingLocator: Locator;
  smartphoneCardDescriptionLocator: Locator;
  smartphoneCardPriceLocator: Locator;
  smartphoneCardStockLocator: Locator;
  smartphoneAddToCartButtonLocator: Locator;

  headphonesCardHeadingLocator: Locator;
  headphonesCardDescriptionLocator: Locator;
  headphonesCardPriceLocator: Locator;
  headphonesCardStockLocator: Locator;
  headphonesAddToCartButtonLocator: Locator;

  coffeeMakerCardHeadingLocator: Locator;
  coffeeMakerCardDescriptionLocator: Locator;
  coffeeMakerCardPriceLocator: Locator;
  coffeeMakerCardStockLocator: Locator;
  coffeeMakerAddToCartButtonLocator: Locator;

  backpackCardHeadingLocator: Locator;
  backpackCardDescriptionLocator: Locator;
  backpackCardPriceLocator: Locator;
  backpackCardStockLocator: Locator;
  backpackAddToCartButtonLocator: Locator;

  runningShoesCardHeadingLocator: Locator;
  runningShoesCardDescriptionLocator: Locator;
  runningShoesCardPriceLocator: Locator;
  runningShoesCardStockLocator: Locator;
  runningShoesAddToCartButtonLocator: Locator;

  deskLampCardHeadingLocator: Locator;
  deskLampCardDescriptionLocator: Locator;
  deskLampCardPriceLocator: Locator;
  deskLampCardStockLocator: Locator;
  deskLampAddToCartButtonLocator: Locator;

  waterBottleCardHeadingLocator: Locator;
  waterBottleCardDescriptionLocator: Locator;
  waterBottleCardPriceLocator: Locator;
  waterBottleCardStockLocator: Locator;
  waterBottleAddToCartButtonLocator: Locator;

  // Homepage features
  freeShippingFeatureLocator: Locator;
  freeShippingDetailLocator: Locator;
  securePaymentFeatureLocator: Locator;
  securePaymentDetailLocator: Locator;
  easyReturnsFeatureLocator: Locator;
  easyReturnsDetailLocator: Locator;
  qualityProductsFeatureLocator: Locator;
  qualityProductsDetailLocator: Locator;

  /**
   * Accepts Playwright Page instance and initializes locators.
   * @param page Playwright Page object
   */
  constructor(private readonly page: Page) {
    // Navigation and header
    this.shopLogoLocator = page.getByRole('link', { name: 'E-Shop' });
    this.homeNavLocator = page.getByRole('link', { name: 'Home' });
    this.productsNavLocator = page.getByRole('link', { name: 'Products' });
    this.cartNavLocator = page.getByRole('link', { name: /Cart \(\d+\)/ });

    // Headings and hero/banner
    this.mainHeadingLocator = page.getByRole('heading', { level: 1, name: /Welcome to E-Shop|Shopping Cart|Our Products|Your cart is empty/ });
    this.heroSubtitleLocator = page.getByText('Discover amazing products at great prices');
    this.heroShopNowButtonLocator = page.getByRole('button', { name: 'Shop Now' });

    // Cart page with product
    this.shoppingCartHeadingLocator = page.getByRole('heading', { level: 1, name: 'Shopping Cart' });
    this.cartProductNameLocator = page.getByRole('row', { name: /Laptop/ });
    this.cartProductPriceLocator = page.getByText('$999.99', { exact: false });
    this.cartProductQuantityInputLocator = page.getByLabel('Quantity', { exact: false });
    this.cartProductRemoveButtonLocator = page.getByRole('button', { name: 'Remove' });
    this.cartOrderSummaryHeadingLocator = page.getByRole('heading', { level: 2, name: 'Order Summary' });
    this.cartSubtotalLabelLocator = page.getByText('Subtotal:');
    this.cartSubtotalValueLocator = page.getByText('$999.99', { exact: false });
    this.cartShippingLabelLocator = page.getByText('Shipping:');
    this.cartShippingValueLocator = page.getByText('Free');
    this.cartTotalLabelLocator = page.getByText('Total:');
    this.cartTotalValueLocator = page.getByText('$999.99', { exact: false });
    this.proceedToCheckoutButtonLocator = page.getByRole('button', { name: 'Proceed to Checkout' });

    // Empty cart page
    this.emptyCartHeadingLocator = page.getByRole('heading', { level: 1, name: 'Your cart is empty' });
    this.emptyCartPromptLocator = page.getByText('Add some products to get started!');

    // Product listing page
    this.productsMainHeadingLocator = page.getByRole('heading', { level: 1, name: 'Our Products' });
    this.productsCategoryAllLocator = page.getByRole('button', { name: 'All' });
    this.productsCategoryElectronicsLocator = page.getByRole('button', { name: 'Electronics' });
    this.productsCategoryHomeLocator = page.getByRole('button', { name: 'Home' });
    this.productsCategoryFashionLocator = page.getByRole('button', { name: 'Fashion' });
    this.productsCategorySportsLocator = page.getByRole('button', { name: 'Sports' });

    this.laptopCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Laptop' });
    this.laptopCardDescriptionLocator = page.getByText('High-performance laptop for professionals');
    this.laptopCardPriceLocator = page.getByText('$999.99', { exact: false });
    this.laptopCardStockLocator = page.getByText('In Stock: 10');
    this.laptopAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Laptop' });

    this.smartphoneCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Smartphone' });
    this.smartphoneCardDescriptionLocator = page.getByText('Latest model with amazing features');
    this.smartphoneCardPriceLocator = page.getByText('$699.99', { exact: false });
    this.smartphoneCardStockLocator = page.getByText('In Stock: 15');
    this.smartphoneAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Smartphone' });

    this.headphonesCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Headphones' });
    this.headphonesCardDescriptionLocator = page.getByText('Wireless noise-cancelling headphones');
    this.headphonesCardPriceLocator = page.getByText('$199.99', { exact: false });
    this.headphonesCardStockLocator = page.getByText('In Stock: 20');
    this.headphonesAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Headphones' });

    this.coffeeMakerCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Coffee Maker' });
    this.coffeeMakerCardDescriptionLocator = page.getByText('Programmable coffee maker');
    this.coffeeMakerCardPriceLocator = page.getByText('$79.99', { exact: false });
    this.coffeeMakerCardStockLocator = page.getByText('In Stock: 25');
    this.coffeeMakerAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Coffee Maker' });

    this.backpackCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Backpack' });
    this.backpackCardDescriptionLocator = page.getByText('Durable travel backpack');
    this.backpackCardPriceLocator = page.getByText('$49.99', { exact: false });
    this.backpackCardStockLocator = page.getByText('In Stock: 30');
    this.backpackAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Backpack' });

    this.runningShoesCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Running Shoes' });
    this.runningShoesCardDescriptionLocator = page.getByText('Comfortable athletic shoes');
    this.runningShoesCardPriceLocator = page.getByText('$89.99', { exact: false });
    this.runningShoesCardStockLocator = page.getByText('In Stock: 18');
    this.runningShoesAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Running Shoes' });

    this.deskLampCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Desk Lamp' });
    this.deskLampCardDescriptionLocator = page.getByText('LED desk lamp with adjustable brightness');
    this.deskLampCardPriceLocator = page.getByText('$34.99', { exact: false });
    this.deskLampCardStockLocator = page.getByText('In Stock: 22');
    this.deskLampAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Desk Lamp' });

    this.waterBottleCardHeadingLocator = page.getByRole('heading', { level: 2, name: 'Water Bottle' });
    this.waterBottleCardDescriptionLocator = page.getByText('Insulated stainless steel water bottle');
    this.waterBottleCardPriceLocator = page.getByText('$24.99', { exact: false });
    this.waterBottleCardStockLocator = page.getByText('In Stock: 40');
    this.waterBottleAddToCartButtonLocator = page.getByRole('button', { name: 'Add to Cart', exact: false }).filter({ hasText: 'Water Bottle' });

    // Homepage features
    this.freeShippingFeatureLocator = page.getByText('Free Shipping');
    this.freeShippingDetailLocator = page.getByText('On orders over $50');
    this.securePaymentFeatureLocator = page.getByText('Secure Payment');
    this.securePaymentDetailLocator = page.getByText('100% secure transactions');
    this.easyReturnsFeatureLocator = page.getByText('Easy Returns');
    this.easyReturnsDetailLocator = page.getByText('30-day return policy');
    this.qualityProductsFeatureLocator = page.getByText('Quality Products');
    this.qualityProductsDetailLocator = page.getByText('Carefully curated selection');
  }
}
