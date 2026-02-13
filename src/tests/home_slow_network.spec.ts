import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Home Page Slow Network', () => {
  test('Given slow network, When user navigates, Then home page should load or show timeout message', async ({ page }) => {
    const data = await TestDataLoader.load('home.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.simulateSlowNetwork();
    await actions.navigateToHomePage(data.validUrl);

    // When
    // (Page loaded or timeout)

    // Then
    const loaded = await page.getByRole('heading', { level: 1, name: 'Welcome to E-Shop' }).isVisible();
    const timeout = await page.getByText('Timeout').isVisible();
    expect(loaded || timeout).toBeTruthy();
  });
});
