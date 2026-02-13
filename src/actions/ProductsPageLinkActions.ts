/**
 * ProductsPageLinkActions: Encapsulates business flows for Products page link.
 * NO assertions here.
 */
import { ProductsPageLink } from '../pages/ProductsPageLink';
import { Page } from '@playwright/test';

export class ProductsPageLinkActions {
  readonly productsPageLink: ProductsPageLink;

  constructor(page: Page) {
    this.productsPageLink = new ProductsPageLink(page);
  }

  async checkProductsLink(): Promise<void> {
    await this.productsPageLink.page.waitForSelector(this.productsPageLink.productsLink, { state: 'visible' });
  }

  async clickProductsLink(): Promise<void> {
    await this.productsPageLink.page.click(this.productsPageLink.productsLink);
  }

  async simulateBrokenProductsLink(): Promise<void> {
    await this.productsPageLink.page.route('**/products', route => route.abort());
  }
}
